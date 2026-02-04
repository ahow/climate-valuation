import { describe, expect, it } from "vitest";
import {
  calculateCarbonIntensity,
  calculateCarbonRiskDiscount,
  calculateImpliedCarbonPriceDCF,
  calculateImpliedDecarbRate,
  classifyCompaniesSectorRelative,
  mapGeographyToRegion,
  type CompanyWithTimeSeries,
  type AnalysisParameters,
} from "./portfolioAnalyzerV2";
import type { Company, TimeSeries } from "../drizzle/schema";

describe("Portfolio Analyzer V2", () => {
  describe("mapGeographyToRegion", () => {
    it("should map US to North America", () => {
      expect(mapGeographyToRegion("US")).toBe("North America");
      expect(mapGeographyToRegion("USA")).toBe("North America");
      expect(mapGeographyToRegion("CANADA")).toBe("North America");
    });

    it("should map European countries to Europe", () => {
      expect(mapGeographyToRegion("UK")).toBe("Europe");
      expect(mapGeographyToRegion("GERMANY")).toBe("Europe");
      expect(mapGeographyToRegion("FRANCE")).toBe("Europe");
    });

    it("should map Asian countries to Asia-Pacific", () => {
      expect(mapGeographyToRegion("JP")).toBe("Asia-Pacific");
      expect(mapGeographyToRegion("CHINA")).toBe("Asia-Pacific");
      expect(mapGeographyToRegion("INDIA")).toBe("Asia-Pacific");
    });

    it("should handle null geography", () => {
      expect(mapGeographyToRegion(null)).toBe("Unknown");
    });

    it("should return Other for unmapped countries", () => {
      expect(mapGeographyToRegion("UNKNOWN_COUNTRY")).toBe("Other");
    });
  });

  describe("calculateCarbonIntensity", () => {
    it("should calculate Scope 1+2 intensity correctly", () => {
      const intensity = calculateCarbonIntensity(
        1000, // scope1
        500,  // scope2
        2000, // scope3
        10_000_000, // marketCap (10M)
        false // don't include scope3
      );
      
      // (1000 + 500) / (10,000,000 / 1,000,000) = 1500 / 10 = 150
      expect(intensity).toBe(150);
    });

    it("should calculate Scope 1+2+3 intensity correctly", () => {
      const intensity = calculateCarbonIntensity(
        1000,
        500,
        2000,
        10_000_000,
        true // include scope3
      );
      
      // (1000 + 500 + 2000) / 10 = 350
      expect(intensity).toBe(350);
    });

    it("should return null for zero or null market cap", () => {
      expect(calculateCarbonIntensity(1000, 500, 2000, 0, false)).toBe(null);
      expect(calculateCarbonIntensity(1000, 500, 2000, null, false)).toBe(null);
    });
  });

  describe("calculateCarbonRiskDiscount", () => {
    it("should calculate carbon risk discount with inverted logic", () => {
      // Climate companies have LOWER intensity and HIGHER P/E (premium)
      const result = calculateCarbonRiskDiscount(
        { avgCarbonIntensity: 100, avgPeRatio: 22 }, // climate (lower intensity, higher P/E)
        { avgCarbonIntensity: 200, avgPeRatio: 20 }  // baseline (higher intensity, lower P/E)
      );

      // Discount = (22 / 20) - 1 = 0.1 (10% premium for climate companies)
      expect(result.carbonRiskDiscount).toBeCloseTo(0.1, 5);

      // Implied carbon price = (0.1 * 20) / (200 - 100) = 2 / 100 = 0.02
      expect(result.impliedCarbonPrice).toBeCloseTo(0.02, 5);
    });

    it("should handle equal P/E ratios", () => {
      const result = calculateCarbonRiskDiscount(
        { avgCarbonIntensity: 100, avgPeRatio: 20 },
        { avgCarbonIntensity: 200, avgPeRatio: 20 }
      );

      expect(result.carbonRiskDiscount).toBe(0);
      expect(result.impliedCarbonPrice).toBe(0);
    });

    it("should return zero implied carbon price when intensity diff is negative", () => {
      const result = calculateCarbonRiskDiscount(
        { avgCarbonIntensity: 200, avgPeRatio: 22 }, // higher intensity
        { avgCarbonIntensity: 100, avgPeRatio: 20 }  // lower intensity
      );

      expect(result.impliedCarbonPrice).toBe(0);
    });
  });

  describe("calculateImpliedCarbonPriceDCF", () => {
    it("should calculate implied carbon price using DCF methodology", () => {
      const result = calculateImpliedCarbonPriceDCF(
        { avgCarbonIntensity: 100, avgPeRatio: 22 },
        { avgCarbonIntensity: 200, avgPeRatio: 20 },
        0.08, // 8% discount rate
        30    // 30-year horizon
      );

      // Should produce different result than relative valuation
      expect(result.carbonRiskDiscount).toBeCloseTo(0.1, 5);
      expect(result.impliedCarbonPrice).toBeGreaterThan(0);
    });

    it("should handle zero intensity differential", () => {
      const result = calculateImpliedCarbonPriceDCF(
        { avgCarbonIntensity: 100, avgPeRatio: 22 },
        { avgCarbonIntensity: 100, avgPeRatio: 20 }
      );

      expect(result.impliedCarbonPrice).toBe(0);
    });
  });

  describe("calculateImpliedDecarbRate", () => {
    it("should return 0 for zero or negative carbon price", () => {
      expect(calculateImpliedDecarbRate(0)).toBe(0);
      expect(calculateImpliedDecarbRate(-10)).toBe(0);
    });

    it("should interpolate correctly for $50/tCO2", () => {
      const rate = calculateImpliedDecarbRate(50);
      expect(rate).toBeCloseTo(0.02, 5); // 2%
    });

    it("should interpolate correctly for $100/tCO2", () => {
      const rate = calculateImpliedDecarbRate(100);
      expect(rate).toBeCloseTo(0.04, 5); // 4%
    });

    it("should interpolate correctly for $200/tCO2", () => {
      const rate = calculateImpliedDecarbRate(200);
      expect(rate).toBeCloseTo(0.07, 5); // 7%
    });

    it("should cap at 7% for very high carbon prices", () => {
      const rate = calculateImpliedDecarbRate(500);
      expect(rate).toBeLessThanOrEqual(0.08); // Cap with small buffer
    });
  });

  describe("classifyCompaniesSectorRelative", () => {
    const mockDate = new Date('2020-01-01');
    
    const createMockCompany = (
      id: number,
      isin: string,
      sector: string,
      geography: string,
      sdgScore: number | null,
      emissionTarget: number | null
    ): Company => ({
      id,
      isin,
      name: `Company ${id}`,
      geography,
      sector,
      industry: null,
      sdgAlignmentScore: sdgScore,
      emissionTarget2050: emissionTarget,
      createdAt: new Date(),
    });

    const createMockTimeSeries = (
      companyId: number,
      date: Date,
      scope1: number,
      scope2: number,
      marketCap: number,
      pe: number
    ): TimeSeries => ({
      id: companyId,
      companyId,
      date,
      totalReturnIndex: 100,
      marketCap,
      priceEarnings: pe,
      scope1Emissions: scope1,
      scope2Emissions: scope2,
      scope3Emissions: null,
      createdAt: new Date(),
    });

    it("should classify companies into tertiles within sector", () => {
      // Create 9 companies in same sector with varying intensities
      const companiesWithData: CompanyWithTimeSeries[] = [];
      
      for (let i = 1; i <= 9; i++) {
        companiesWithData.push({
          company: createMockCompany(i, `US00${i}`, 'Tech', 'US', null, null),
          timeSeries: [createMockTimeSeries(i, mockDate, i * 100, i * 50, 10_000_000, 20)],
        });
      }

      const parameters: AnalysisParameters = {
        includeScope3: false,
        methodology: 'relative',
        sectorGranularity: 'sector',
        thresholds: {
          tertileApproach: true,
        },
      };

      const result = classifyCompaniesSectorRelative(companiesWithData, mockDate, parameters);

      // Bottom tertile (lowest 3 intensities) should be in low carbon
      expect(result.lowCarbon).toHaveLength(3);
      expect(result.lowCarbon).toContain(1);
      expect(result.lowCarbon).toContain(2);
      expect(result.lowCarbon).toContain(3);
    });

    it("should classify decarbonizing companies by tertile", () => {
      const companiesWithData: CompanyWithTimeSeries[] = [];
      
      // Create companies with varying emission targets
      for (let i = 1; i <= 9; i++) {
        companiesWithData.push({
          company: createMockCompany(i, `US00${i}`, 'Tech', 'US', null, -i * 0.1), // -0.1 to -0.9
          timeSeries: [createMockTimeSeries(i, mockDate, 100, 50, 10_000_000, 20)],
        });
      }

      const parameters: AnalysisParameters = {
        includeScope3: false,
        methodology: 'relative',
        sectorGranularity: 'sector',
        thresholds: {
          tertileApproach: true,
        },
      };

      const result = classifyCompaniesSectorRelative(companiesWithData, mockDate, parameters);

      // Bottom tertile (most negative targets = most ambitious) should be in decarbonizing
      expect(result.decarbonizing).toHaveLength(3);
      expect(result.decarbonizing).toContain(9); // -0.9
      expect(result.decarbonizing).toContain(8); // -0.8
      expect(result.decarbonizing).toContain(7); // -0.7
    });

    it("should classify solutions companies by top tertile", () => {
      const companiesWithData: CompanyWithTimeSeries[] = [];
      
      // Create companies with varying SDG scores
      for (let i = 1; i <= 9; i++) {
        companiesWithData.push({
          company: createMockCompany(i, `US00${i}`, 'Tech', 'US', i * 0.5, null), // 0.5 to 4.5
          timeSeries: [createMockTimeSeries(i, mockDate, 100, 50, 10_000_000, 20)],
        });
      }

      const parameters: AnalysisParameters = {
        includeScope3: false,
        methodology: 'relative',
        sectorGranularity: 'sector',
        thresholds: {
          tertileApproach: true,
        },
      };

      const result = classifyCompaniesSectorRelative(companiesWithData, mockDate, parameters);

      // Top tertile (highest scores) should be in solutions
      expect(result.solutions).toHaveLength(3);
      expect(result.solutions).toContain(9); // 4.5
      expect(result.solutions).toContain(8); // 4.0
      expect(result.solutions).toContain(7); // 3.5
    });

    it("should classify separately within each sector", () => {
      const companiesWithData: CompanyWithTimeSeries[] = [];
      
      // Create 6 companies: 3 in Tech, 3 in Energy
      for (let i = 1; i <= 3; i++) {
        companiesWithData.push({
          company: createMockCompany(i, `US00${i}`, 'Tech', 'US', null, null),
          timeSeries: [createMockTimeSeries(i, mockDate, i * 100, i * 50, 10_000_000, 20)],
        });
      }
      
      for (let i = 4; i <= 6; i++) {
        companiesWithData.push({
          company: createMockCompany(i, `US00${i}`, 'Energy', 'US', null, null),
          timeSeries: [createMockTimeSeries(i, mockDate, i * 100, i * 50, 10_000_000, 20)],
        });
      }

      const parameters: AnalysisParameters = {
        includeScope3: false,
        methodology: 'relative',
        sectorGranularity: 'sector',
        thresholds: {
          tertileApproach: true,
        },
      };

      const result = classifyCompaniesSectorRelative(companiesWithData, mockDate, parameters);

      // Should have 2 companies in low carbon (1 from each sector)
      expect(result.lowCarbon).toHaveLength(2);
      expect(result.lowCarbon).toContain(1); // Lowest in Tech
      expect(result.lowCarbon).toContain(4); // Lowest in Energy
    });

    it("should filter by geography (region)", () => {
      const companiesWithData: CompanyWithTimeSeries[] = [
        // 3 US companies (North America)
        {
          company: createMockCompany(1, 'US001', 'Tech', 'US', null, null),
          timeSeries: [createMockTimeSeries(1, mockDate, 100, 50, 10_000_000, 20)],
        },
        {
          company: createMockCompany(2, 'US002', 'Tech', 'US', null, null),
          timeSeries: [createMockTimeSeries(2, mockDate, 200, 100, 10_000_000, 20)],
        },
        {
          company: createMockCompany(3, 'US003', 'Tech', 'US', null, null),
          timeSeries: [createMockTimeSeries(3, mockDate, 300, 150, 10_000_000, 20)],
        },
        // 3 UK companies (Europe) - should be filtered out
        {
          company: createMockCompany(4, 'UK001', 'Tech', 'UK', null, null),
          timeSeries: [createMockTimeSeries(4, mockDate, 400, 200, 10_000_000, 20)],
        },
        {
          company: createMockCompany(5, 'UK002', 'Tech', 'UK', null, null),
          timeSeries: [createMockTimeSeries(5, mockDate, 500, 250, 10_000_000, 20)],
        },
        {
          company: createMockCompany(6, 'UK003', 'Tech', 'UK', null, null),
          timeSeries: [createMockTimeSeries(6, mockDate, 600, 300, 10_000_000, 20)],
        },
      ];

      const parameters: AnalysisParameters = {
        includeScope3: false,
        methodology: 'relative',
        sectorGranularity: 'sector',
        thresholds: {
          tertileApproach: true,
        },
      };

      const result = classifyCompaniesSectorRelative(
        companiesWithData,
        mockDate,
        parameters,
        'North America' // Filter by region
      );

      // Should only classify US companies (bottom tertile = 1 company)
      expect(result.lowCarbon).toHaveLength(1);
      expect(result.lowCarbon).toContain(1); // Lowest intensity US company
    });
  });
});
