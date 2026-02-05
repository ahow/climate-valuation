import fs from 'fs';
import { parseExcelFile, processClimateData } from './server/dataProcessor.ts';
import * as db from './server/db.ts';

async function main() {
  console.log('Reading Excel file...');
  const buffer = fs.readFileSync('/home/ubuntu/upload/CarbonData2301a.xlsx');
  
  console.log('Parsing Excel file...');
  const rawData = parseExcelFile(buffer);
  
  console.log('Processing climate data...');
  const processedData = processClimateData(rawData);
  
  console.log(`Processed ${processedData.stats.totalCompanies} companies, ${processedData.timeSeries.length} time series records`);
  console.log(`Date range: ${processedData.dateRange.min} to ${processedData.dateRange.max}`);
  
  // Sample first few time series records
  console.log('\nFirst 5 time series records:');
  for (let i = 0; i < Math.min(5, processedData.timeSeries.length); i++) {
    const ts = processedData.timeSeries[i];
    console.log(JSON.stringify({
      companyId: ts.companyId,
      date: ts.date,
      marketCap: ts.marketCap,
      priceEarnings: ts.priceEarnings,
      scope1: ts.scope1Emissions,
      scope2: ts.scope2Emissions,
      scope3: ts.scope3Emissions
    }, null, 2));
  }
  
  console.log('\nInserting companies...');
  for (const company of processedData.companies) {
    await db.upsertCompany(company);
  }
  
  console.log('Getting company IDs...');
  const companies = await db.getAllCompanies();
  const isinToId = new Map(companies.map(c => [c.isin, c.id]));
  
  console.log('Preparing time series with correct company IDs...');
  const timeSeriesWithIds = processedData.timeSeries
    .map(ts => {
      const companyIsin = processedData.companies[ts.companyId - 1]?.isin;
      if (!companyIsin) return null;
      const actualCompanyId = isinToId.get(companyIsin);
      if (!actualCompanyId) return null;
      return { ...ts, companyId: actualCompanyId };
    })
    .filter(ts => ts !== null);
  
  console.log(`Inserting ${timeSeriesWithIds.length} time series records in batches...`);
  await db.insertTimeSeriesBatch(timeSeriesWithIds);
  
  console.log('Upload completed successfully!');
}

main().catch(console.error);
