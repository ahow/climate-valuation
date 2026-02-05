import { getDb } from "./db";
import { companyTerciles, carbonPriceCache, timeSeries, InsertCarbonPriceCache } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface CarbonPriceResult {
  date: Date;
  topTercileEmissions: number;
  topTercileProfit: number;
  topTercileMarketCap: number;
  topTercilePeRatio: number;
  topTercileCompanyCount: number;
  bottomTercileEmissions: number;
  bottomTercileProfit: number;
  bottomTercileMarketCap: number;
  bottomTercilePeRatio: number;
  bottomTercileCompanyCount: number;
  impliedCarbonPrice: number;
}

/**
 * Calculate total-based carbon price using pre-computed terciles
 */
export async function calculateTotalBasedCarbonPrice(
  uploadId: number,
  method: "absolute" | "sector_relative",
  includeScope3: boolean,
  winsorize: boolean,
  winsorizePercentile: number
): Promise<CarbonPriceResult[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const includeScope3Int = includeScope3 ? 1 : 0;
  const winsorizeInt = winsorize ? 1 : 0;
  
  // Check cache first
  const cached = await db
    .select()
    .from(carbonPriceCache)
    .where(
      and(
        eq(carbonPriceCache.uploadId, uploadId),
        eq(carbonPriceCache.method, method),
        eq(carbonPriceCache.includeScope3, includeScope3Int),
        eq(carbonPriceCache.winsorize, winsorizeInt),
        eq(carbonPriceCache.winsorizePercentile, winsorizePercentile)
      )
    );
  
  if (cached.length > 0) {
    console.log(`[CarbonPrice] Using cached results (${cached.length} dates)`);
    return cached.map(row => ({
      date: row.date,
      topTercileEmissions: row.topTercileEmissions || 0,
      topTercileProfit: row.topTercileProfit || 0,
      topTercileMarketCap: row.topTercileMarketCap || 0,
      topTercilePeRatio: row.topTercilePeRatio || 0,
      topTercileCompanyCount: row.topTercileCompanyCount || 0,
      bottomTercileEmissions: row.bottomTercileEmissions || 0,
      bottomTercileProfit: row.bottomTercileProfit || 0,
      bottomTercileMarketCap: row.bottomTercileMarketCap || 0,
      bottomTercilePeRatio: row.bottomTercilePeRatio || 0,
      bottomTercileCompanyCount: row.bottomTercileCompanyCount || 0,
      impliedCarbonPrice: row.impliedCarbonPrice || 0,
    }));
  }
  
  console.log(`[CarbonPrice] Computing from pre-computed terciles...`);
  
  // Load pre-computed terciles
  const terciles = await db
    .select()
    .from(companyTerciles)
    .where(
      and(
        eq(companyTerciles.uploadId, uploadId),
        eq(companyTerciles.method, method),
        eq(companyTerciles.includeScope3, includeScope3Int)
      )
    );
  
  if (terciles.length === 0) {
    console.log(`[CarbonPrice] No terciles found for upload ${uploadId}`);
    return [];
  }
  
  // Group terciles by date
  const tercilesByDate = new Map<string, typeof terciles>();
  for (const tercile of terciles) {
    const dateKey = tercile.date.toISOString();
    if (!tercilesByDate.has(dateKey)) {
      tercilesByDate.set(dateKey, []);
    }
    tercilesByDate.get(dateKey)!.push(tercile);
  }
  
  const results: CarbonPriceResult[] = [];
  const cacheRecords: InsertCarbonPriceCache[] = [];
  
  // Process each date
  for (const [dateKey, dateTerciles] of Array.from(tercilesByDate.entries())) {
    const date = new Date(dateKey);
    
    // Get company IDs for top and bottom terciles
    const topTercileCompanyIds = dateTerciles
      .filter(t => t.tercileAssignment === "top")
      .map(t => t.companyId);
    
    const bottomTercileCompanyIds = dateTerciles
      .filter(t => t.tercileAssignment === "bottom")
      .map(t => t.companyId);
    
    if (topTercileCompanyIds.length === 0 || bottomTercileCompanyIds.length === 0) {
      continue;
    }
    
    // Load time series data for these companies at this date
    const topTsData = await db
      .select()
      .from(timeSeries)
      .where(
        and(
          eq(timeSeries.date, date),
          // Note: inArray requires a non-empty array, already checked above
        )
      );
    
    // Filter to only the companies in our terciles
    const topTs = topTsData.filter(ts => topTercileCompanyIds.includes(ts.companyId));
    const bottomTs = topTsData.filter(ts => bottomTercileCompanyIds.includes(ts.companyId));
    
    // Calculate totals for top tercile
    const topValidTs = topTs.filter(ts => 
      ts.marketCap != null && ts.netProfit != null &&
      (ts.scope1Emissions != null || ts.scope2Emissions != null)
    );
    
    if (topValidTs.length === 0) continue;
    
    let topMarketCaps = topValidTs.map(ts => ts.marketCap!);
    let topProfits = topValidTs.map(ts => ts.netProfit!);
    let topEmissions = topValidTs.map(ts => {
      const scope1 = ts.scope1Emissions || 0;
      const scope2 = ts.scope2Emissions || 0;
      const scope3 = includeScope3 ? (ts.scope3Emissions || 0) : 0;
      return scope1 + scope2 + scope3;
    });
    let topPeRatios = topValidTs.map(ts => ts.priceEarnings || 0).filter(pe => pe > 0);
    
    // Apply winsorization if enabled
    if (winsorize && topMarketCaps.length > 10) {
      topMarketCaps = winsorizeArray(topMarketCaps, winsorizePercentile);
      topProfits = winsorizeArray(topProfits, winsorizePercentile);
      topEmissions = winsorizeArray(topEmissions, winsorizePercentile);
      topPeRatios = winsorizeArray(topPeRatios, winsorizePercentile);
    }
    
    const topTotalMarketCap = topMarketCaps.reduce((sum, v) => sum + v, 0);
    const topTotalProfit = topProfits.reduce((sum, v) => sum + v, 0);
    const topTotalEmissions = topEmissions.reduce((sum, v) => sum + v, 0);
    const topAvgPe = topPeRatios.length > 0 ? topPeRatios.reduce((sum, v) => sum + v, 0) / topPeRatios.length : 0;
    const topPeRatio = topTotalProfit > 0 ? topTotalMarketCap / topTotalProfit : 0;
    
    // Calculate totals for bottom tercile
    const bottomValidTs = bottomTs.filter(ts => 
      ts.marketCap != null && ts.netProfit != null &&
      (ts.scope1Emissions != null || ts.scope2Emissions != null)
    );
    
    if (bottomValidTs.length === 0) continue;
    
    let bottomMarketCaps = bottomValidTs.map(ts => ts.marketCap!);
    let bottomProfits = bottomValidTs.map(ts => ts.netProfit!);
    let bottomEmissions = bottomValidTs.map(ts => {
      const scope1 = ts.scope1Emissions || 0;
      const scope2 = ts.scope2Emissions || 0;
      const scope3 = includeScope3 ? (ts.scope3Emissions || 0) : 0;
      return scope1 + scope2 + scope3;
    });
    let bottomPeRatios = bottomValidTs.map(ts => ts.priceEarnings || 0).filter(pe => pe > 0);
    
    // Apply winsorization if enabled
    if (winsorize && bottomMarketCaps.length > 10) {
      bottomMarketCaps = winsorizeArray(bottomMarketCaps, winsorizePercentile);
      bottomProfits = winsorizeArray(bottomProfits, winsorizePercentile);
      bottomEmissions = winsorizeArray(bottomEmissions, winsorizePercentile);
      bottomPeRatios = winsorizeArray(bottomPeRatios, winsorizePercentile);
    }
    
    const bottomTotalMarketCap = bottomMarketCaps.reduce((sum, v) => sum + v, 0);
    const bottomTotalProfit = bottomProfits.reduce((sum, v) => sum + v, 0);
    const bottomTotalEmissions = bottomEmissions.reduce((sum, v) => sum + v, 0);
    const bottomAvgPe = bottomPeRatios.length > 0 ? bottomPeRatios.reduce((sum, v) => sum + v, 0) / bottomPeRatios.length : 0;
    const bottomPeRatio = bottomTotalProfit > 0 ? bottomTotalMarketCap / bottomTotalProfit : 0;
    
    // Calculate implied carbon price
    // Formula: (Top Net Profit - (Top Market Cap / Bottom P/E)) / Top Emissions
    // Result is in $M/tCO2, multiply by 1,000,000 to get $/tCO2
    let impliedCarbonPrice = 0;
    if (bottomPeRatio > 0 && topTotalEmissions > 0) {
      const adjustedTopProfit = topTotalMarketCap / bottomPeRatio;
      const profitDifference = topTotalProfit - adjustedTopProfit;
      impliedCarbonPrice = (profitDifference / topTotalEmissions) * 1_000_000; // Convert $M/tCO2 to $/tCO2
    }
    
    const result: CarbonPriceResult = {
      date,
      topTercileEmissions: topTotalEmissions,
      topTercileProfit: topTotalProfit,
      topTercileMarketCap: topTotalMarketCap,
      topTercilePeRatio: topPeRatio,
      topTercileCompanyCount: topValidTs.length,
      bottomTercileEmissions: bottomTotalEmissions,
      bottomTercileProfit: bottomTotalProfit,
      bottomTercileMarketCap: bottomTotalMarketCap,
      bottomTercilePeRatio: bottomPeRatio,
      bottomTercileCompanyCount: bottomValidTs.length,
      impliedCarbonPrice,
    };
    
    results.push(result);
    
    // Prepare cache record
    cacheRecords.push({
      uploadId,
      date,
      method,
      includeScope3: includeScope3Int,
      winsorize: winsorizeInt,
      winsorizePercentile,
      topTercileEmissions: topTotalEmissions,
      topTercileProfit: topTotalProfit,
      topTercileMarketCap: topTotalMarketCap,
      topTercilePeRatio: topPeRatio,
      topTercileCompanyCount: topValidTs.length,
      bottomTercileEmissions: bottomTotalEmissions,
      bottomTercileProfit: bottomTotalProfit,
      bottomTercileMarketCap: bottomTotalMarketCap,
      bottomTercilePeRatio: bottomPeRatio,
      bottomTercileCompanyCount: bottomValidTs.length,
      impliedCarbonPrice,
    });
  }
  
  // Cache results for future queries
  if (cacheRecords.length > 0) {
    console.log(`[CarbonPrice] Caching ${cacheRecords.length} results...`);
    const chunkSize = 100;
    for (let i = 0; i < cacheRecords.length; i += chunkSize) {
      const chunk = cacheRecords.slice(i, i + chunkSize);
      await db.insert(carbonPriceCache).values(chunk);
    }
  }
  
  console.log(`[CarbonPrice] Computed ${results.length} carbon price results`);
  return results;
}

/**
 * Winsorize an array of values
 */
function winsorizeArray(values: number[], percentile: number): number[] {
  if (values.length === 0) return values;
  
  const sorted = [...values].sort((a, b) => a - b);
  const lowerIdx = Math.floor(values.length * percentile / 100);
  const upperIdx = Math.floor(values.length * (100 - percentile) / 100) - 1;
  
  const lowerBound = sorted[Math.max(0, lowerIdx)];
  const upperBound = sorted[Math.min(sorted.length - 1, upperIdx)];
  
  return values.map(v => Math.max(lowerBound, Math.min(upperBound, v)));
}
