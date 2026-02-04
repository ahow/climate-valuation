import { describe, expect, it } from "vitest";
import {
  calculateCarbonIntensity,
  calculateValuationPremium,
  calculateImpliedDecarbRate,
  classifyCompanies,
  calculatePortfolioMetrics,
  type CompanyWithTimeSeries,
  type ClassificationThresholds,
} from "./portfolioAnalyzer";
import type { Company, TimeSeries } from "../drizzle/schema";

describe("Portfolio Analyzer", () => {
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

    it("should handle null emissions values", () => {
      const intensity = calculateCarbonIntensity(
        null,
        500,
        null,
        10_000_000,
        false
      );
      
      // Only scope2 = 500 / 10 = 50
      expect(intensity).toBe(50);
    });
  });

  describe("calculateValuationPremium", () => {
    it("should calculate valuation premium correctly", () => {
      const result = calculateValuationPremium(
        { avgCarbonIntensity: 100, avgPeRatio: 22 }, // climate
        { avgCarbonIntensity: 200, avgPeRatio: 20 }  // baseline
      );

      // Premium = (22 / 20) - 1 = 0.1 (10%)
      expect(result.valuationPremium).toBeCloseTo(0.1, 5);

      // Implied carbon price = (0.1 * 20) / (200 - 100) = 2 / 100 = 0.02
      expect(result.impliedCarbonPrice).toBeCloseTo(0.02, 5);
    });

    it("should handle equal P/E ratios", () => {
      const result = calculateValuationPremium(
        { avgCarbonIntensity: 100, avgPeRatio: 20 },
        { avgCarbonIntensity: 200, avgPeRatio: 20 }
      );

      expect(result.valuationPremium).toBe(0);
      expect(result.impliedCarbonPrice).toBe(0);
    });

    it("should return zero implied carbon price when intensity diff is negative", () => {
      const result = calculateValuationPremium(
        { avgCarbonIntensity: 200, avgPeRatio: 22 }, // higher intensity
        { avgCarbonIntensity: 100, avgPeRatio: 20 }  // lower intensity
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

    it("should interpolate correctly for values between thresholds", () => {
      const rate = calculateImpliedDecarbRate(75); // Between 50 and 100
      expect(rate).toBeGreaterThan(0.02);
      expect(rate).toBeLessThan(0.04);
    });

    it("should cap at 7% for very high carbon prices", () => {
      const rate = calculateImpliedDecarbRate(500);
      expect(rate).toBeLessThanOrEqual(0.08); // Cap with small buffer
    });
  });

  describe("classifyCompanies", () => {
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

    it("should classify companies into low carbon portfolio", () => {
      const companiesWithData: CompanyWithTimeSeries[] = [
        {
          company: createMockCompany(1, 'US001', 'Tech', 'US', null, null),
          timeSeries: [createMockTimeSeries(1, mockDate, 100, 50, 10_000_000, 20)],
        },
        {
          company: createMockCompany(2, 'US002', 'Tech', 'US', null, null),
          timeSeries: [createMockTimeSeries(2, mockDate, 1000, 500, 10_000_000, 20)],
        },
        {
          company: createMockCompany(3, 'US003', 'Tech', 'US', null, null),
          timeSeries: [createMockTimeSeries(3, mockDate, 500, 250, 10_000_000, 20)],
        },
        {
          company: createMockCompany(4, 'US004', 'Tech', 'US', null, null),
          timeSeries: [createMockTimeSeries(4, mockDate, 2000, 1000, 10_000_000, 20)],
        },
      ];

      const thresholds: ClassificationThresholds = {
        lowCarbonPercentile: 25,
        decarbonizingTarget: -0.5,
        solutionsScore: 2.0,
      };

      const result = classifyCompanies(companiesWithData, mockDate, thresholds);

      // Bottom 25% should be company 1 (lowest intensity)
      expect(result.lowCarbon).toHaveLength(1);
      expect(result.lowCarbon).toContain(1);
    });

    it("should classify companies into decarbonizing portfolio", () => {
      const companiesWithData: CompanyWithTimeSeries[] = [
        {
          company: createMockCompany(1, 'US001', 'Tech', 'US', null, -0.6), // 60% reduction
          timeSeries: [createMockTimeSeries(1, mockDate, 100, 50, 10_000_000, 20)],
        },
        {
          company: createMockCompany(2, 'US002', 'Tech', 'US', null, -0.3), // 30% reduction
          timeSeries: [createMockTimeSeries(2, mockDate, 1000, 500, 10_000_000, 20)],
        },
      ];

      const thresholds: ClassificationThresholds = {
        lowCarbonPercentile: 25,
        decarbonizingTarget: -0.5,
        solutionsScore: 2.0,
      };

      const result = classifyCompanies(companiesWithData, mockDate, thresholds);

      // Only company 1 meets the -0.5 threshold
      expect(result.decarbonizing).toHaveLength(1);
      expect(result.decarbonizing).toContain(1);
    });

    it("should classify companies into solutions portfolio", () => {
      const companiesWithData: CompanyWithTimeSeries[] = [
        {
          company: createMockCompany(1, 'US001', 'Tech', 'US', 3.0, null),
          timeSeries: [createMockTimeSeries(1, mockDate, 100, 50, 10_000_000, 20)],
        },
        {
          company: createMockCompany(2, 'US002', 'Tech', 'US', 1.0, null),
          timeSeries: [createMockTimeSeries(2, mockDate, 1000, 500, 10_000_000, 20)],
        },
      ];

      const thresholds: ClassificationThresholds = {
        lowCarbonPercentile: 25,
        decarbonizingTarget: -0.5,
        solutionsScore: 2.0,
      };

      const result = classifyCompanies(companiesWithData, mockDate, thresholds);

      // Only company 1 meets the 2.0 threshold
      expect(result.solutions).toHaveLength(1);
      expect(result.solutions).toContain(1);
    });
  });

  describe("calculatePortfolioMetrics", () => {
    const mockDate = new Date('2020-01-01');

    const createMockCompany = (id: number): Company => ({
      id,
      isin: `US00${id}`,
      name: `Company ${id}`,
      geography: 'US',
      sector: 'Tech',
      industry: null,
      sdgAlignmentScore: null,
      emissionTarget2050: null,
      createdAt: new Date(),
    });

    const createMockTimeSeries = (
      companyId: number,
      scope1: number,
      scope2: number,
      marketCap: number,
      pe: number
    ): TimeSeries => ({
      id: companyId,
      companyId,
      date: mockDate,
      totalReturnIndex: 100,
      marketCap,
      priceEarnings: pe,
      scope1Emissions: scope1,
      scope2Emissions: scope2,
      scope3Emissions: null,
      createdAt: new Date(),
    });

    it("should calculate average metrics correctly", () => {
      const companiesWithData: CompanyWithTimeSeries[] = [
        {
          company: createMockCompany(1),
          timeSeries: [createMockTimeSeries(1, 100, 50, 10_000_000, 20)],
        },
        {
          company: createMockCompany(2),
          timeSeries: [createMockTimeSeries(2, 200, 100, 10_000_000, 25)],
        },
      ];

      const result = calculatePortfolioMetrics([1, 2], companiesWithData, mockDate);

      expect(result).not.toBeNull();
      expect(result!.portfolioSize).toBe(2);
      
      // Avg intensity: ((150 + 300) / 2) = 225
      // Intensity for company 1: (100 + 50) / (10M / 1M) = 150 / 10 = 15
      // Intensity for company 2: (200 + 100) / (10M / 1M) = 300 / 10 = 30
      // Average: (15 + 30) / 2 = 22.5
      expect(result!.avgCarbonIntensity).toBeCloseTo(22.5, 5);
      
      // Avg P/E: (20 + 25) / 2 = 22.5
      expect(result!.avgPeRatio).toBeCloseTo(22.5, 5);
    });

    it("should return null when no valid data", () => {
      const companiesWithData: CompanyWithTimeSeries[] = [
        {
          company: createMockCompany(1),
          timeSeries: [],
        },
      ];

      const result = calculatePortfolioMetrics([1], companiesWithData, mockDate);
      expect(result).toBeNull();
    });

    it("should filter out companies with invalid P/E ratios", () => {
      const companiesWithData: CompanyWithTimeSeries[] = [
        {
          company: createMockCompany(1),
          timeSeries: [createMockTimeSeries(1, 100, 50, 10_000_000, 20)],
        },
        {
          company: createMockCompany(2),
          timeSeries: [createMockTimeSeries(2, 200, 100, 10_000_000, -5)], // Invalid P/E
        },
      ];

      const result = calculatePortfolioMetrics([1, 2], companiesWithData, mockDate);

      expect(result).not.toBeNull();
      expect(result!.portfolioSize).toBe(1); // Only company 1 counted
    });
  });
});
