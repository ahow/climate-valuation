import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { BarChart3, TrendingUp, Globe, Building2 } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  // Auth removed - public access

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Climate Scenario Analyzer</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button>Go to Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h2 className="text-5xl font-bold text-slate-900 leading-tight">
              Reverse Engineer Climate Scenarios from Market Valuations
            </h2>
            <p className="text-xl text-slate-600 leading-relaxed">
              Analyze equity market valuations to infer implied decarbonization rates across three climate investment strategies: low carbon intensity, decarbonizing companies, and climate solutions providers.
            </p>
            <div className="flex gap-4 justify-center pt-4">
              <Link href="/upload">
                <Button size="lg" className="text-lg px-8">
                  Upload Data
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-16">
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card>
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-blue-600 mb-2" />
                <CardTitle>Portfolio Classification</CardTitle>
                <CardDescription>
                  Classify companies into three climate investment types based on carbon intensity, emission targets, and climate solution alignment
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <TrendingUp className="h-10 w-10 text-green-600 mb-2" />
                <CardTitle>Valuation Analysis</CardTitle>
                <CardDescription>
                  Calculate valuation premiums between climate-aligned and baseline portfolios to infer implied carbon pricing
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Globe className="h-10 w-10 text-purple-600 mb-2" />
                <CardTitle>Multi-Dimensional Views</CardTitle>
                <CardDescription>
                  Analyze implied decarbonization rates by sector, region, and investment type with interactive filtering
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        {/* How It Works */}
        <section className="container mx-auto px-4 py-16 bg-white">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-3xl font-bold text-center mb-12 text-slate-900">How It Works</h3>
            <div className="space-y-8">
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                  1
                </div>
                <div>
                  <h4 className="text-xl font-semibold mb-2">Upload Your Data</h4>
                  <p className="text-slate-600">
                    Upload an Excel file containing company descriptive data, time series (returns, market cap, P/E ratios), emissions data (Scope 1, 2, 3), green revenue alignment scores, and emission reduction targets.
                  </p>
                </div>
              </div>

              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-lg">
                  2
                </div>
                <div>
                  <h4 className="text-xl font-semibold mb-2">Automated Processing</h4>
                  <p className="text-slate-600">
                    The platform automatically calculates carbon intensities, classifies companies into climate portfolios, and computes valuation premiums between climate-aligned and baseline companies.
                  </p>
                </div>
              </div>

              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-lg">
                  3
                </div>
                <div>
                  <h4 className="text-xl font-semibold mb-2">Analyze Results</h4>
                  <p className="text-slate-600">
                    View interactive charts showing implied decarbonization rates over time, broken down by sector and region. Export results for further analysis or reporting.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16">
          <div className="max-w-3xl mx-auto text-center bg-blue-600 rounded-2xl p-12 text-white">
            <h3 className="text-3xl font-bold mb-4">Ready to Analyze Climate Scenarios?</h3>
            <p className="text-lg mb-8 text-blue-100">
              Start reverse engineering climate transition pathways from market valuations today
            </p>
            <Link href="/upload">
              <Button size="lg" variant="secondary" className="text-lg px-8">
                Upload Your Data
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-8">
        <div className="container mx-auto px-4 text-center text-sm text-slate-600">
          <p>Climate Scenario Analyzer - Reverse engineering climate transitions from market valuations</p>
        </div>
      </footer>
    </div>
  );
}
