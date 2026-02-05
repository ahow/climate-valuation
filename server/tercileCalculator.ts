import { getDb } from "./db";
import { companies, timeSeries, companyTerciles, InsertCompanyTercile } from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Calculate carbon intensity for a company at a specific date
 */
function calculateCarbonIntensity(
  scope1: number | null,
  scope2: number | null,
  scope3: number | null,
  marketCap: number | null,
  includeScope3: boolean
): number | null {
  if (!marketCap || marketCap <= 0) return null;
  
  const scope1Val = scope1 || 0;
  const scope2Val = scope2 || 0;
  const scope3Val = includeScope3 ? (scope3 || 0) : 0;
  
  const totalEmissions = scope1Val + scope2Val + scope3Val;
  if (totalEmissions === 0) return null;
  
  // Carbon intensity = tCO2 / $M market cap
  return totalEmissions / marketCap;
}

/**
 * Assign terciles based on carbon intensity values
 */
function assignTerciles(
  intensities: Array<{ companyId: number; intensity: number | null }>
): Map<number, "bottom" | "middle" | "top" | null> {
  // Filter out null intensities
  const validIntensities = intensities
    .filter(item => item.intensity !== null)
    .map(item => ({ companyId: item.companyId, intensity: item.intensity! }));
  
  if (validIntensities.length === 0) {
    return new Map(intensities.map(item => [item.companyId, null]));
  }
  
  // Sort by intensity (ascending)
  validIntensities.sort((a, b) => a.intensity - b.intensity);
  
  const tercileSize = Math.floor(validIntensities.length / 3);
  const assignments = new Map<number, "bottom" | "middle" | "top" | null>();
  
  // Bottom tercile (lowest emissions = cleanest)
  for (let i = 0; i < tercileSize; i++) {
    assignments.set(validIntensities[i].companyId, "bottom");
  }
  
  // Top tercile (highest emissions = dirtiest)
  for (let i = validIntensities.length - tercileSize; i < validIntensities.length; i++) {
    assignments.set(validIntensities[i].companyId, "top");
  }
  
  // Middle tercile (everything else)
  for (let i = tercileSize; i < validIntensities.length - tercileSize; i++) {
    assignments.set(validIntensities[i].companyId, "middle");
  }
  
  // Add null assignments for companies with no valid intensity
  for (const item of intensities) {
    if (!assignments.has(item.companyId)) {
      assignments.set(item.companyId, null);
    }
  }
  
  return assignments;
}

/**
 * Pre-compute tercile assignments for an upload
 */
export async function computeTercilesForUpload(uploadId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  console.log(`[TercileCalculator] Starting tercile computation for upload ${uploadId}`);
  
  // Load all companies and their time series
  const allCompanies = await db.select().from(companies);
  const allTimeSeries = await db.select().from(timeSeries);
  
  // Group time series by date
  const timeSeriesByDate = new Map<string, typeof allTimeSeries>();
  for (const ts of allTimeSeries) {
    const dateKey = ts.date.toISOString();
    if (!timeSeriesByDate.has(dateKey)) {
      timeSeriesByDate.set(dateKey, []);
    }
    timeSeriesByDate.get(dateKey)!.push(ts);
  }
  
  // Get unique dates
  const uniqueDates = Array.from(timeSeriesByDate.keys()).sort();
  console.log(`[TercileCalculator] Processing ${uniqueDates.length} dates for ${allCompanies.length} companies`);
  
  // Create a map of company ID to sector
  const companySectors = new Map(allCompanies.map(c => [c.id, c.sector]));
  
  // Process each date
  let totalInserted = 0;
  for (let dateIdx = 0; dateIdx < uniqueDates.length; dateIdx++) {
    const dateKey = uniqueDates[dateIdx];
    const date = new Date(dateKey);
    const tsForDate = timeSeriesByDate.get(dateKey)!;
    
    if (dateIdx % 20 === 0) {
      console.log(`[TercileCalculator] Processing date ${dateIdx + 1}/${uniqueDates.length}: ${date.toISOString().split('T')[0]}`);
    }
    
    // Calculate intensities for both methods and scope options
    const intensitiesAbsolute = tsForDate.map(ts => ({
      companyId: ts.companyId,
      intensityScope12: calculateCarbonIntensity(
        ts.scope1Emissions,
        ts.scope2Emissions,
        ts.scope3Emissions,
        ts.marketCap,
        false
      ),
      intensityScope123: calculateCarbonIntensity(
        ts.scope1Emissions,
        ts.scope2Emissions,
        ts.scope3Emissions,
        ts.marketCap,
        true
      ),
    }));
    
    // Absolute terciles (Scope 1+2)
    const absoluteTercilesScope12 = assignTerciles(
      intensitiesAbsolute.map(item => ({
        companyId: item.companyId,
        intensity: item.intensityScope12,
      }))
    );
    
    // Absolute terciles (Scope 1+2+3)
    const absoluteTercilesScope123 = assignTerciles(
      intensitiesAbsolute.map(item => ({
        companyId: item.companyId,
        intensity: item.intensityScope123,
      }))
    );
    
    // Sector-relative terciles
    const sectorGroups = new Map<string, typeof intensitiesAbsolute>();
    for (const item of intensitiesAbsolute) {
      const sector = companySectors.get(item.companyId);
      if (!sector) continue;
      
      if (!sectorGroups.has(sector)) {
        sectorGroups.set(sector, []);
      }
      sectorGroups.get(sector)!.push(item);
    }
    
    const sectorRelativeTercilesScope12 = new Map<number, "bottom" | "middle" | "top" | null>();
    const sectorRelativeTercilesScope123 = new Map<number, "bottom" | "middle" | "top" | null>();
    
    sectorGroups.forEach((sectorIntensities, sector) => {
      const sectorAssignmentsScope12 = assignTerciles(
        sectorIntensities.map((item: typeof intensitiesAbsolute[0]) => ({
          companyId: item.companyId,
          intensity: item.intensityScope12,
        }))
      );
      
      const sectorAssignmentsScope123 = assignTerciles(
        sectorIntensities.map((item: typeof intensitiesAbsolute[0]) => ({
          companyId: item.companyId,
          intensity: item.intensityScope123,
        }))
      );
      
      sectorAssignmentsScope12.forEach((assignment, companyId) => {
        sectorRelativeTercilesScope12.set(companyId, assignment);
      });
      
      sectorAssignmentsScope123.forEach((assignment, companyId) => {
        sectorRelativeTercilesScope123.set(companyId, assignment);
      });
    });
    
    // Prepare batch insert
    const tercileRecords: InsertCompanyTercile[] = [];
    
    for (const item of intensitiesAbsolute) {
      // Absolute, Scope 1+2
      tercileRecords.push({
        uploadId,
        companyId: item.companyId,
        date,
        method: "absolute",
        includeScope3: 0,
        carbonIntensity: item.intensityScope12,
        tercileAssignment: absoluteTercilesScope12.get(item.companyId) || null,
      });
      
      // Absolute, Scope 1+2+3
      tercileRecords.push({
        uploadId,
        companyId: item.companyId,
        date,
        method: "absolute",
        includeScope3: 1,
        carbonIntensity: item.intensityScope123,
        tercileAssignment: absoluteTercilesScope123.get(item.companyId) || null,
      });
      
      // Sector-relative, Scope 1+2
      tercileRecords.push({
        uploadId,
        companyId: item.companyId,
        date,
        method: "sector_relative",
        includeScope3: 0,
        carbonIntensity: item.intensityScope12,
        tercileAssignment: sectorRelativeTercilesScope12.get(item.companyId) || null,
      });
      
      // Sector-relative, Scope 1+2+3
      tercileRecords.push({
        uploadId,
        companyId: item.companyId,
        date,
        method: "sector_relative",
        includeScope3: 1,
        carbonIntensity: item.intensityScope123,
        tercileAssignment: sectorRelativeTercilesScope123.get(item.companyId) || null,
      });
    }
    
    // Batch insert (split into chunks of 1000 to avoid query size limits)
    const chunkSize = 1000;
    for (let i = 0; i < tercileRecords.length; i += chunkSize) {
      const chunk = tercileRecords.slice(i, i + chunkSize);
      await db.insert(companyTerciles).values(chunk);
      totalInserted += chunk.length;
    }
  }
  
  console.log(`[TercileCalculator] Completed: inserted ${totalInserted} tercile records`);
}
