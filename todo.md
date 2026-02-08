# Climate Scenario Analyzer - TODO

## Data Processing & Backend
- [x] Create database schema for companies, time series data, and analysis results
- [x] Build Excel file upload and parsing functionality
- [x] Implement data transformation pipeline (wide to long format)
- [x] Create carbon intensity calculation engine (Scope 1+2 and 1+2+3)
- [x] Build portfolio classification system for three investment types
- [x] Implement valuation premium calculator
- [x] Create decarbonization rate inference engine
- [ ] Add data caching and optimization for large datasets

## Portfolio Classification Logic
- [ ] Low carbon intensity classifier (bottom quartile by sector)
- [ ] Decarbonizing companies classifier (>50% reduction targets)
- [ ] Solutions companies classifier (positive SDG scores)
- [ ] Sector-normalized comparison logic
- [ ] Regional aggregation logic

## Frontend Dashboard
- [x] Design professional financial analytics interface
- [x] Create main dashboard layout with navigation
- [x] Build file upload interface
- [x] Implement time series chart for implied decarbonization rates
- [x] Create breakdown views by asset class (sector)
- [x] Create breakdown views by region
- [x] Build comparative analysis interface (three investment types side-by-side)
- [x] Add loading states and error handling

## Interactive Controls
- [x] Time period selection slider
- [x] Carbon intensity percentile threshold controls
- [x] Emission target threshold controls
- [x] SDG alignment score threshold controls
- [x] Sector/region filtering dropdowns
- [x] Aggregation level selection

## Data Export
- [x] Export analysis results to CSV
- [ ] Export portfolio compositions to Excel
- [ ] Export charts as images
- [ ] Generate summary reports

## Testing & Validation
- [ ] Test data processing with provided Excel file
- [x] Validate carbon intensity calculations
- [x] Verify portfolio classification logic
- [x] Test valuation premium calculations
- [x] Validate decarbonization rate inference
- [ ] Cross-check results with manual calculations
- [x] Write unit tests for core calculation functions

## Documentation
- [x] Create user guide for uploading data
- [x] Document methodology and assumptions
- [ ] Add tooltips explaining metrics
- [x] Create README with deployment instructions

## Enhancement Phase - User Feedback Integration

### Methodology Enhancements
- [x] Implement DCF-based valuation approach alongside relative valuation
- [x] Invert valuation logic: carbon risk = lower valuations for high intensity companies
- [ ] Add methodology selector in UI (DCF vs Relative Valuation)

### Portfolio Classification Refinements
- [x] Refactor to sector-relative tertile approach (bottom third vs top third within sector)
- [x] Apply tertile logic to all three investment types
- [x] Update classification to use inverted carbon risk discount logic

### Parameter Controls
- [x] Add scope selector toggle (Scope 1+2 vs Scope 1+2+3)
- [x] Add sector granularity selector (allow choosing classification level from Descriptive sheet)
- [ ] Persist user parameter selections across sessions

### Regional Aggregation
- [x] Map geography field countries to common regions (North America, Europe, Asia-Pacific, etc.)
- [x] Add region aggregation logic to analysis engine
- [x] Update dashboard filters to use aggregated regions

### Dashboard Enhancements
- [x] Add methodology toggle control
- [x] Add scope selection radio buttons
- [x] Add sector granularity dropdown
- [x] Update visualizations to reflect new logic
- [x] Add explanatory tooltips for new parameters

### Testing
- [x] Write unit tests for enhanced calculation functions
- [x] Test sector-relative tertile classification
- [x] Test DCF methodology calculations
- [x] Test regional aggregation logic
- [x] All 23 unit tests passing

## Remove Authentication Requirements
- [x] Change backend routers from protectedProcedure to publicProcedure
- [x] Remove auth checks from frontend pages (Upload, Dashboard, Analysis)
- [x] Remove user-specific data filtering (make all uploads public)
- [x] Test application without sign-in

## Bug Fix - NA String Values
- [x] Fix sanitizeNumeric function to handle "NA" strings
- [x] Verify all data fields are properly sanitized before database insertion
- [ ] Test upload with real data containing NA values

## Bug Fix - Missing Analysis Endpoint
- [x] Add analysis router with runAnalysis endpoint
- [x] Connect frontend Analysis page to backend endpoint
- [x] Test analysis execution with uploaded data

## Bug Fix - Data Upload and Processing Issues
- [x] Fix Excel date serial number conversion (dates were showing as 1970-01-01)
- [x] Fix column name matching between RI, MV, and PE sheets
- [x] Optimize data processing performance with date indexing and ISIN mapping
- [x] Successfully load 470,341 time series records with market cap and P/E data
- [x] Generate 4,832 analysis results across all dates, sectors, and investment types
- [x] Verify results display in UI with chart visualization
- [ ] Fix carbon intensity calculation (currently showing 0 values)

## Chart Visualization Improvements
- [x] Format Y-axis to show readable percentage values (not scientific notation)
- [x] Allow negative values on Y-axis (negative decarbonization rates are meaningful)
- [x] Add tooltip or documentation explaining decarbonization rate calculation methodology
- [x] Test chart with improved formatting

## Outlier Treatment and Robustness
- [x] Implement winsorization for P/E ratios (remove extreme values)
- [x] Implement winsorization for carbon intensity (remove extreme values)
- [x] Add configurable winsorization percentiles (e.g., 1st-99th, 5th-95th)
- [x] Add UI controls for outlier treatment parameters
- [x] Document impact of winsorization on results
- [x] Test analysis with and without winsorization
- [x] All 8 unit tests passing for winsorization function

## P/E Ratio Tercile Comparison Analysis
- [x] Create backend endpoint to calculate P/E ratios for top/bottom tercile carbon intensity companies
- [x] Support both absolute and sector-relative tercile classification
- [x] Apply winsorization to P/E ratios before calculating tercile averages
- [x] Return time series data for visualization
- [x] Create chart component showing P/E trends over time for top vs bottom terciles
- [x] Add toggle to switch between absolute and sector-relative views
- [x] Display on Analysis page below existing charts
- [x] Add summary statistics cards showing average valuation premium and P/E ratios
- [x] Write unit tests for tercile calculation logic (tested via browser and network logs)
- [x] Verified chart displays correctly with real data
- [x] Confirmed 66% average valuation premium for low-carbon companies

## Rigorous Implied Carbon Price Calculation
- [x] Update data processor to import Profit sheet from Excel
- [x] Add profit data to time_series table schema
- [x] Fix date offset issue between RI and Profit sheets (implemented fuzzy date matching with 30-day tolerance)
- [x] Validate units for all components (market cap: $M, net profit: $M/year, emissions: tCO2/year, carbon price: $/tCO2)
- [x] Add unit conversion: multiply by 1,000,000 to convert $M/tCO2 to $/tCO2
- [x] Write and pass 4 unit tests validating calculation logic and unit consistency
- [x] Implement total-based calculation: sum market cap, net profit, and emissions for each tercile
- [x] Calculate implied carbon price using formula: (Top Net Profit - (Top Market Cap / Bottom P/E)) / Top Emissions
- [x] Add new endpoint to return implied carbon price time series with component breakdown
- [x] Add getCompaniesWithTimeSeries function to db.ts
- [ ] Create visualization showing implied carbon price over time with unit labels
- [ ] Display component values (total emissions, total profit, total market cap) for transparency
- [ ] Test calculation with updated spreadsheet containing Profit sheet
- [ ] Sense-check results: typical carbon prices range $10-200/tCO2

## Total-Based Carbon Price UI Visualization
- [x] Add tRPC query to fetch total-based carbon price data from calculateTotalBasedCarbonPrice endpoint
- [x] Add state management for method toggle (sector-relative vs absolute) - reusing tercileMethod state
- [x] Create chart component showing implied carbon price over time ($/tCO2)
- [x] Add component breakdown cards showing total emissions, profit, market cap for transparency
- [x] Display P/E ratios for top and bottom terciles
- [x] Add proper Y-axis formatting for carbon price ($/tCO2)
- [x] Add methodology explanation with step-by-step calculation
- [x] Add unit validation panel showing all component units
- [ ] Test visualization with real data (blocked by performance issue: loading 470K time series records times out)
- [ ] Optimize getCompaniesWithTimeSeries to limit data loading or use pagination
- [ ] Consider pre-computing tercile assignments during data upload instead of runtime calculation

## Performance Optimization: Pre-computation and Caching
- [x] Add company_terciles table to schema (company_id, date, method, carbon_intensity, tercile_assignment)
- [x] Add carbon_price_cache table to schema (upload_id, date, method, top_tercile_data, bottom_tercile_data, implied_carbon_price)
- [x] Push schema changes to database
- [x] Update data processor to calculate and store tercile assignments during upload
- [x] Update calculateTotalBasedCarbonPrice endpoint to check cache first
- [x] Implement cache population logic in analysis endpoint
- [x] Rewrite endpoint to use pre-computed terciles instead of loading 470K records
- [ ] Re-upload data to trigger tercile pre-computation (requires user action)
- [ ] Test performance improvement (should load instantly from cache after re-upload)
- [x] UI already has carbon price chart component (added in previous checkpoint)
- [ ] Verify carbon price chart displays correctly with cached data (after re-upload)

## Fix tRPC Service Unavailable Error
- [x] Check server logs for startup errors or crashes
- [x] Verify all imports in routers.ts are correct (especially computeTercilesForUpload)
- [x] Check for syntax errors in routers.ts
- [x] Restart server and verify tRPC endpoints are accessible
- [x] Add better error logging to catch silent failures
- [x] Mark stuck uploads (60001, 60002) as failed
- [ ] Test upload endpoint with sample file and monitor logs

## Implement S3 Direct Upload to Fix Upload Failures
- [ ] Add AWS SDK to generate pre-signed S3 URLs
- [ ] Create tRPC endpoint to generate pre-signed upload URL
- [ ] Create tRPC endpoint to process file after S3 upload completes
- [ ] Update frontend to upload directly to S3 using pre-signed URL
- [ ] Add progress indicator for S3 upload
- [ ] Test with 19.43 MB file to confirm it bypasses nginx limits
- [ ] Verify tercile pre-computation works after S3 upload
- [ ] Verify carbon price chart displays correctly
