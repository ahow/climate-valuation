import * as XLSX from 'xlsx';
import { InsertCompany, InsertTimeSeries } from '../drizzle/schema';

/**
 * Convert Excel date serial number to JavaScript Date
 * Excel dates are stored as days since 1900-01-01 (with a leap year bug)
 */
function excelSerialToDate(serial: number): Date {
  // Excel incorrectly treats 1900 as a leap year, so dates after Feb 28, 1900 are off by 1
  // Excel serial 1 = 1900-01-01, serial 2 = 1900-01-02, etc.
  const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(excelEpoch.getTime() + serial * msPerDay);
}

/**
 * Sanitize numeric values from Excel - convert invalid values to null
 * Handles: "?", "NA", "#N/A", empty strings, undefined
 */
function sanitizeNumeric(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '?' || trimmed === 'NA' || trimmed.startsWith('#')) return null;
    const num = parseFloat(trimmed);
    return isNaN(num) ? null : num;
  }
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  return null;
}

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
  Profit: any[];
  GreenRev: any[];
  EmissionTargets: any[];
}

/**
 * Parse Excel file and extract all sheets
 */
export function parseExcelFile(buffer: Buffer): RawSheetData {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetNames = ['Descriptive', 'RI', 'MV', 'S1', 'S2', 'S3', 'PE', 'Profit', 'GreenRev', 'EmissionTargets'];
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
    const score = sanitizeNumeric(row['SDG_07_NET_ALIGNMENT_SCORE']);
    if (isin && score !== null) {
      greenRevMap.set(isin, score);
    }
  }

  const emissionTargetMap = new Map<string, number>();
  for (const row of emissionTargets) {
    const isin = row['ISSUER_ISIN'];
    const target = sanitizeNumeric(row['TARGET_SUMMARY_CUM_CHANGE_2050']);
    if (isin && target !== null) {
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

      const sanitized = sanitizeNumeric(value);
      if (sanitized !== null) {
        companyMap.get(fyKey)!.s1 = sanitized;
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

      const sanitized = sanitizeNumeric(value);
      if (sanitized !== null) {
        companyMap.get(fyKey)!.s2 = sanitized;
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

      const sanitized = sanitizeNumeric(value);
      if (sanitized !== null) {
        companyMap.get(fyKey)!.s3 = sanitized;
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
  const { Descriptive, RI, MV, PE, Profit, S1, S2, S3, GreenRev, EmissionTargets } = rawData;

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

  // Pre-index MV and PE data by date timestamp for fast lookup
  console.log('Pre-indexing MV data by date...');
  const mvByDate = new Map<number, any>();
  for (const row of MV) {
    const dateValue = row['Name'];
    let date: Date;
    if (typeof dateValue === 'number') {
      date = excelSerialToDate(dateValue);
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else {
      continue;
    }
    if (!isNaN(date.getTime())) {
      mvByDate.set(date.getTime(), row);
    }
  }

  console.log('Pre-indexing PE data by date...');
  const peByDate = new Map<number, any>();
  for (const row of PE) {
    const dateValue = row['Name'];
    let date: Date;
    if (typeof dateValue === 'number') {
      date = excelSerialToDate(dateValue);
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else {
      continue;
    }
    if (!isNaN(date.getTime())) {
      peByDate.set(date.getTime(), row);
    }
  }

  // Pre-build ISIN-to-PE-column map for fast lookup
  console.log('Building ISIN-to-PE-column map...');
  const isinToPeCol = new Map<string, string>();
  if (PE.length > 0) {
    const peColumns = Object.keys(PE[0]).filter(col => col !== 'Name');
    for (const col of peColumns) {
      // PE column format: "ISIN(P)~U$/ISIN(F2MN)~U$"
      const match = col.match(/^([A-Z]{2}[A-Z0-9]{9}[0-9])\(P\)/);
      if (match) {
        isinToPeCol.set(match[1], col);
      }
    }
  }
  console.log(`Mapped ${isinToPeCol.size} ISINs to PE columns`);

  // Pre-index Profit data by date with sorted timestamps for fuzzy matching
  console.log('Pre-indexing Profit data by date...');
  const profitByDate = new Map<number, any>();
  const profitTimestamps: number[] = [];
  for (const row of Profit) {
    const dateValue = row['Name'];
    let date: Date;
    if (typeof dateValue === 'number') {
      date = excelSerialToDate(dateValue);
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else {
      continue;
    }
    if (!isNaN(date.getTime())) {
      const timestamp = date.getTime();
      profitByDate.set(timestamp, row);
      profitTimestamps.push(timestamp);
    }
  }
  profitTimestamps.sort((a, b) => a - b);
  console.log(`Indexed ${profitTimestamps.length} profit dates`);

  // Helper function to find closest profit row within 30 days
  function findClosestProfitRow(targetTimestamp: number): any | null {
    // Try exact match first
    if (profitByDate.has(targetTimestamp)) {
      return profitByDate.get(targetTimestamp);
    }

    // Binary search for closest timestamp
    let left = 0;
    let right = profitTimestamps.length - 1;
    let closestIdx = -1;
    let minDiff = Infinity;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const diff = Math.abs(profitTimestamps[mid] - targetTimestamp);
      
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = mid;
      }

      if (profitTimestamps[mid] < targetTimestamp) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // Check if closest is within 30 days (30 * 24 * 60 * 60 * 1000 ms)
    const maxDiff = 30 * 24 * 60 * 60 * 1000;
    if (closestIdx >= 0 && minDiff <= maxDiff) {
      return profitByDate.get(profitTimestamps[closestIdx]);
    }

    return null;
  }

  console.log(`Processing ${RI.length} time periods...`);
  let processedRows = 0;
  for (const row of RI) {
    processedRows++;
    if (processedRows % 50 === 0) {
      console.log(`  Processed ${processedRows}/${RI.length} time periods (${timeSeries.length} records)`);
    }
    const dateValue = row['Name'];
    let date: Date;
    
    // Handle Excel serial numbers
    if (typeof dateValue === 'number') {
      date = excelSerialToDate(dateValue);
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else {
      continue;
    }
    
    if (isNaN(date.getTime())) continue;

    dates.add(date);

    // Fast lookup of corresponding rows in MV, PE, and Profit
    const mvRow = mvByDate.get(date.getTime());
    const peRow = peByDate.get(date.getTime());
    const profitRow = findClosestProfitRow(date.getTime());

    // Process each company column
    for (const colName of riColumns) {
      const companyName = extractCompanyName(colName);
      const isin = nameToIsin.get(companyName.toUpperCase());

      if (!isin) continue;

      const companyId = isinToCompanyId.get(isin);
      if (!companyId) continue;

      // Build MV column name: replace "TOT RETURN IND" with "MARKET VAL BY CO."
      const mvColName = colName.replace('TOT RETURN IND', 'MARKET VAL BY CO.');
      
      // For PE, use pre-built ISIN-to-PE-column map
      const peColName = isinToPeCol.get(isin);
      
      // Build Profit column name: replace "TOT RETURN IND" with "FY2 INC MEAN EST"
      const profitColName = colName.replace('TOT RETURN IND', 'FY2 INC MEAN EST');

      // Get emissions for this date (use closest fiscal year)
      const fy = findClosestFY(date);
      const emissions = emissionsMap.get(isin)?.get(fy);

      const tsData: InsertTimeSeries = {
        companyId,
        date,
        totalReturnIndex: sanitizeNumeric(row[colName]),
        marketCap: sanitizeNumeric(mvRow?.[mvColName]),
        priceEarnings: peColName ? sanitizeNumeric(peRow?.[peColName]) : null,
        scope1Emissions: sanitizeNumeric(emissions?.s1),
        scope2Emissions: sanitizeNumeric(emissions?.s2),
        scope3Emissions: sanitizeNumeric(emissions?.s3),
        netProfit: sanitizeNumeric(profitRow?.[profitColName]),
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
