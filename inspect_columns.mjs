import XLSX from 'xlsx';
import fs from 'fs';

const buffer = fs.readFileSync('/home/ubuntu/upload/CarbonData2301a.xlsx');
const workbook = XLSX.read(buffer, { type: 'buffer' });

const riSheet = workbook.Sheets['RI'];
const riData = XLSX.utils.sheet_to_json(riSheet);
const riColumns = Object.keys(riData[0] || {}).filter(col => col !== 'Name');
console.log('RI columns (first 5):', riColumns.slice(0, 5));

const mvSheet = workbook.Sheets['MV'];
const mvData = XLSX.utils.sheet_to_json(mvSheet);
const mvColumns = Object.keys(mvData[0] || {}).filter(col => col !== 'Name');
console.log('\nMV columns (first 5):', mvColumns.slice(0, 5));

const peSheet = workbook.Sheets['PE'];
const peData = XLSX.utils.sheet_to_json(peSheet);
const peColumns = Object.keys(peData[0] || {}).filter(col => col !== 'Name');
console.log('\nPE columns (first 5):', peColumns.slice(0, 5));

// Check if column names match
console.log('\nDo column names match?');
console.log('RI[0] === MV[0]:', riColumns[0] === mvColumns[0]);
console.log('RI[0] === PE[0]:', riColumns[0] === peColumns[0]);

// Check first row data
console.log('\nFirst row of RI (first company):');
console.log('Date:', riData[0]['Name']);
console.log('Value for first company:', riData[0][riColumns[0]]);

console.log('\nFirst row of MV (first company):');
console.log('Date:', mvData[0]['Name']);
console.log('Value for first company:', mvData[0][mvColumns[0]]);

console.log('\nFirst row of PE (first company):');
console.log('Date:', peData[0]['Name']);
console.log('Value for first company:', peData[0][peColumns[0]]);
