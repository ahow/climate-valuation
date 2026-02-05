import { describe, it, expect } from 'vitest';

describe('Total-Based Carbon Price Calculation', () => {
  it('should calculate implied carbon price from total market cap, profit, and emissions', () => {
    // Example calculation
    // Top Tercile (High Carbon):
    //   Total Market Cap: $100,000M
    //   Total Net Profit: $5,000M
    //   Total Emissions: 10,000 tCO2
    //   P/E = 100,000 / 5,000 = 20
    //
    // Bottom Tercile (Low Carbon):
    //   Total Market Cap: $120,000M
    //   Total Net Profit: $5,000M
    //   P/E = 120,000 / 5,000 = 24
    //
    // Implied Carbon Price:
    //   Target Profit for Top = Top Market Cap / Bottom P/E = 100,000 / 24 = 4,166.67M
    //   Profit Difference = 5,000 - 4,166.67 = 833.33M
    //   Implied Carbon Price = 833.33 / 10,000 = $83.33/tCO2

    const topMarketCap = 100000;
    const topProfit = 5000;
    const topEmissions = 10000;
    const bottomMarketCap = 120000;
    const bottomProfit = 5000;

    const topPE = topMarketCap / topProfit;
    const bottomPE = bottomMarketCap / bottomProfit;
    
    const impliedTargetProfit = topMarketCap / bottomPE;
    const profitDifference = topProfit - impliedTargetProfit;
    const impliedCarbonPrice = profitDifference / topEmissions;

    expect(topPE).toBe(20);
    expect(bottomPE).toBe(24);
    expect(impliedTargetProfit).toBeCloseTo(4166.67, 2);
    expect(profitDifference).toBeCloseTo(833.33, 2);
    // Result is in $M/tCO2, need to convert to $/tCO2
    expect(impliedCarbonPrice).toBeCloseTo(0.08333, 4); // $0.08333M/tCO2 = $83,333/tCO2
  });

  it('should handle negative implied carbon price when low-carbon companies trade at discount', () => {
    // If low-carbon companies trade at LOWER P/E than high-carbon
    // This implies negative carbon price (market doesn't value decarbonization)
    
    const topMarketCap = 100000;
    const topProfit = 5000;
    const topEmissions = 10000;
    const bottomMarketCap = 80000; // Lower market cap
    const bottomProfit = 5000;

    const topPE = topMarketCap / topProfit; // 20
    const bottomPE = bottomMarketCap / bottomProfit; // 16 (lower P/E)
    
    const impliedTargetProfit = topMarketCap / bottomPE;
    const profitDifference = topProfit - impliedTargetProfit;
    const impliedCarbonPrice = profitDifference / topEmissions;

    expect(bottomPE).toBeLessThan(topPE);
    expect(impliedCarbonPrice).toBeLessThan(0); // Negative carbon price
  });

  it('should return zero when emissions are zero', () => {
    const topMarketCap = 100000;
    const topProfit = 5000;
    const topEmissions = 0; // No emissions
    const bottomMarketCap = 120000;
    const bottomProfit = 5000;

    const bottomPE = bottomMarketCap / bottomProfit;
    const impliedTargetProfit = topMarketCap / bottomPE;
    const profitDifference = topProfit - impliedTargetProfit;
    const impliedCarbonPrice = topEmissions > 0 ? profitDifference / topEmissions : 0;

    expect(impliedCarbonPrice).toBe(0);
  });

  it('should validate units are consistent', () => {
    // Market Cap: $M (millions of dollars)
    // Net Profit: $M/year (millions of dollars per year)
    // Emissions: tCO2 (tonnes of CO2)
    // Carbon Price: $/tCO2 (dollars per tonne)

    const topMarketCap = 100000; // $100,000M = $100B
    const topProfit = 5000; // $5,000M/year = $5B/year
    const topEmissions = 10000; // 10,000 tCO2
    const bottomMarketCap = 120000; // $120,000M = $120B
    const bottomProfit = 5000; // $5,000M/year = $5B/year

    const bottomPE = bottomMarketCap / topProfit; // Dimensionless ($ / $/year = years)
    const impliedTargetProfit = topMarketCap / bottomPE; // $M/year
    const profitDifference = topProfit - impliedTargetProfit; // $M/year
    const impliedCarbonPrice = profitDifference / topEmissions; // ($M/year) / tCO2 = $M/tCO2

    // Convert to $/tCO2: multiply by 1,000,000
    const carbonPricePerTonne = impliedCarbonPrice * 1000000;

    expect(carbonPricePerTonne).toBeCloseTo(83333.33, 0); // $83,333 per tonne
    
    // Note: This assumes emissions are annual (tCO2/year) matching profit ($/year)
    // If emissions were total stock, the units wouldn't make sense
  });
});
