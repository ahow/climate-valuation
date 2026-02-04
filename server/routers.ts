import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { parseExcelFile, processClimateData } from "./dataProcessor";
import { runFullAnalysis, type ClassificationThresholds, type CompanyWithTimeSeries } from "./portfolioAnalyzer";
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
    upload: protectedProcedure
      .input(z.object({
        filename: z.string(),
        fileBuffer: z.string(), // Base64 encoded
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;

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
            // Parse Excel file
            const rawData = parseExcelFile(buffer);

            // Process data
            const processedData = processClimateData(rawData);

            // Insert companies
            for (const company of processedData.companies) {
              await db.upsertCompany(company);
            }

            // Get company IDs
            const companies = await db.getAllCompanies();
            const isinToId = new Map(companies.map(c => [c.isin, c.id!]));

            // Insert time series with correct company IDs
            for (const ts of processedData.timeSeries) {
              const companyIsin = processedData.companies[ts.companyId - 1]?.isin;
              if (!companyIsin) continue;

              const actualCompanyId = isinToId.get(companyIsin);
              if (!actualCompanyId) continue;

              await db.insertTimeSeries({
                ...ts,
                companyId: actualCompanyId,
              });
            }

            // Update upload status
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
    getUploads: protectedProcedure.query(async ({ ctx }) => {
      return await db.getDataUploadsByUser(ctx.user.id);
    }),

    /**
     * Get upload status
     */
    getUploadStatus: protectedProcedure
      .input(z.object({ uploadId: z.number() }))
      .query(async ({ input }) => {
        return await db.getDataUploadById(input.uploadId);
      }),
  }),

  analysis: router({
    /**
     * Run portfolio analysis
     */
    analyze: protectedProcedure
      .input(z.object({
        uploadId: z.number(),
        thresholds: z.object({
          lowCarbonPercentile: z.number().default(25),
          decarbonizingTarget: z.number().default(-0.5),
          solutionsScore: z.number().default(2.0),
        }),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { uploadId, thresholds, startDate, endDate } = input;

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

        // Get unique sectors and geographies
        const sectors = Array.from(new Set(companies.map(c => c.sector).filter(Boolean))) as string[];
        const geographies = Array.from(new Set(companies.map(c => c.geography).filter(Boolean))) as string[];

        // Run analysis
        const results = runFullAnalysis(
          companiesWithData,
          dates,
          thresholds as ClassificationThresholds,
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
            valuationPremium: result.valuationPremium,
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
    getResults: protectedProcedure
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
    getDimensions: protectedProcedure.query(async () => {
      const companies = await db.getAllCompanies();

      const sectors = Array.from(new Set(companies.map(c => c.sector).filter(Boolean))).sort();
      const geographies = Array.from(new Set(companies.map(c => c.geography).filter(Boolean))).sort();

      return { sectors, geographies };
    }),

    /**
     * Get date range
     */
    getDateRange: protectedProcedure.query(async () => {
      return await db.getTimeSeriesDateRange();
    }),
  }),

  export: router({
    /**
     * Export analysis results to CSV
     */
    exportResults: protectedProcedure
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
