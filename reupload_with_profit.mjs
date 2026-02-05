import { parseExcelFile, processClimateData } from './server/dataProcessor.ts';
import { getDb } from './server/db.ts';
import { companies, timeSeries } from './drizzle/schema.ts';
import * as fs from 'fs';

const db = await getDb();
if (!db) {
  console.error('Database not available');
  process.exit(1);
}

const buffer = fs.readFileSync('/home/ubuntu/upload/CarbonData2301a.xlsx');
console.log('Parsing Excel file...');
const rawData = parseExcelFile(buffer);

console.log('Processing climate data...');
const processed = processClimateData(rawData);

console.log(`\nProcessed ${processed.companies.length} companies and ${processed.timeSeries.length} time series records`);
console.log(`Date range: ${processed.dateRange.min.toISOString()} to ${processed.dateRange.max.toISOString()}`);

// Check profit data availability
const withProfit = processed.timeSeries.filter(ts => ts.netProfit !== null && ts.netProfit !== undefined);
console.log(`\nTime series records with profit data: ${withProfit.length} (${(withProfit.length / processed.timeSeries.length * 100).toFixed(1)}%)`);

// Sample profit values
console.log('\nSample profit values (first 10 records with profit):');
withProfit.slice(0, 10).forEach(ts => {
  console.log(`  Company ID ${ts.companyId}, Date ${ts.date.toISOString().split('T')[0]}, Profit: $${ts.netProfit}M`);
});

console.log('\nInserting companies...');
const insertedCompanies = await db.insert(companies).values(processed.companies);
console.log(`Inserted ${processed.companies.length} companies`);

// Update company IDs in time series
const companyIdMap = new Map();
for (let i = 0; i < processed.companies.length; i++) {
  companyIdMap.set(i + 1, insertedCompanies.insertId + i);
}

const updatedTimeSeries = processed.timeSeries.map(ts => ({
  ...ts,
  companyId: companyIdMap.get(ts.companyId) || ts.companyId,
}));

console.log('\nInserting time series data in batches...');
const batchSize = 1000;
for (let i = 0; i < updatedTimeSeries.length; i += batchSize) {
  const batch = updatedTimeSeries.slice(i, i + batchSize);
  await db.insert(timeSeries).values(batch);
  console.log(`  Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updatedTimeSeries.length / batchSize)} (${i + batch.length}/${updatedTimeSeries.length} records)`);
}

console.log('\nUpload complete!');
process.exit(0);
