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
