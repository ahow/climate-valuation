import XLSX from 'xlsx';

const workbook = XLSX.readFile('/home/ubuntu/upload/CarbonData2301a.xlsx');
const riSheet = workbook.Sheets['RI'];
const profitSheet = workbook.Sheets['Profit'];

const riData = XLSX.utils.sheet_to_json(riSheet);
const profitData = XLSX.utils.sheet_to_json(profitSheet);

const riColumns = Object.keys(riData[0]).filter(col => col !== 'Name').slice(0, 5);
const profitColumns = Object.keys(profitData[0]).filter(col => col !== 'Name').slice(0, 5);

console.log('RI columns (first 5):');
riColumns.forEach(col => console.log(`  "${col}"`));

console.log('\nProfit columns (first 5):');
profitColumns.forEach(col => console.log(`  "${col}"`));

// Check if we can match by replacing suffix
console.log('\nTrying to match by replacing suffix:');
riColumns.forEach(riCol => {
  const companyName = riCol.replace(' - TOT RETURN IND', '');
  const profitCol = profitColumns.find(col => col.startsWith(companyName));
  console.log(`  RI: "${riCol}"`);
  console.log(`    -> Company: "${companyName}"`);
  console.log(`    -> Profit match: ${profitCol ? `"${profitCol}"` : 'NOT FOUND'}`);
});
