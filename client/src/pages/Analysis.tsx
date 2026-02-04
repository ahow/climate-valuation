import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Loader2, Download, TrendingUp, BarChart3 } from "lucide-react";
import { Link, useParams } from "wouter";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function Analysis() {
  const { uploadId } = useParams<{ uploadId: string }>();
  const { user, isAuthenticated } = useAuth();
  
  const [thresholds, setThresholds] = useState({
    lowCarbonPercentile: 25,
    decarbonizingTarget: -0.5,
    solutionsScore: 2.0,
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
      thresholds,
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
          'Low Carbon': r.investmentType === 'low_carbon' ? (r.impliedDecarbRate || 0) * 100 : null,
          'Decarbonizing': r.investmentType === 'decarbonizing' ? (r.impliedDecarbRate || 0) * 100 : null,
          'Solutions': r.investmentType === 'solutions' ? (r.impliedDecarbRate || 0) * 100 : null,
        }))
    : [];

  // Merge data by date
  const mergedChartData: Record<string, any> = {};
  chartData.forEach(d => {
    if (!mergedChartData[d.date]) {
      mergedChartData[d.date] = { date: d.date };
    }
    if (d['Low Carbon'] !== null) mergedChartData[d.date]['Low Carbon'] = d['Low Carbon'];
    if (d['Decarbonizing'] !== null) mergedChartData[d.date]['Decarbonizing'] = d['Decarbonizing'];
    if (d['Solutions'] !== null) mergedChartData[d.date]['Solutions'] = d['Solutions'];
  });

  const finalChartData = Object.values(mergedChartData);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to view analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full">Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!uploadStatus || uploadStatus.status !== 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Data Not Ready</CardTitle>
            <CardDescription>
              {uploadStatus?.status === 'processing' 
                ? 'Your data is still being processed. Please check back in a few moments.'
                : 'This dataset is not available or failed to process.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard">
              <Button className="w-full">Back to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/">
            <h1 className="text-xl font-bold text-slate-900">Climate Scenario Analyzer</h1>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost">Dashboard</Button>
            </Link>
            <span className="text-sm text-slate-600">{user?.name}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">{uploadStatus.filename}</h2>
              <p className="text-slate-600 mt-1">
                {uploadStatus.companiesCount} companies · {uploadStatus.timePeriodsCount} time periods
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleExport} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export Results
              </Button>
              <Button onClick={handleRunAnalysis} disabled={analyzeMutation.isPending}>
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
              <CardTitle>Analysis Configuration</CardTitle>
              <CardDescription>Adjust thresholds for portfolio classification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Low Carbon Percentile: {thresholds.lowCarbonPercentile}%</Label>
                  <Slider
                    value={[thresholds.lowCarbonPercentile]}
                    onValueChange={([value]) => setThresholds(prev => ({ ...prev, lowCarbonPercentile: value }))}
                    min={10}
                    max={50}
                    step={5}
                  />
                  <p className="text-xs text-slate-600">Bottom percentile for carbon intensity</p>
                </div>

                <div className="space-y-2">
                  <Label>Decarbonizing Target: {(thresholds.decarbonizingTarget * 100).toFixed(0)}%</Label>
                  <Slider
                    value={[Math.abs(thresholds.decarbonizingTarget) * 100]}
                    onValueChange={([value]) => setThresholds(prev => ({ ...prev, decarbonizingTarget: -value / 100 }))}
                    min={30}
                    max={100}
                    step={10}
                  />
                  <p className="text-xs text-slate-600">Minimum emission reduction by 2050</p>
                </div>

                <div className="space-y-2">
                  <Label>Solutions Score: {thresholds.solutionsScore.toFixed(1)}</Label>
                  <Slider
                    value={[thresholds.solutionsScore]}
                    onValueChange={([value]) => setThresholds(prev => ({ ...prev, solutionsScore: value }))}
                    min={0}
                    max={7}
                    step={0.5}
                  />
                  <p className="text-xs text-slate-600">Minimum SDG alignment score</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
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
                      <SelectItem value="low_carbon">Low Carbon</SelectItem>
                      <SelectItem value="decarbonizing">Decarbonizing</SelectItem>
                      <SelectItem value="solutions">Solutions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Geography</Label>
                  <Select value={filters.geography} onValueChange={(value) => setFilters(prev => ({ ...prev, geography: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Geographies</SelectItem>
                      {dimensions?.geographies.map(geo => (
                        <SelectItem key={geo || ''} value={geo || ''}>{geo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Sector</Label>
                  <Select value={filters.sector} onValueChange={(value) => setFilters(prev => ({ ...prev, sector: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sectors</SelectItem>
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
                <CardDescription>Annual emission reduction rates inferred from market valuations (%)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={finalChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis label={{ value: 'Decarb Rate (%)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
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
                      Click "Run Analysis" to calculate implied decarbonization rates
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
