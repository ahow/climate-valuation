import * as XLSX from 'xlsx';
import { InsertCompany, InsertTimeSeries } from '../drizzle/schema';

export interface ProcessedData {
  companies: InsertCompany[];
  timeSeries: InsertTimeSeries[];
  dateRange: { min: Date; max: Date };
  stats: {
    totalCompanies: number;
    totalTimePeriods: number;
    companiesWithEmissions: number;
    companiesWithTargets: number;
    companiesWithSDGScores: number;
  };
}

export interface RawSheetData {
  Descriptive: any[];
  RI: any[];
  MV: any[];
  S1: any[];
  S2: any[];
  S3: any[];
  PE: any[];
  GreenRev: any[];
  EmissionTargets: any[];
}

/**
 * Parse Excel file and extract all sheets
 */
export function parseExcelFile(buffer: Buffer): RawSheetData {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetNames = ['Descriptive', 'RI', 'MV', 'S1', 'S2', 'S3', 'PE', 'GreenRev', 'EmissionTargets'];
  const data: any = {};

  for (const sheetName of sheetNames) {
    if (!workbook.SheetNames.includes(sheetName)) {
      throw new Error(`Required sheet "${sheetName}" not found in Excel file`);
    }
    const sheet = workbook.Sheets[sheetName];
    data[sheetName] = XLSX.utils.sheet_to_json(sheet);
  }

  return data as RawSheetData;
}

/**
 * Extract company name from RI column format: "COMPANY NAME - TOT RETURN IND"
 */
function extractCompanyName(columnName: string): string {
  return columnName.replace(' - TOT RETURN IND', '').trim();
}

/**
 * Build mapping from company name to ISIN using Descriptive sheet
 */
function buildNameToIsinMap(descriptive: any[]): Map<string, string> {
  const map = new Map<string, string>();
  
  for (const row of descriptive) {
    const name = row['NAME'];
    const isin = row['Type'];
    if (name && isin) {
      map.set(name.trim().toUpperCase(), isin);
    }
  }
  
  return map;
}

/**
 * Build mapping from ISIN to company metadata
 */
function buildCompanyMetadata(
  descriptive: any[],
  greenRev: any[],
  emissionTargets: any[]
): Map<string, InsertCompany> {
  const metadata = new Map<string, InsertCompany>();

  // Index GreenRev and EmissionTargets by ISIN
  const greenRevMap = new Map<string, number>();
  for (const row of greenRev) {
    const isin = row['ISSUER_ISIN'];
    const score = row['SDG_07_NET_ALIGNMENT_SCORE'];
    if (isin && score !== undefined && score !== null) {
      greenRevMap.set(isin, score);
    }
  }

  const emissionTargetMap = new Map<string, number>();
  for (const row of emissionTargets) {
    const isin = row['ISSUER_ISIN'];
    const target = row['TARGET_SUMMARY_CUM_CHANGE_2050'];
    if (isin && target !== undefined && target !== null) {
      emissionTargetMap.set(isin, target);
    }
  }

  // Build company metadata from Descriptive sheet
  for (const row of descriptive) {
    const isin = row['Type'];
    const name = row['NAME'];
    
    if (!isin || !name) continue;

    const company: InsertCompany = {
      isin,
      name,
      geography: row['GEOGRAPHIC DESCR.'] || null,
      sector: row['LEVEL2 SECTOR NAME'] || null,
      industry: row['LEVEL3 SECTOR NAME'] || null,
      sdgAlignmentScore: greenRevMap.get(isin) ?? null,
      emissionTarget2050: emissionTargetMap.get(isin) ?? null,
    };

    metadata.set(isin, company);
  }

  return metadata;
}

/**
 * Extract emissions data by ISIN and fiscal year
 */
function buildEmissionsMap(
  s1Data: any[],
  s2Data: any[],
  s3Data: any[]
): Map<string, Map<string, { s1: number | null; s2: number | null; s3: number | null }>> {
  const emissionsMap = new Map<string, Map<string, { s1: number | null; s2: number | null; s3: number | null }>>();

  // Process S1
  for (const row of s1Data) {
    const isin = row['ISSUER_ISIN'];
    if (!isin) continue;

    if (!emissionsMap.has(isin)) {
      emissionsMap.set(isin, new Map());
    }

    const companyMap = emissionsMap.get(isin)!;

    // Extract fiscal year columns (FY10-FY24)
    for (let year = 10; year <= 24; year++) {
      const fyKey = `FY${year}`;
      const colName = `CARBON_EMISSIONS_SCOPE_1_FY${year}`;
      const value = row[colName];

      if (!companyMap.has(fyKey)) {
        companyMap.set(fyKey, { s1: null, s2: null, s3: null });
      }

      if (value !== undefined && value !== null) {
        companyMap.get(fyKey)!.s1 = value;
      }
    }
  }

  // Process S2
  for (const row of s2Data) {
    const isin = row['ISSUER_ISIN'];
    if (!isin) continue;

    if (!emissionsMap.has(isin)) {
      emissionsMap.set(isin, new Map());
    }

    const companyMap = emissionsMap.get(isin)!;

    for (let year = 10; year <= 24; year++) {
      const fyKey = `FY${year}`;
      const colName = `CARBON_EMISSIONS_SCOPE_2_FY${year}`;
      const value = row[colName];

      if (!companyMap.has(fyKey)) {
        companyMap.set(fyKey, { s1: null, s2: null, s3: null });
      }

      if (value !== undefined && value !== null) {
        companyMap.get(fyKey)!.s2 = value;
      }
    }
  }

  // Process S3
  for (const row of s3Data) {
    const isin = row['ISSUER_ISIN'];
    if (!isin) continue;

    if (!emissionsMap.has(isin)) {
      emissionsMap.set(isin, new Map());
    }

    const companyMap = emissionsMap.get(isin)!;

    for (let year = 10; year <= 24; year++) {
      const fyKey = `FY${year}`;
      const colName = `CARBON_EMISSIONS_SCOPE_3_FY${year}`;
      const value = row[colName];

      if (!companyMap.has(fyKey)) {
        companyMap.set(fyKey, { s1: null, s2: null, s3: null });
      }

      if (value !== undefined && value !== null) {
        companyMap.get(fyKey)!.s3 = value;
      }
    }
  }

  return emissionsMap;
}

/**
 * Map fiscal year to approximate calendar date
 * FY10 -> 2010-06-30, FY11 -> 2011-06-30, etc.
 */
function fyToDate(fy: string): Date {
  const year = parseInt(fy.substring(2)) + 2000;
  return new Date(year, 5, 30); // June 30th
}

/**
 * Find closest fiscal year for a given date
 */
function findClosestFY(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  // If before July, use previous year's FY
  const fyYear = month < 6 ? year - 1 : year;
  const fy = fyYear - 2000;
  
  return `FY${fy.toString().padStart(2, '0')}`;
}

/**
 * Process all data and transform into database-ready format
 */
export function processClimateData(rawData: RawSheetData): ProcessedData {
  const { Descriptive, RI, MV, PE, S1, S2, S3, GreenRev, EmissionTargets } = rawData;

  // Build mappings
  const nameToIsin = buildNameToIsinMap(Descriptive);
  const companyMetadata = buildCompanyMetadata(Descriptive, GreenRev, EmissionTargets);
  const emissionsMap = buildEmissionsMap(S1, S2, S3);

  // Extract companies
  const companies: InsertCompany[] = Array.from(companyMetadata.values());

  // Create ISIN to ID mapping (will be filled after DB insert)
  const isinToCompanyId = new Map<string, number>();
  companies.forEach((company, index) => {
    isinToCompanyId.set(company.isin, index + 1); // Placeholder IDs
  });

  // Process time series data
  const timeSeries: InsertTimeSeries[] = [];
  const dates = new Set<Date>();

  // Get column names from RI sheet (excluding 'Name' column)
  const riColumns = Object.keys(RI[0] || {}).filter(col => col !== 'Name');

  for (const row of RI) {
    const date = new Date(row['Name']);
    if (isNaN(date.getTime())) continue;

    dates.add(date);

    // Find corresponding rows in MV and PE
    const mvRow = MV.find((r: any) => {
      const mvDate = new Date(r['Name']);
      return mvDate.getTime() === date.getTime();
    });

    const peRow = PE.find((r: any) => {
      const peDate = new Date(r['Name']);
      return peDate.getTime() === date.getTime();
    });

    // Process each company column
    for (const colName of riColumns) {
      const companyName = extractCompanyName(colName);
      const isin = nameToIsin.get(companyName.toUpperCase());

      if (!isin) continue;

      const companyId = isinToCompanyId.get(isin);
      if (!companyId) continue;

      // Get emissions for this date (use closest fiscal year)
      const fy = findClosestFY(date);
      const emissions = emissionsMap.get(isin)?.get(fy);

      const tsData: InsertTimeSeries = {
        companyId,
        date,
        totalReturnIndex: row[colName] ?? null,
        marketCap: mvRow?.[colName] ?? null,
        priceEarnings: peRow?.[colName] ?? null,
        scope1Emissions: emissions?.s1 ?? null,
        scope2Emissions: emissions?.s2 ?? null,
        scope3Emissions: emissions?.s3 ?? null,
      };

      timeSeries.push(tsData);
    }
  }

  // Calculate date range
  const sortedDates = Array.from(dates).sort((a, b) => a.getTime() - b.getTime());
  const dateRange = {
    min: sortedDates[0] || new Date(),
    max: sortedDates[sortedDates.length - 1] || new Date(),
  };

  // Calculate stats
  const stats = {
    totalCompanies: companies.length,
    totalTimePeriods: dates.size,
    companiesWithEmissions: Array.from(emissionsMap.keys()).length,
    companiesWithTargets: Array.from(companyMetadata.values()).filter(c => c.emissionTarget2050 !== null).length,
    companiesWithSDGScores: Array.from(companyMetadata.values()).filter(c => c.sdgAlignmentScore !== null).length,
  };

  return {
    companies,
    timeSeries,
    dateRange,
    stats,
  };
}
