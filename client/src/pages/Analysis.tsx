import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { trpc } from "@/lib/trpc";
import { Loader2, Download, TrendingUp, BarChart3, ArrowLeft } from "lucide-react";
import { Link, useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function Analysis() {
  const { uploadId } = useParams<{ uploadId: string }>();
  // Auth removed - public access
  const user = null;
  const isAuthenticated = true; // Always treat as authenticated for public access
  
  const [parameters, setParameters] = useState({
    includeScope3: false,
    methodology: 'relative' as 'relative' | 'dcf',
    sectorGranularity: 'sector' as 'sector' | 'industry',
    thresholds: {
      tertileApproach: true,
    },
    winsorize: true,
    winsorizePercentile: 5,
  });
  
  const [filters, setFilters] = useState({
    investmentType: 'all' as 'all' | 'low_carbon' | 'decarbonizing' | 'solutions',
    geography: 'all',
    sector: 'all',
  });

  const uploadIdNum = parseInt(uploadId || '0');

  const { data: uploadStatus, isLoading: loadingStatus } = trpc.data.getUploadStatus.useQuery(
    { uploadId: uploadIdNum },
    { enabled: !!uploadId && isAuthenticated }
  );

  const { data: dimensions } = trpc.analysis.getDimensions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const analyzeMutation = trpc.analysis.analyze.useMutation({
    onSuccess: () => {
      toast.success("Analysis completed successfully!");
      resultsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Analysis failed: ${error.message}`);
    },
  });

  const resultsQuery = trpc.analysis.getResults.useQuery(
    {
      uploadId: uploadIdNum,
      investmentType: filters.investmentType !== 'all' ? filters.investmentType : undefined,
      geography: filters.geography !== 'all' ? filters.geography : undefined,
      sector: filters.sector !== 'all' ? filters.sector : undefined,
    },
    { enabled: !!uploadId && isAuthenticated && uploadStatus?.status === 'completed' }
  );

  const exportQuery = trpc.export.exportResults.useQuery(
    {
      uploadId: uploadIdNum,
      investmentType: filters.investmentType !== 'all' ? filters.investmentType : undefined,
    },
    { enabled: false }
  );

  const handleRunAnalysis = () => {
    analyzeMutation.mutate({
      uploadId: uploadIdNum,
      parameters,
    });
  };

  const handleExport = async () => {
    const result = await exportQuery.refetch();
    if (result.data) {
      const blob = new Blob([result.data.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.data.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Results exported successfully!");
    }
  };

  // Transform results for chart
  const chartData = resultsQuery.data
    ? resultsQuery.data
        .filter(r => !r.geography && !r.sector) // Aggregate only
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(r => ({
          date: new Date(r.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
          investmentType: r.investmentType,
          impliedDecarbRate: (r.impliedDecarbRate || 0) * 100,
        }))
    : [];

  // Pivot data for multi-line chart
  const dateMap = new Map<string, any>();
  for (const item of chartData) {
    if (!dateMap.has(item.date)) {
      dateMap.set(item.date, { date: item.date });
    }
    const entry = dateMap.get(item.date)!;
    if (item.investmentType === 'low_carbon') entry['Low Carbon'] = item.impliedDecarbRate;
    if (item.investmentType === 'decarbonizing') entry['Decarbonizing'] = item.impliedDecarbRate;
    if (item.investmentType === 'solutions') entry['Solutions'] = item.impliedDecarbRate;
  }
  const finalChartData = Array.from(dateMap.values());

  // Public access - no auth check

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="container mx-auto py-4 px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Climate Scenario Analysis</h1>
              <p className="text-sm text-slate-600">
                {uploadStatus?.filename || 'Loading...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleExport} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        <div className="space-y-6">
          {uploadStatus?.status !== 'completed' && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="py-4">
                <p className="text-amber-800">
                  Data processing status: <strong>{uploadStatus?.status}</strong>
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Analysis Configuration</h2>
              <p className="text-sm text-slate-600">Configure parameters and run analysis</p>
            </div>
            <div>
              <Button onClick={handleRunAnalysis} disabled={analyzeMutation.isPending || uploadStatus?.status !== 'completed'}>
                {analyzeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Run Analysis
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Configuration Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Methodology & Parameters</CardTitle>
              <CardDescription>Configure analysis approach and classification parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Valuation Methodology */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Valuation Methodology</Label>
                  <RadioGroup 
                    value={parameters.methodology} 
                    onValueChange={(value: 'relative' | 'dcf') => setParameters(prev => ({ ...prev, methodology: value }))}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="relative" id="relative" />
                      <Label htmlFor="relative" className="font-normal cursor-pointer">
                        Relative Valuation (P/E comparison)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="dcf" id="dcf" />
                      <Label htmlFor="dcf" className="font-normal cursor-pointer">
                        DCF-based (Discounted cash flow)
                      </Label>
                    </div>
                  </RadioGroup>
                  <p className="text-xs text-slate-600">
                    {parameters.methodology === 'relative' 
                      ? 'Compares P/E ratios between climate and baseline portfolios' 
                      : 'Uses discounted cash flow to model carbon cost impact on valuations'}
                  </p>
                </div>

                {/* Emissions Scope */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Emissions Scope</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="scope3"
                      checked={parameters.includeScope3}
                      onCheckedChange={(checked) => setParameters(prev => ({ ...prev, includeScope3: checked }))}
                    />
                    <Label htmlFor="scope3" className="font-normal cursor-pointer">
                      Include Scope 3 emissions
                    </Label>
                  </div>
                  <p className="text-xs text-slate-600">
                    {parameters.includeScope3 
                      ? 'Using Scope 1 + 2 + 3 (full value chain emissions)' 
                      : 'Using Scope 1 + 2 only (direct and energy emissions)'}
                  </p>
                </div>

                {/* Sector Granularity */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Sector Classification</Label>
                  <Select 
                    value={parameters.sectorGranularity} 
                    onValueChange={(value: 'sector' | 'industry') => setParameters(prev => ({ ...prev, sectorGranularity: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sector">Sector (broad classification)</SelectItem>
                      <SelectItem value="industry">Industry (detailed classification)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-600">
                    Choose classification granularity for sector-relative analysis
                  </p>
                </div>

                {/* Outlier Treatment */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Outlier Treatment</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="winsorize"
                      checked={parameters.winsorize}
                      onCheckedChange={(checked) => setParameters(prev => ({ ...prev, winsorize: checked }))}
                    />
                    <Label htmlFor="winsorize" className="font-normal cursor-pointer">
                      Apply winsorization
                    </Label>
                  </div>
                  {parameters.winsorize && (
                    <Select 
                      value={parameters.winsorizePercentile.toString()} 
                      onValueChange={(value) => setParameters(prev => ({ ...prev, winsorizePercentile: parseInt(value) }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1st-99th percentile (aggressive)</SelectItem>
                        <SelectItem value="5">5th-95th percentile (moderate)</SelectItem>
                        <SelectItem value="10">10th-90th percentile (conservative)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-slate-600">
                    {parameters.winsorize
                      ? `Caps extreme P/E and carbon intensity values at ${parameters.winsorizePercentile}th-${100-parameters.winsorizePercentile}th percentiles`
                      : 'No outlier treatment - uses raw data (may be affected by extreme values)'}
                  </p>
                </div>

                {/* Portfolio Classification Approach */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Portfolio Classification</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="tertile"
                      checked={parameters.thresholds.tertileApproach}
                      onCheckedChange={(checked) => setParameters(prev => ({ 
                        ...prev, 
                        thresholds: { ...prev.thresholds, tertileApproach: checked } 
                      }))}
                      disabled
                    />
                    <Label htmlFor="tertile" className="font-normal cursor-pointer">
                      Sector-relative tertiles (bottom vs top third)
                    </Label>
                  </div>
                  <p className="text-xs text-slate-600">
                    Companies classified within their sector: bottom third (climate-aligned) vs top third (baseline)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>View Filters</CardTitle>
              <CardDescription>Filter results by investment type, region, and sector</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Investment Type</Label>
                  <Select value={filters.investmentType} onValueChange={(value: any) => setFilters(prev => ({ ...prev, investmentType: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="low_carbon">Low Carbon Intensity</SelectItem>
                      <SelectItem value="decarbonizing">Decarbonizing Companies</SelectItem>
                      <SelectItem value="solutions">Solutions Providers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Region</Label>
                  <Select value={filters.geography} onValueChange={(value) => setFilters(prev => ({ ...prev, geography: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Regions</SelectItem>
                      {dimensions?.geographies.map(geo => (
                        <SelectItem key={geo || ''} value={geo || ''}>{geo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{parameters.sectorGranularity === 'industry' ? 'Industry' : 'Sector'}</Label>
                  <Select value={filters.sector} onValueChange={(value) => setFilters(prev => ({ ...prev, sector: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {parameters.sectorGranularity === 'industry' ? 'Industries' : 'Sectors'}</SelectItem>
                      {dimensions?.sectors.map(sector => (
                        <SelectItem key={sector || ''} value={sector || ''}>{sector}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {resultsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : resultsQuery.data && resultsQuery.data.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Implied Decarbonization Rates</CardTitle>
                <CardDescription>
                  Annual emission reduction rates inferred from market valuations (%)
                  {parameters.methodology === 'dcf' && ' - DCF methodology'}
                </CardDescription>
                <div className="mt-4 p-4 bg-slate-50 rounded-lg text-sm text-slate-700 space-y-2">
                  <p className="font-semibold">Calculation Methodology:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li><strong>Outlier Treatment:</strong> {parameters.winsorize ? `P/E and carbon intensity winsorized at ${parameters.winsorizePercentile}th-${100-parameters.winsorizePercentile}th percentiles` : 'No winsorization applied'}</li>
                    <li><strong>Carbon Risk Discount:</strong> (P/E_climate / P/E_baseline) - 1</li>
                    <li><strong>Implied Carbon Price:</strong> (Discount × Baseline P/E) / Carbon Intensity Difference</li>
                    <li><strong>Decarbonization Rate:</strong> Maps carbon price to annual reduction:
                      <ul className="list-disc list-inside ml-6 mt-1 text-xs">
                        <li>$0-50/tCO2 → 0-2% annual reduction</li>
                        <li>$50-100/tCO2 → 2-4% annual reduction</li>
                        <li>$100-200/tCO2 → 4-7% annual reduction</li>
                        <li>Above $200/tCO2 → capped at 7%</li>
                      </ul>
                    </li>
                  </ol>
                  <p className="text-xs text-slate-600 mt-2">
                    <strong>Note:</strong> Negative values indicate increasing emissions (carbon-intensive companies valued higher).
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={finalChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis 
                      label={{ value: 'Decarb Rate (%)', angle: -90, position: 'insideLeft' }}
                      tickFormatter={(value) => value.toFixed(2)}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(4)}%`, '']}
                      labelStyle={{ color: '#1e293b' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="Low Carbon" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="Decarbonizing" stroke="#10b981" strokeWidth={2} />
                    <Line type="monotone" dataKey="Solutions" stroke="#8b5cf6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-4">
                  <TrendingUp className="h-16 w-16 text-slate-300 mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Analysis Results Yet</h3>
                    <p className="text-slate-600 mb-6">
                      Configure parameters and click "Run Analysis" to calculate implied decarbonization rates
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
