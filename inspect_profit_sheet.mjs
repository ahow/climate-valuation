import XLSX from 'xlsx';

const workbook = XLSX.readFile('/home/ubuntu/upload/CarbonData2301a.xlsx');
console.log('Sheet names:', workbook.SheetNames);

const profitSheet = workbook.Sheets['Profit'];
if (!profitSheet) {
  console.log('Profit sheet not found!');
  process.exit(1);
}

const profitData = XLSX.utils.sheet_to_json(profitSheet);
console.log('\nProfit sheet row count:', profitData.length);
console.log('\nFirst 3 rows:');
console.log(JSON.stringify(profitData.slice(0, 3), null, 2));

console.log('\nColumn names (from first row):');
console.log(Object.keys(profitData[0]));
