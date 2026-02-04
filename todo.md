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
