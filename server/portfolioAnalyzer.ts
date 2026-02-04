import { Company, TimeSeries } from '../drizzle/schema';

export interface CompanyWithTimeSeries {
  company: Company;
  timeSeries: TimeSeries[];
}

export interface PortfolioMetrics {
  date: Date;
  investmentType: 'low_carbon' | 'decarbonizing' | 'solutions';
  geography?: string;
  sector?: string;
  avgCarbonIntensity: number;
  avgPeRatio: number;
  valuationPremium: number;
  impliedCarbonPrice: number;
  impliedDecarbRate: number;
  portfolioSize: number;
  companies: number[];
}

export interface ClassificationThresholds {
  lowCarbonPercentile: number; // e.g., 25 for bottom quartile
  decarbonizingTarget: number; // e.g., -0.5 for 50% reduction
  solutionsScore: number; // e.g., 2.0 for positive alignment
}

/**
 * Calculate carbon intensity (emissions per market cap)
 */
export function calculateCarbonIntensity(
  scope1: number | null,
  scope2: number | null,
  scope3: number | null,
  marketCap: number | null,
  includeScope3: boolean = false
): number | null {
  if (!marketCap || marketCap <= 0) return null;

  const s1 = scope1 || 0;
  const s2 = scope2 || 0;
  const s3 = includeScope3 ? (scope3 || 0) : 0;

  const totalEmissions = s1 + s2 + s3;
  
  // Return emissions per million dollars of market cap
  return totalEmissions / (marketCap / 1_000_000);
}

/**
 * Classify companies into portfolios based on thresholds
 */
export function classifyCompanies(
  companiesWithData: CompanyWithTimeSeries[],
  date: Date,
  thresholds: ClassificationThresholds,
  sector?: string,
  geography?: string
): {
  lowCarbon: number[];
  decarbonizing: number[];
  solutions: number[];
  baseline: number[];
} {
  const result = {
    lowCarbon: [] as number[],
    decarbonizing: [] as number[],
    solutions: [] as number[],
    baseline: [] as number[],
  };

  // Filter by sector and geography if specified
  let filteredCompanies = companiesWithData;
  if (sector) {
    filteredCompanies = filteredCompanies.filter(c => c.company.sector === sector);
  }
  if (geography) {
    filteredCompanies = filteredCompanies.filter(c => c.company.geography === geography);
  }

  // Calculate carbon intensities for this date
  const intensities: { companyId: number; intensity: number }[] = [];

  for (const { company, timeSeries } of filteredCompanies) {
    const ts = timeSeries.find(t => t.date.getTime() === date.getTime());
    if (!ts) continue;

    const intensity = calculateCarbonIntensity(
      ts.scope1Emissions,
      ts.scope2Emissions,
      ts.scope3Emissions,
      ts.marketCap,
      false // Use Scope 1+2 for classification
    );

    if (intensity !== null && company.id) {
      intensities.push({ companyId: company.id, intensity });
    }
  }

  // Sort by intensity and find percentile threshold
  intensities.sort((a, b) => a.intensity - b.intensity);
  const percentileIndex = Math.floor(intensities.length * (thresholds.lowCarbonPercentile / 100));

  // Classify as low carbon (bottom percentile)
  for (let i = 0; i < percentileIndex && i < intensities.length; i++) {
    result.lowCarbon.push(intensities[i].companyId);
  }

  // Classify as decarbonizing (based on emission targets)
  for (const { company } of filteredCompanies) {
    if (company.id && company.emissionTarget2050 !== null && company.emissionTarget2050 <= thresholds.decarbonizingTarget) {
      result.decarbonizing.push(company.id);
    }
  }

  // Classify as solutions (based on SDG alignment)
  for (const { company } of filteredCompanies) {
    if (company.id && company.sdgAlignmentScore !== null && company.sdgAlignmentScore >= thresholds.solutionsScore) {
      result.solutions.push(company.id);
    }
  }

  // Baseline: all companies not in any climate portfolio
  const climateCompanies = new Set([...result.lowCarbon, ...result.decarbonizing, ...result.solutions]);
  for (const { company } of filteredCompanies) {
    if (company.id && !climateCompanies.has(company.id)) {
      result.baseline.push(company.id);
    }
  }

  return result;
}

/**
 * Calculate portfolio metrics for a given date and company set
 */
export function calculatePortfolioMetrics(
  companyIds: number[],
  companiesWithData: CompanyWithTimeSeries[],
  date: Date,
  includeScope3: boolean = false
): {
  avgCarbonIntensity: number;
  avgPeRatio: number;
  portfolioSize: number;
} | null {
  const validData: { intensity: number; pe: number }[] = [];

  for (const { company, timeSeries } of companiesWithData) {
    if (!company.id || !companyIds.includes(company.id)) continue;

    const ts = timeSeries.find(t => t.date.getTime() === date.getTime());
    if (!ts) continue;

    const intensity = calculateCarbonIntensity(
      ts.scope1Emissions,
      ts.scope2Emissions,
      ts.scope3Emissions,
      ts.marketCap,
      includeScope3
    );

    if (intensity !== null && ts.priceEarnings !== null && ts.priceEarnings > 0) {
      validData.push({ intensity, pe: ts.priceEarnings });
    }
  }

  if (validData.length === 0) return null;

  const avgCarbonIntensity = validData.reduce((sum, d) => sum + d.intensity, 0) / validData.length;
  const avgPeRatio = validData.reduce((sum, d) => sum + d.pe, 0) / validData.length;

  return {
    avgCarbonIntensity,
    avgPeRatio,
    portfolioSize: validData.length,
  };
}

/**
 * Calculate valuation premium and implied carbon price
 */
export function calculateValuationPremium(
  climateMetrics: { avgCarbonIntensity: number; avgPeRatio: number },
  baselineMetrics: { avgCarbonIntensity: number; avgPeRatio: number }
): {
  valuationPremium: number;
  impliedCarbonPrice: number;
} {
  // Valuation premium: (P/E_climate / P/E_baseline) - 1
  const valuationPremium = (climateMetrics.avgPeRatio / baselineMetrics.avgPeRatio) - 1;

  // Carbon intensity differential (baseline - climate)
  const intensityDiff = baselineMetrics.avgCarbonIntensity - climateMetrics.avgCarbonIntensity;

  // Implied carbon price: premium / intensity differential
  // This represents the $/tCO2 implied by the valuation difference
  const impliedCarbonPrice = intensityDiff > 0 ? (valuationPremium * baselineMetrics.avgPeRatio) / intensityDiff : 0;

  return {
    valuationPremium,
    impliedCarbonPrice: Math.max(0, impliedCarbonPrice), // Ensure non-negative
  };
}

/**
 * Convert implied carbon price to annual decarbonization rate
 * Based on carbon price scenarios:
 * - $50/tCO2: ~2% annual reduction (slow transition)
 * - $100/tCO2: ~4% annual reduction (moderate transition)
 * - $200/tCO2: ~7% annual reduction (rapid transition)
 */
export function calculateImpliedDecarbRate(impliedCarbonPrice: number): number {
  // Piecewise linear interpolation
  if (impliedCarbonPrice <= 0) return 0;
  if (impliedCarbonPrice <= 50) return (impliedCarbonPrice / 50) * 0.02;
  if (impliedCarbonPrice <= 100) return 0.02 + ((impliedCarbonPrice - 50) / 50) * 0.02;
  if (impliedCarbonPrice <= 200) return 0.04 + ((impliedCarbonPrice - 100) / 100) * 0.03;
  
  // Above $200/tCO2, cap at 7% annual reduction
  return Math.min(0.07, 0.07 + ((impliedCarbonPrice - 200) / 200) * 0.01);
}

/**
 * Analyze portfolios for a specific date and investment type
 */
export function analyzePortfolio(
  investmentType: 'low_carbon' | 'decarbonizing' | 'solutions',
  companiesWithData: CompanyWithTimeSeries[],
  date: Date,
  thresholds: ClassificationThresholds,
  sector?: string,
  geography?: string
): PortfolioMetrics | null {
  // Classify companies
  const classification = classifyCompanies(companiesWithData, date, thresholds, sector, geography);

  // Get company IDs for the investment type
  const climateCompanies = classification[investmentType === 'low_carbon' ? 'lowCarbon' : investmentType];
  const baselineCompanies = classification.baseline;

  if (climateCompanies.length === 0 || baselineCompanies.length === 0) {
    return null;
  }

  // Calculate metrics for both portfolios
  const climateMetrics = calculatePortfolioMetrics(climateCompanies, companiesWithData, date);
  const baselineMetrics = calculatePortfolioMetrics(baselineCompanies, companiesWithData, date);

  if (!climateMetrics || !baselineMetrics) {
    return null;
  }

  // Calculate valuation premium and implied carbon price
  const { valuationPremium, impliedCarbonPrice } = calculateValuationPremium(climateMetrics, baselineMetrics);

  // Calculate implied decarbonization rate
  const impliedDecarbRate = calculateImpliedDecarbRate(impliedCarbonPrice);

  return {
    date,
    investmentType,
    geography,
    sector,
    avgCarbonIntensity: climateMetrics.avgCarbonIntensity,
    avgPeRatio: climateMetrics.avgPeRatio,
    valuationPremium,
    impliedCarbonPrice,
    impliedDecarbRate,
    portfolioSize: climateMetrics.portfolioSize,
    companies: climateCompanies,
  };
}

/**
 * Run full analysis across all dates and dimensions
 */
export function runFullAnalysis(
  companiesWithData: CompanyWithTimeSeries[],
  dates: Date[],
  thresholds: ClassificationThresholds,
  dimensions: {
    sectors?: string[];
    geographies?: string[];
  }
): PortfolioMetrics[] {
  const results: PortfolioMetrics[] = [];

  const investmentTypes: ('low_carbon' | 'decarbonizing' | 'solutions')[] = ['low_carbon', 'decarbonizing', 'solutions'];

  for (const date of dates) {
    for (const investmentType of investmentTypes) {
      // Aggregate analysis (no sector/geography filter)
      const aggregateResult = analyzePortfolio(investmentType, companiesWithData, date, thresholds);
      if (aggregateResult) {
        results.push(aggregateResult);
      }

      // By sector
      if (dimensions.sectors) {
        for (const sector of dimensions.sectors) {
          const sectorResult = analyzePortfolio(investmentType, companiesWithData, date, thresholds, sector);
          if (sectorResult) {
            results.push(sectorResult);
          }
        }
      }

      // By geography
      if (dimensions.geographies) {
        for (const geography of dimensions.geographies) {
          const geoResult = analyzePortfolio(investmentType, companiesWithData, date, thresholds, undefined, geography);
          if (geoResult) {
            results.push(geoResult);
          }
        }
      }
    }
  }

  return results;
}
