import XLSX from 'xlsx';
import fs from 'fs';

const buffer = fs.readFileSync('/home/ubuntu/upload/CarbonData2301a.xlsx');
const workbook = XLSX.read(buffer, { type: 'buffer' });

console.log('Sheet names:', workbook.SheetNames);

// Inspect RI sheet
const riSheet = workbook.Sheets['RI'];
const riData = XLSX.utils.sheet_to_json(riSheet);
console.log('\n=== RI Sheet ===');
console.log('Total rows:', riData.length);
console.log('First row keys:', Object.keys(riData[0] || {}));
console.log('First 2 rows:', JSON.stringify(riData.slice(0, 2), null, 2));

// Inspect MV sheet
const mvSheet = workbook.Sheets['MV'];
const mvData = XLSX.utils.sheet_to_json(mvSheet);
console.log('\n=== MV Sheet ===');
console.log('Total rows:', mvData.length);
console.log('First row keys:', Object.keys(mvData[0] || {}));
console.log('First 2 rows:', JSON.stringify(mvData.slice(0, 2), null, 2));

// Inspect PE sheet
const peSheet = workbook.Sheets['PE'];
const peData = XLSX.utils.sheet_to_json(peSheet);
console.log('\n=== PE Sheet ===');
console.log('Total rows:', peData.length);
console.log('First row keys:', Object.keys(peData[0] || {}));
console.log('First 2 rows:', JSON.stringify(peData.slice(0, 2), null, 2));

// Inspect Descriptive sheet
const descSheet = workbook.Sheets['Descriptive'];
const descData = XLSX.utils.sheet_to_json(descSheet);
console.log('\n=== Descriptive Sheet ===');
console.log('Total rows:', descData.length);
console.log('First row keys:', Object.keys(descData[0] || {}));
console.log('First 2 rows:', JSON.stringify(descData.slice(0, 2), null, 2));
