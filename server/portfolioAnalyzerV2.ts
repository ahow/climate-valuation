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
  carbonRiskDiscount: number; // Inverted: negative for high carbon companies
  impliedCarbonPrice: number;
  impliedDecarbRate: number;
  portfolioSize: number;
  companies: number[];
  methodology: 'relative' | 'dcf';
}

export interface ClassificationThresholds {
  tertileApproach: boolean; // Use tertiles (bottom vs top third) instead of percentiles
  lowCarbonPercentile?: number; // For backward compatibility
  decarbonizingTarget?: number; // For backward compatibility
  solutionsScore?: number; // For backward compatibility
}

export interface AnalysisParameters {
  includeScope3: boolean; // Use Scope 1+2+3 vs Scope 1+2
  methodology: 'relative' | 'dcf';
  sectorGranularity: 'sector' | 'industry'; // Which classification level to use
  thresholds: ClassificationThresholds;
}

/**
 * Map geography to common regions
 */
export function mapGeographyToRegion(geography: string | null): string {
  if (!geography) return 'Unknown';
  
  const geo = geography.toUpperCase();
  
  // North America
  if (['US', 'USA', 'UNITED STATES', 'CA', 'CANADA', 'MX', 'MEXICO'].includes(geo)) {
    return 'North America';
  }
  
  // Europe
  if (['UK', 'GB', 'UNITED KINGDOM', 'DE', 'GERMANY', 'FR', 'FRANCE', 'IT', 'ITALY', 
       'ES', 'SPAIN', 'NL', 'NETHERLANDS', 'BE', 'BELGIUM', 'CH', 'SWITZERLAND',
       'SE', 'SWEDEN', 'NO', 'NORWAY', 'DK', 'DENMARK', 'FI', 'FINLAND',
       'AT', 'AUSTRIA', 'PL', 'POLAND', 'IE', 'IRELAND', 'PT', 'PORTUGAL'].includes(geo)) {
    return 'Europe';
  }
  
  // Asia-Pacific
  if (['JP', 'JAPAN', 'CN', 'CHINA', 'KR', 'KOREA', 'SOUTH KOREA', 'AU', 'AUSTRALIA',
       'IN', 'INDIA', 'SG', 'SINGAPORE', 'HK', 'HONG KONG', 'TW', 'TAIWAN',
       'TH', 'THAILAND', 'MY', 'MALAYSIA', 'ID', 'INDONESIA', 'NZ', 'NEW ZEALAND'].includes(geo)) {
    return 'Asia-Pacific';
  }
  
  // Latin America
  if (['BR', 'BRAZIL', 'AR', 'ARGENTINA', 'CL', 'CHILE', 'CO', 'COLOMBIA', 'PE', 'PERU'].includes(geo)) {
    return 'Latin America';
  }
  
  // Middle East & Africa
  if (['SA', 'SAUDI ARABIA', 'AE', 'UAE', 'IL', 'ISRAEL', 'ZA', 'SOUTH AFRICA',
       'EG', 'EGYPT', 'NG', 'NIGERIA', 'KE', 'KENYA'].includes(geo)) {
    return 'Middle East & Africa';
  }
  
  return 'Other';
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
 * Classify companies into tertiles within each sector
 * Returns bottom third (low carbon) vs top third (high carbon) for each metric
 */
export function classifyCompaniesSectorRelative(
  companiesWithData: CompanyWithTimeSeries[],
  date: Date,
  parameters: AnalysisParameters,
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

  // Filter by geography if specified (after mapping to region)
  let filteredCompanies = companiesWithData;
  if (geography) {
    filteredCompanies = filteredCompanies.filter(c => 
      mapGeographyToRegion(c.company.geography) === geography
    );
  }

  // Group companies by sector (or industry based on granularity)
  const sectorField = parameters.sectorGranularity === 'industry' ? 'industry' : 'sector';
  const companiesBySector = new Map<string, CompanyWithTimeSeries[]>();
  
  for (const companyData of filteredCompanies) {
    const sectorValue = companyData.company[sectorField];
    if (!sectorValue) continue;
    
    if (!companiesBySector.has(sectorValue)) {
      companiesBySector.set(sectorValue, []);
    }
    companiesBySector.get(sectorValue)!.push(companyData);
  }

  // Process each sector independently
  for (const [sector, sectorCompanies] of Array.from(companiesBySector.entries())) {
    // 1. LOW CARBON INTENSITY: Bottom tertile by carbon intensity within sector
    const intensities: { companyId: number; intensity: number }[] = [];
    
    for (const { company, timeSeries } of sectorCompanies) {
      const ts = timeSeries.find((t: TimeSeries) => t.date.getTime() === date.getTime());
      if (!ts || !company.id) continue;

      const intensity = calculateCarbonIntensity(
        ts.scope1Emissions,
        ts.scope2Emissions,
        ts.scope3Emissions,
        ts.marketCap,
        parameters.includeScope3
      );

      if (intensity !== null) {
        intensities.push({ companyId: company.id, intensity });
      }
    }

    // Sort by intensity (low to high) and take bottom third
    intensities.sort((a, b) => a.intensity - b.intensity);
    const tertileSize = Math.floor(intensities.length / 3);
    
    for (let i = 0; i < tertileSize && i < intensities.length; i++) {
      result.lowCarbon.push(intensities[i].companyId);
    }

    // 2. DECARBONIZING: Bottom tertile by emission target (most negative = most ambitious)
    const targets: { companyId: number; target: number }[] = [];
    
    for (const { company } of sectorCompanies) {
      if (company.id && company.emissionTarget2050 !== null) {
        targets.push({ companyId: company.id, target: company.emissionTarget2050 });
      }
    }

    targets.sort((a, b) => a.target - b.target); // Most negative first
    const targetTertileSize = Math.floor(targets.length / 3);
    
    for (let i = 0; i < targetTertileSize && i < targets.length; i++) {
      result.decarbonizing.push(targets[i].companyId);
    }

    // 3. SOLUTIONS: Top tertile by SDG alignment score (highest scores)
    const scores: { companyId: number; score: number }[] = [];
    
    for (const { company } of sectorCompanies) {
      if (company.id && company.sdgAlignmentScore !== null) {
        scores.push({ companyId: company.id, score: company.sdgAlignmentScore });
      }
    }

    scores.sort((a, b) => b.score - a.score); // Highest first
    const scoreTertileSize = Math.floor(scores.length / 3);
    
    for (let i = 0; i < scoreTertileSize && i < scores.length; i++) {
      result.solutions.push(scores[i].companyId);
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
 * Calculate carbon risk discount using INVERTED logic
 * Higher carbon intensity = LOWER valuation (discount)
 * Lower carbon intensity = HIGHER valuation (premium)
 */
export function calculateCarbonRiskDiscount(
  climateMetrics: { avgCarbonIntensity: number; avgPeRatio: number },
  baselineMetrics: { avgCarbonIntensity: number; avgPeRatio: number }
): {
  carbonRiskDiscount: number;
  impliedCarbonPrice: number;
} {
  // Carbon risk discount: (P/E_climate / P/E_baseline) - 1
  // Positive = climate companies valued higher (carbon premium)
  // Negative = climate companies valued lower (should not happen with correct classification)
  const carbonRiskDiscount = (climateMetrics.avgPeRatio / baselineMetrics.avgPeRatio) - 1;

  // Carbon intensity differential (baseline - climate)
  // Should be positive if climate companies have lower intensity
  const intensityDiff = baselineMetrics.avgCarbonIntensity - climateMetrics.avgCarbonIntensity;

  // Implied carbon price: discount / intensity differential
  // This represents the $/tCO2 implied by the valuation difference
  const impliedCarbonPrice = intensityDiff > 0 ? (carbonRiskDiscount * baselineMetrics.avgPeRatio) / intensityDiff : 0;

  return {
    carbonRiskDiscount,
    impliedCarbonPrice: Math.max(0, impliedCarbonPrice), // Ensure non-negative
  };
}

/**
 * Calculate implied carbon price using DCF methodology
 * Assumes carbon costs reduce future cash flows
 */
export function calculateImpliedCarbonPriceDCF(
  climateMetrics: { avgCarbonIntensity: number; avgPeRatio: number },
  baselineMetrics: { avgCarbonIntensity: number; avgPeRatio: number },
  discountRate: number = 0.08, // 8% WACC assumption
  carbonCostHorizon: number = 30 // Years to model carbon costs
): {
  carbonRiskDiscount: number;
  impliedCarbonPrice: number;
} {
  // Valuation difference
  const carbonRiskDiscount = (climateMetrics.avgPeRatio / baselineMetrics.avgPeRatio) - 1;
  
  // Carbon intensity differential
  const intensityDiff = baselineMetrics.avgCarbonIntensity - climateMetrics.avgCarbonIntensity;
  
  if (intensityDiff <= 0) {
    return { carbonRiskDiscount, impliedCarbonPrice: 0 };
  }

  // DCF approach: Present value of carbon costs
  // PV = Σ(carbon_cost * intensity_diff) / (1 + r)^t
  // Solve for carbon_cost given observed valuation difference
  
  // Simplified: assume constant carbon cost over horizon
  // PV_factor = Σ(1 / (1 + r)^t) for t=1 to horizon
  let pvFactor = 0;
  for (let t = 1; t <= carbonCostHorizon; t++) {
    pvFactor += 1 / Math.pow(1 + discountRate, t);
  }
  
  // Valuation difference (in dollars) = carbon_price * intensity_diff * PV_factor
  // Assuming P/E represents value per unit of earnings
  const valuationDiff = carbonRiskDiscount * baselineMetrics.avgPeRatio;
  
  // Solve for implied carbon price
  const impliedCarbonPrice = valuationDiff / (intensityDiff * pvFactor);

  return {
    carbonRiskDiscount,
    impliedCarbonPrice: Math.max(0, impliedCarbonPrice),
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
  parameters: AnalysisParameters,
  sector?: string,
  geography?: string
): PortfolioMetrics | null {
  // Classify companies using sector-relative approach
  const classification = classifyCompaniesSectorRelative(
    companiesWithData,
    date,
    parameters,
    geography
  );

  // Get company IDs for the investment type
  const climateCompanies = classification[investmentType === 'low_carbon' ? 'lowCarbon' : investmentType];
  const baselineCompanies = classification.baseline;

  if (climateCompanies.length === 0 || baselineCompanies.length === 0) {
    return null;
  }

  // Calculate metrics for both portfolios
  const climateMetrics = calculatePortfolioMetrics(
    climateCompanies,
    companiesWithData,
    date,
    parameters.includeScope3
  );
  const baselineMetrics = calculatePortfolioMetrics(
    baselineCompanies,
    companiesWithData,
    date,
    parameters.includeScope3
  );

  if (!climateMetrics || !baselineMetrics) {
    return null;
  }

  // Calculate carbon risk discount and implied carbon price
  let carbonRiskDiscount: number;
  let impliedCarbonPrice: number;

  if (parameters.methodology === 'dcf') {
    const dcfResult = calculateImpliedCarbonPriceDCF(climateMetrics, baselineMetrics);
    carbonRiskDiscount = dcfResult.carbonRiskDiscount;
    impliedCarbonPrice = dcfResult.impliedCarbonPrice;
  } else {
    const relativeResult = calculateCarbonRiskDiscount(climateMetrics, baselineMetrics);
    carbonRiskDiscount = relativeResult.carbonRiskDiscount;
    impliedCarbonPrice = relativeResult.impliedCarbonPrice;
  }

  // Calculate implied decarbonization rate
  const impliedDecarbRate = calculateImpliedDecarbRate(impliedCarbonPrice);

  return {
    date,
    investmentType,
    geography,
    sector,
    avgCarbonIntensity: climateMetrics.avgCarbonIntensity,
    avgPeRatio: climateMetrics.avgPeRatio,
    carbonRiskDiscount,
    impliedCarbonPrice,
    impliedDecarbRate,
    portfolioSize: climateMetrics.portfolioSize,
    companies: climateCompanies,
    methodology: parameters.methodology,
  };
}

/**
 * Run full analysis across all dates and dimensions
 */
export function runFullAnalysis(
  companiesWithData: CompanyWithTimeSeries[],
  dates: Date[],
  parameters: AnalysisParameters,
  dimensions: {
    sectors?: string[];
    geographies?: string[];
  }
): PortfolioMetrics[] {
  const results: PortfolioMetrics[] = [];

  const investmentTypes: ('low_carbon' | 'decarbonizing' | 'solutions')[] = [
    'low_carbon',
    'decarbonizing',
    'solutions'
  ];

  // Map geographies to regions
  const regions = dimensions.geographies?.map(g => mapGeographyToRegion(g)) || [];
  const uniqueRegions = Array.from(new Set(regions));

  for (const date of dates) {
    for (const investmentType of investmentTypes) {
      // Aggregate analysis (no sector/geography filter)
      const aggregateResult = analyzePortfolio(
        investmentType,
        companiesWithData,
        date,
        parameters
      );
      if (aggregateResult) {
        results.push(aggregateResult);
      }

      // By sector
      if (dimensions.sectors) {
        for (const sector of dimensions.sectors) {
          const sectorResult = analyzePortfolio(
            investmentType,
            companiesWithData,
            date,
            parameters,
            sector
          );
          if (sectorResult) {
            results.push(sectorResult);
          }
        }
      }

      // By region
      for (const region of uniqueRegions) {
        const regionResult = analyzePortfolio(
          investmentType,
          companiesWithData,
          date,
          parameters,
          undefined,
          region
        );
        if (regionResult) {
          results.push(regionResult);
        }
      }
    }
  }

  return results;
}
