# Climate Scenario Analyzer

A comprehensive web application for reverse engineering climate transition scenarios from equity market valuations. The platform calculates implied decarbonization rates by analyzing valuation premiums between climate-aligned and baseline investment portfolios.

## Overview

This application enables financial analysts and climate researchers to:

1. **Upload Climate Data**: Process Excel files containing company descriptive data, time series (returns, market cap, P/E ratios), emissions data (Scope 1, 2, 3), green revenue alignment scores, and emission reduction targets.

2. **Classify Portfolios**: Automatically classify companies into three climate investment types:
   - **Low Carbon Intensity**: Companies in the bottom percentile by carbon emissions per market cap
   - **Decarbonizing Companies**: Companies with significant emission reduction targets by 2050
   - **Solutions Companies**: Companies with positive climate solution alignment scores

3. **Analyze Valuations**: Calculate valuation premiums between climate-aligned and baseline portfolios to infer implied carbon pricing.

4. **Infer Decarbonization Rates**: Convert implied carbon prices into annual emission reduction rates that markets are pricing in.

5. **Multi-Dimensional Analysis**: View results aggregated across all companies, or broken down by sector and region.

## Key Features

### Data Processing Engine
- Excel file parsing and validation
- Wide-to-long format transformation for time series data
- Carbon intensity calculation (Scope 1+2 and 1+2+3)
- Automatic data quality checks

### Portfolio Classification
- Configurable thresholds for each investment type
- Bottom percentile selection for low carbon portfolios
- Target-based classification for decarbonizing companies
- SDG alignment scoring for solutions companies
- Sector and regional filtering

### Valuation Analysis
- P/E ratio comparison between climate and baseline portfolios
- Valuation premium calculation
- Implied carbon price inference
- Decarbonization rate conversion using carbon price scenarios

### Interactive Dashboard
- Time series visualization of implied decarbonization rates
- Comparative analysis across three investment types
- Filtering by sector, region, and time period
- Adjustable classification thresholds
- CSV export functionality

## Methodology

### Carbon Intensity Calculation

Carbon intensity is calculated as total emissions divided by market capitalization:

```
Carbon Intensity = (Scope 1 + Scope 2 [+ Scope 3]) / (Market Cap / 1M)
```

This metric is expressed as tonnes of CO2 equivalent per million dollars of market cap.

### Portfolio Classification

**Low Carbon Intensity**: Companies are ranked by carbon intensity and the bottom percentile (default: 25%) is selected as the low carbon portfolio.

**Decarbonizing**: Companies with emission reduction targets exceeding a threshold (default: 50% by 2050) are classified as decarbonizing.

**Solutions**: Companies with SDG alignment scores above a threshold (default: 2.0) are classified as climate solutions providers.

**Baseline**: All companies not in any climate portfolio form the baseline for comparison.

### Valuation Premium

The valuation premium is calculated as:

```
Valuation Premium = (P/E_climate / P/E_baseline) - 1
```

This represents the percentage premium (or discount) that climate-aligned companies command relative to baseline companies.

### Implied Carbon Price

The implied carbon price is derived from the valuation premium and carbon intensity differential:

```
Implied Carbon Price = (Premium × P/E_baseline) / (Intensity_baseline - Intensity_climate)
```

This represents the $/tCO2 that would justify the observed valuation difference.

### Implied Decarbonization Rate

The annual decarbonization rate is inferred from the implied carbon price using a piecewise linear model based on carbon price scenarios:

- $0-50/tCO2: 0-2% annual reduction (slow transition)
- $50-100/tCO2: 2-4% annual reduction (moderate transition)
- $100-200/tCO2: 4-7% annual reduction (rapid transition)
- >$200/tCO2: Capped at ~7-8% annual reduction

## Data Requirements

### Required Excel Sheets

Your Excel file must contain the following sheets:

#### 1. Descriptive
Company reference information:
- ISIN (unique identifier, labeled as "Type")
- Company name
- Geography (region/country)
- Sector classification
- Industry classification

#### 2. RI (Total Return Index)
Time series of total return indices with:
- Company identifiers (matching Descriptive sheet)
- Monthly observations as columns

#### 3. MV (Market Cap)
Time series of market capitalization with:
- Company identifiers
- Monthly observations as columns

#### 4. S1, S2, S3 (Emissions)
Absolute emissions data by fiscal year:
- Company identifiers
- Fiscal year columns (e.g., FY08, FY09, ..., FY24)
- Values in tonnes of CO2 equivalent

#### 5. PE (Price-Earnings Ratio)
Time series of P/E ratios with:
- Company identifiers
- Monthly observations as columns

#### 6. GreenRev (Green Revenue Alignment)
Static data containing:
- Company identifiers
- SDG_07_NET_ALIGNMENT_SCORE column

#### 7. EmissionTargets
Static data containing:
- Company identifiers
- TARGET_SUMMARY_CUM_CHANGE_2050 column (cumulative change by 2050, e.g., -0.5 for 50% reduction)

## Usage Guide

### 1. Upload Data

1. Sign in to the application
2. Navigate to the Upload page
3. Select your Excel file (must be .xlsx or .xls format)
4. Click "Upload and Analyze"
5. Wait for processing to complete (typically 30-60 seconds for 2,000+ companies)

### 2. Configure Analysis

1. Navigate to the Analysis page for your uploaded dataset
2. Adjust classification thresholds:
   - **Low Carbon Percentile**: Select the bottom percentile for carbon intensity (10-50%)
   - **Decarbonizing Target**: Set minimum emission reduction by 2050 (30-100%)
   - **Solutions Score**: Set minimum SDG alignment score (0-7)
3. Click "Run Analysis" to calculate results

### 3. View Results

The main chart displays implied decarbonization rates over time for all three investment types.

Use filters to explore specific dimensions:
- **Investment Type**: Focus on one climate strategy
- **Geography**: Analyze specific regions
- **Sector**: Examine industry-specific trends

### 4. Export Results

Click "Export Results" to download a CSV file containing:
- Date
- Investment type
- Geography and sector (if filtered)
- Average carbon intensity
- Average P/E ratio
- Valuation premium
- Implied carbon price
- Implied decarbonization rate
- Portfolio size

## Technical Architecture

### Backend
- **Framework**: Express.js with tRPC for type-safe API
- **Database**: MySQL/TiDB with Drizzle ORM
- **Authentication**: Manus OAuth
- **File Storage**: AWS S3 for uploaded files
- **Data Processing**: Custom Excel parser with validation

### Frontend
- **Framework**: React 19 with TypeScript
- **UI Components**: shadcn/ui with Tailwind CSS 4
- **Charts**: Recharts for time series visualization
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter for lightweight routing

### Key Modules

**server/dataProcessor.ts**: Excel parsing and data transformation  
**server/portfolioAnalyzer.ts**: Portfolio classification and valuation analysis  
**server/db.ts**: Database operations and queries  
**server/routers.ts**: tRPC API endpoints  

**client/src/pages/Home.tsx**: Landing page  
**client/src/pages/Upload.tsx**: File upload interface  
**client/src/pages/Dashboard.tsx**: Upload history  
**client/src/pages/Analysis.tsx**: Interactive analysis dashboard  

## Development

### Prerequisites
- Node.js 22+
- pnpm package manager
- MySQL/TiDB database

### Setup
```bash
# Install dependencies
pnpm install

# Push database schema
pnpm db:push

# Run development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build

# Start production server
pnpm start
```

### Environment Variables

The following environment variables are automatically configured:

- `DATABASE_URL`: MySQL connection string
- `JWT_SECRET`: Session signing secret
- `VITE_APP_ID`: OAuth application ID
- `OAUTH_SERVER_URL`: OAuth backend URL
- `VITE_OAUTH_PORTAL_URL`: OAuth login portal URL

## Testing

The application includes comprehensive unit tests for core calculation functions:

```bash
pnpm test
```

Tests cover:
- Carbon intensity calculations
- Portfolio classification logic
- Valuation premium calculations
- Implied carbon price inference
- Decarbonization rate conversion

## Assumptions and Limitations

### Assumptions
1. **Market Efficiency**: Assumes that valuation differences reflect market expectations about future carbon costs
2. **Carbon Price Scenarios**: Uses simplified piecewise linear model to convert carbon prices to decarbonization rates
3. **Static Climate Metrics**: Assumes SDG alignment scores and emission targets remain constant over time
4. **Comparable Companies**: Assumes companies within portfolios are comparable in terms of business model and risk profile

### Limitations
1. **Data Quality**: Results depend on accuracy and completeness of input data
2. **Sector Differences**: Carbon intensity varies significantly across sectors; cross-sector comparisons may be misleading
3. **Temporal Alignment**: Emissions data (fiscal year) may not align perfectly with market data (calendar month)
4. **Causality**: Correlation between valuations and carbon metrics does not imply causation
5. **Forward-Looking**: Analysis is based on current market valuations and may not reflect long-term expectations

## Future Enhancements

- [ ] Add support for multiple Excel file formats
- [ ] Implement time-varying climate metrics
- [ ] Add sector-specific carbon price scenarios
- [ ] Include additional valuation metrics (EV/EBITDA, Price/Book)
- [ ] Add statistical significance testing
- [ ] Implement portfolio backtesting functionality
- [ ] Add API endpoints for programmatic access
- [ ] Support for custom carbon price scenarios

## License

MIT

## Support

For questions or issues, please contact the development team or open an issue in the project repository.
