import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { parseExcelFile, processClimateData } from "./dataProcessor";
import { computeTercilesForUpload } from "./tercileCalculator";
import { calculateTotalBasedCarbonPrice as computeCarbonPrice } from "./carbonPriceCalculator";
import { runFullAnalysis, type AnalysisParameters, type CompanyWithTimeSeries, mapGeographyToRegion } from "./portfolioAnalyzerV2";
import { storagePut } from "./storage";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  data: router({
    /**
     * Upload and process Excel file
     */
    upload: publicProcedure
      .input(z.object({
        filename: z.string(),
        fileBuffer: z.string(), // Base64 encoded
      }))
      .mutation(async ({ input }) => {
        const userId = 1; // Default user ID for public access

        // Decode base64 buffer
        const buffer = Buffer.from(input.fileBuffer, 'base64');

        // Upload to S3
        const fileKey = `uploads/${userId}/${Date.now()}-${input.filename}`;
        const { url: fileUrl } = await storagePut(fileKey, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Create upload record
        const uploadId = await db.createDataUpload({
          userId,
          filename: input.filename,
          fileKey,
          fileUrl,
          status: 'processing',
        });

        // Process file asynchronously
        (async () => {
          try {
            console.log(`[Upload ${uploadId}] Parsing Excel file...`);
            // Parse Excel file
            const rawData = parseExcelFile(buffer);

            console.log(`[Upload ${uploadId}] Processing climate data...`);
            // Process data
            const processedData = processClimateData(rawData);
            console.log(`[Upload ${uploadId}] Parsed ${processedData.stats.totalCompanies} companies, ${processedData.timeSeries.length} time series records.`);

            // Insert companies
            console.log(`[Upload ${uploadId}] Inserting ${processedData.companies.length} companies...`);
            for (const company of processedData.companies) {
              await db.upsertCompany(company);
            }
            console.log(`[Upload ${uploadId}] Companies inserted.`);

            // Get company IDs
            const companies = await db.getAllCompanies();
            const isinToId = new Map(companies.map(c => [c.isin, c.id!]));

            // Insert time series with correct company IDs in batches
            console.log(`[Upload ${uploadId}] Preparing ${processedData.timeSeries.length} time series records...`);
            const timeSeriesWithIds = processedData.timeSeries
              .map(ts => {
                const companyIsin = processedData.companies[ts.companyId - 1]?.isin;
                if (!companyIsin) return null;
                const actualCompanyId = isinToId.get(companyIsin);
                if (!actualCompanyId) return null;
                return { ...ts, companyId: actualCompanyId };
              })
              .filter((ts): ts is NonNullable<typeof ts> => ts !== null);

            console.log(`[Upload ${uploadId}] Inserting ${timeSeriesWithIds.length} time series records in batches...`);
            await db.insertTimeSeriesBatch(timeSeriesWithIds);
            console.log(`[Upload ${uploadId}] Time series insertion completed.`);

            // Compute tercile assignments
            console.log(`[Upload ${uploadId}] Computing tercile assignments...`);
            await computeTercilesForUpload(uploadId);
            console.log(`[Upload ${uploadId}] Tercile computation completed.`);

            // Update upload status
            console.log(`[Upload ${uploadId}] Processing completed successfully.`);
            await db.updateDataUploadStatus(uploadId, 'completed', {
              companiesCount: processedData.stats.totalCompanies,
              timePeriodsCount: processedData.stats.totalTimePeriods,
            });
          } catch (error) {
            console.error('Error processing upload:', error);
            await db.updateDataUploadStatus(uploadId, 'failed', {
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        })();

        return { uploadId, status: 'processing' };
      }),

    /**
     * Get upload history
     */
    getUploads: publicProcedure.query(async () => {
      // Return all uploads (no user filtering)
      const allCompanies = await db.getAllCompanies();
      return await db.getDataUploadsByUser(allCompanies.length > 0 ? 1 : 0); // Return all if data exists
    }),

    /**
     * Get upload status
     */
    getUploadStatus: publicProcedure
      .input(z.object({ uploadId: z.number() }))
      .query(async ({ input }) => {
        return await db.getDataUploadById(input.uploadId);
      }),
  }),

  analysis: router({
    /**
     * Run portfolio analysis
     */
    analyze: publicProcedure
      .input(z.object({
        uploadId: z.number(),
        parameters: z.object({
          includeScope3: z.boolean().default(false),
          methodology: z.enum(['relative', 'dcf']).default('relative'),
          sectorGranularity: z.enum(['sector', 'industry']).default('sector'),
          thresholds: z.object({
            tertileApproach: z.boolean().default(true),
          }),
        }),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { uploadId, parameters, startDate, endDate } = input;

        // Get all companies and their time series
        const companies = await db.getAllCompanies();
        const companiesWithData: CompanyWithTimeSeries[] = [];

        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;

        for (const company of companies) {
          const timeSeries = await db.getTimeSeriesByCompany(company.id!, start, end);
          companiesWithData.push({ company, timeSeries });
        }

        // Get unique dates
        const dateSet = new Set<number>();
        for (const { timeSeries } of companiesWithData) {
          for (const ts of timeSeries) {
            dateSet.add(ts.date.getTime());
          }
        }
        const dates = Array.from(dateSet).map(t => new Date(t)).sort((a, b) => a.getTime() - b.getTime());

        // Get unique sectors/industries and map geographies to regions
        const sectorField = parameters.sectorGranularity === 'industry' ? 'industry' : 'sector';
        const sectors = Array.from(new Set(companies.map(c => c[sectorField]).filter(Boolean))) as string[];
        const rawGeographies = Array.from(new Set(companies.map(c => c.geography).filter(Boolean))) as string[];
        const geographies = Array.from(new Set(rawGeographies.map(g => mapGeographyToRegion(g))));

        // Run analysis
        const results = runFullAnalysis(
          companiesWithData,
          dates,
          parameters as AnalysisParameters,
          { sectors, geographies }
        );

        // Delete old results for this upload
        await db.deleteAnalysisResultsByUpload(uploadId);

        // Insert new results
        for (const result of results) {
          await db.insertAnalysisResult({
            uploadId,
            investmentType: result.investmentType,
            date: result.date,
            geography: result.geography ?? null,
            sector: result.sector ?? null,
            avgCarbonIntensity: result.avgCarbonIntensity,
            avgPeRatio: result.avgPeRatio,
            valuationPremium: result.carbonRiskDiscount,
            impliedCarbonPrice: result.impliedCarbonPrice,
            impliedDecarbRate: result.impliedDecarbRate,
            portfolioSize: result.portfolioSize,
          });
        }

        return { success: true, resultsCount: results.length };
      }),

    /**
     * Get analysis results
     */
    getResults: publicProcedure
      .input(z.object({
        uploadId: z.number(),
        investmentType: z.enum(['low_carbon', 'decarbonizing', 'solutions']).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        geography: z.string().optional(),
        sector: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { uploadId, investmentType, startDate, endDate, geography, sector } = input;

        return await db.getAnalysisResults(
          uploadId,
          investmentType,
          startDate ? new Date(startDate) : undefined,
          endDate ? new Date(endDate) : undefined,
          geography,
          sector
        );
      }),

    /**
     * Get available dimensions (sectors, geographies)
     */
    getDimensions: publicProcedure.query(async () => {
      const companies = await db.getAllCompanies();

      const sectors = Array.from(new Set(companies.map(c => c.sector).filter(Boolean))).sort();
      const geographies = Array.from(new Set(companies.map(c => c.geography).filter(Boolean))).sort();

      return { sectors, geographies };
    }),

    /**
     * Get date range
     */
    getDateRange: publicProcedure.query(async () => {
      return await db.getTimeSeriesDateRange();
    }),

    /**
     * Get P/E ratio comparison for top vs bottom tercile carbon intensity companies
     */
    getPETercileComparison: publicProcedure
      .input(z.object({
        uploadId: z.number(),
        method: z.enum(['absolute', 'sector_relative']).default('sector_relative'),
        includeScope3: z.boolean().default(false),
        winsorize: z.boolean().default(true),
        winsorizePercentile: z.number().default(5),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { uploadId, method, includeScope3, winsorize, winsorizePercentile, startDate, endDate } = input;

        // Get all companies and their time series
        const companies = await db.getAllCompanies();
        const companiesWithData: CompanyWithTimeSeries[] = [];

        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;

        for (const company of companies) {
          const timeSeries = await db.getTimeSeriesByCompany(company.id!, start, end);
          companiesWithData.push({ company, timeSeries });
        }

        // Get unique dates
        const dateSet = new Set<number>();
        for (const { timeSeries } of companiesWithData) {
          for (const ts of timeSeries) {
            dateSet.add(ts.date.getTime());
          }
        }
        const dates = Array.from(dateSet).map(t => new Date(t)).sort((a, b) => a.getTime() - b.getTime());

        // Import helper functions
        const { calculateCarbonIntensity, calculatePortfolioMetrics, winsorize: winsorizeValues } = await import('./portfolioAnalyzerV2');

        const results = [];

        for (const date of dates) {
          // Calculate carbon intensity for all companies at this date
          const companiesWithIntensity = companiesWithData
            .map(({ company, timeSeries }) => {
              const ts = timeSeries.find(t => t.date.getTime() === date.getTime());
              if (!ts || !ts.priceEarnings) return null;

              const scope1 = ts.scope1Emissions || 0;
              const scope2 = ts.scope2Emissions || 0;
              const scope3 = includeScope3 ? (ts.scope3Emissions || 0) : 0;
              const totalEmissions = scope1 + scope2 + scope3;
              const marketCap = ts.marketCap;

              if (!marketCap || marketCap === 0 || totalEmissions === 0) return null;
              const intensity = totalEmissions / (marketCap / 1_000_000); // tCO2 per million dollars
              if (intensity === null || intensity === 0) return null;

              return { company, timeSeries, intensity, pe: ts.priceEarnings };
            })
            .filter(Boolean) as Array<{ company: any; timeSeries: any[]; intensity: number; pe: number }>;

          if (companiesWithIntensity.length < 10) continue;

          let topTercile: typeof companiesWithIntensity;
          let bottomTercile: typeof companiesWithIntensity;

          if (method === 'absolute') {
            // Absolute terciles across all companies
            const sorted = [...companiesWithIntensity].sort((a, b) => a.intensity - b.intensity);
            const tercileSize = Math.floor(sorted.length / 3);
            bottomTercile = sorted.slice(0, tercileSize); // Lowest intensity
            topTercile = sorted.slice(-tercileSize); // Highest intensity
          } else {
            // Sector-relative terciles
            const bySector = new Map<string, typeof companiesWithIntensity>();
            for (const item of companiesWithIntensity) {
              const sector = item.company.sector || 'Unknown';
              if (!bySector.has(sector)) bySector.set(sector, []);
              bySector.get(sector)!.push(item);
            }

            topTercile = [];
            bottomTercile = [];

            for (const [sector, items] of Array.from(bySector.entries())) {
              if (items.length < 3) continue;
              const sorted = [...items].sort((a, b) => a.intensity - b.intensity);
              const tercileSize = Math.floor(sorted.length / 3);
              bottomTercile.push(...sorted.slice(0, tercileSize));
              topTercile.push(...sorted.slice(-tercileSize));
            }
          }

          if (topTercile.length === 0 || bottomTercile.length === 0) continue;

          // Calculate average P/E with optional winsorization
          let topPEs = topTercile.map(t => t.pe);
          let bottomPEs = bottomTercile.map(t => t.pe);

          if (winsorize && topPEs.length > 10 && bottomPEs.length > 10) {
            topPEs = winsorizeValues(topPEs, winsorizePercentile, 100 - winsorizePercentile);
            bottomPEs = winsorizeValues(bottomPEs, winsorizePercentile, 100 - winsorizePercentile);
          }

          const avgTopPE = topPEs.reduce((sum, pe) => sum + pe, 0) / topPEs.length;
          const avgBottomPE = bottomPEs.reduce((sum, pe) => sum + pe, 0) / bottomPEs.length;

          results.push({
            date: date.toISOString(),
            topTercilePE: avgTopPE,
            bottomTercilePE: avgBottomPE,
            topTercileCount: topTercile.length,
            bottomTercileCount: bottomTercile.length,
            valuationPremium: (avgBottomPE / avgTopPE - 1) * 100, // % premium for low-carbon
          });
        }

        return results;
      }),

    /**
     * Calculate rigorous implied carbon price using total market cap, profit, and emissions
     * Formula: (Top Tercile Net Profit - (Top Tercile Market Cap / Bottom Tercile P/E)) / Top Tercile Emissions
     */
    calculateTotalBasedCarbonPrice: publicProcedure
      .input(z.object({
        uploadId: z.number(),
        method: z.enum(['absolute', 'sector_relative']).default('sector_relative'),
        includeScope3: z.boolean().default(false),
        winsorize: z.boolean().default(true),
        winsorizePercentile: z.number().min(0).max(50).default(5),
      }))
      .query(async ({ input }) => {
        const { uploadId, method, includeScope3, winsorize, winsorizePercentile } = input;
        return await computeCarbonPrice(uploadId, method, includeScope3, winsorize, winsorizePercentile);
      }),
  }),

  export: router({
    /**
     * Export analysis results to CSV
     */
    exportResults: publicProcedure
      .input(z.object({
        uploadId: z.number(),
        investmentType: z.enum(['low_carbon', 'decarbonizing', 'solutions']).optional(),
      }))
      .query(async ({ input }) => {
        const results = await db.getAnalysisResults(input.uploadId, input.investmentType);

        // Convert to CSV
        const headers = [
          'Date',
          'Investment Type',
          'Geography',
          'Sector',
          'Avg Carbon Intensity',
          'Avg P/E Ratio',
          'Valuation Premium',
          'Implied Carbon Price',
          'Implied Decarb Rate',
          'Portfolio Size',
        ];

        const rows = results.map(r => [
          r.date.toISOString().split('T')[0],
          r.investmentType,
          r.geography || 'All',
          r.sector || 'All',
          r.avgCarbonIntensity?.toFixed(2) || '',
          r.avgPeRatio?.toFixed(2) || '',
          r.valuationPremium?.toFixed(4) || '',
          r.impliedCarbonPrice?.toFixed(2) || '',
          r.impliedDecarbRate?.toFixed(4) || '',
          r.portfolioSize?.toString() || '',
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

        return { csv, filename: `climate-analysis-${input.uploadId}.csv` };
      }),
  }),
});

export type AppRouter = typeof appRouter;
