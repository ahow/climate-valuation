import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { FileSpreadsheet, Loader2, CheckCircle2, XCircle, Clock, Upload as UploadIcon } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const { data: uploads, isLoading } = trpc.data.getUploads.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to view your dashboard</CardDescription>
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/">
            <h1 className="text-xl font-bold text-slate-900">Climate Scenario Analyzer</h1>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/upload">
              <Button>
                <UploadIcon className="mr-2 h-4 w-4" />
                Upload Data
              </Button>
            </Link>
            <span className="text-sm text-slate-600">{user?.name}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Your Analyses</h2>
            <p className="text-slate-600">
              View and manage your uploaded datasets and analysis results
            </p>
          </div>

          {/* Uploads List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : uploads && uploads.length > 0 ? (
            <div className="grid gap-6">
              {uploads.map((upload) => (
                <Card key={upload.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <FileSpreadsheet className="h-10 w-10 text-blue-600 mt-1" />
                        <div>
                          <CardTitle className="text-xl">{upload.filename}</CardTitle>
                          <CardDescription className="mt-1">
                            Uploaded {formatDistanceToNow(new Date(upload.createdAt), { addSuffix: true })}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {upload.status === 'completed' && (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="text-sm font-medium">Completed</span>
                          </div>
                        )}
                        {upload.status === 'processing' && (
                          <div className="flex items-center gap-2 text-blue-600">
                            <Clock className="h-5 w-5" />
                            <span className="text-sm font-medium">Processing</span>
                          </div>
                        )}
                        {upload.status === 'failed' && (
                          <div className="flex items-center gap-2 text-red-600">
                            <XCircle className="h-5 w-5" />
                            <span className="text-sm font-medium">Failed</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="grid grid-cols-2 gap-6 text-sm">
                        {upload.companiesCount && (
                          <div>
                            <p className="text-slate-600">Companies</p>
                            <p className="text-lg font-semibold text-slate-900">{upload.companiesCount}</p>
                          </div>
                        )}
                        {upload.timePeriodsCount && (
                          <div>
                            <p className="text-slate-600">Time Periods</p>
                            <p className="text-lg font-semibold text-slate-900">{upload.timePeriodsCount}</p>
                          </div>
                        )}
                      </div>
                      {upload.status === 'completed' && (
                        <Link href={`/analysis/${upload.id}`}>
                          <Button>View Analysis</Button>
                        </Link>
                      )}
                      {upload.status === 'failed' && upload.errorMessage && (
                        <div className="text-sm text-red-600 max-w-md">
                          Error: {upload.errorMessage}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-4">
                  <FileSpreadsheet className="h-16 w-16 text-slate-300 mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No data uploaded yet</h3>
                    <p className="text-slate-600 mb-6">
                      Upload your first dataset to start analyzing climate scenarios
                    </p>
                    <Link href="/upload">
                      <Button size="lg">
                        <UploadIcon className="mr-2 h-5 w-5" />
                        Upload Data
                      </Button>
                    </Link>
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
