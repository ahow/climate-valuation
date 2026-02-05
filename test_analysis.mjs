import * as db from './server/db.ts';
import { runFullAnalysis, mapGeographyToRegion } from './server/portfolioAnalyzerV2.ts';

async function main() {
  console.log('Loading companies...');
  const companies = await db.getAllCompanies();
  console.log(`Loaded ${companies.length} companies`);
  
  console.log('Loading time series data...');
  const companiesWithData = [];
  for (const company of companies.slice(0, 100)) { // Test with first 100 companies
    const timeSeries = await db.getTimeSeriesByCompany(company.id);
    companiesWithData.push({ company, timeSeries });
  }
  console.log(`Loaded time series for ${companiesWithData.length} companies`);
  
  // Get unique dates
  const dateSet = new Set();
  for (const { timeSeries } of companiesWithData) {
    for (const ts of timeSeries) {
      dateSet.add(ts.date.getTime());
    }
  }
  const dates = Array.from(dateSet).map(t => new Date(t)).sort((a, b) => a.getTime() - b.getTime());
  console.log(`Found ${dates.length} unique dates`);
  console.log(`Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
  
  // Get sectors and geographies
  const sectors = Array.from(new Set(companies.map(c => c.sector).filter(Boolean)));
  const rawGeographies = Array.from(new Set(companies.map(c => c.geography).filter(Boolean)));
  const geographies = Array.from(new Set(rawGeographies.map(g => mapGeographyToRegion(g))));
  console.log(`Found ${sectors.length} sectors and ${geographies.length} regions`);
  
  // Run analysis on first 5 dates only
  console.log('\nRunning analysis on first 5 dates...');
  const results = runFullAnalysis(
    companiesWithData,
    dates.slice(0, 5),
    {
      includeScope3: false,
      methodology: 'relative',
      sectorGranularity: 'sector',
      thresholds: { tertileApproach: true }
    },
    { sectors: sectors.slice(0, 3), geographies: geographies.slice(0, 2) }
  );
  
  console.log(`\nAnalysis complete! Generated ${results.length} results`);
  if (results.length > 0) {
    console.log('\nFirst 3 results:');
    for (let i = 0; i < Math.min(3, results.length); i++) {
      const r = results[i];
      console.log(JSON.stringify({
        date: r.date,
        type: r.investmentType,
        sector: r.sector,
        geography: r.geography,
        portfolioSize: r.portfolioSize,
        avgCarbonIntensity: r.avgCarbonIntensity.toFixed(2),
        avgPeRatio: r.avgPeRatio.toFixed(2),
        carbonRiskDiscount: (r.carbonRiskDiscount * 100).toFixed(2) + '%',
        impliedCarbonPrice: r.impliedCarbonPrice.toFixed(2),
        impliedDecarbRate: (r.impliedDecarbRate * 100).toFixed(2) + '%'
      }, null, 2));
    }
  }
}

main().catch(console.error);
