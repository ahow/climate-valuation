import { parseExcelFile, processClimateData } from './server/dataProcessor.ts';
import * as fs from 'fs';

const buffer = fs.readFileSync('/home/ubuntu/upload/CarbonData2301a.xlsx');
const rawData = parseExcelFile(buffer);

// Check first few records
const riRow = rawData.RI[0];
const profitRow = rawData.Profit[0];

console.log('RI row date:', riRow['Name']);
console.log('Profit row date:', profitRow['Name']);
console.log('Dates match:', riRow['Name'] === profitRow['Name']);

const riColumns = Object.keys(riRow).filter(col => col !== 'Name').slice(0, 3);
console.log('\nChecking first 3 companies:');
for (const riCol of riColumns) {
  const profitCol = riCol.replace('TOT RETURN IND', 'FY2 INC MEAN EST');
  console.log(`\nRI column: "${riCol}"`);
  console.log(`Profit column: "${profitCol}"`);
  console.log(`RI value: ${riRow[riCol]}`);
  console.log(`Profit value: ${profitRow[profitCol]}`);
  console.log(`Profit column exists: ${profitCol in profitRow}`);
}
