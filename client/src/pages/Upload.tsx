import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Upload as UploadIcon, FileSpreadsheet, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

export default function Upload() {
  // Auth removed - public access
  const user = null;
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getUploadUrlMutation = trpc.data.getUploadUrl.useMutation();
  const processUploadMutation = trpc.data.processUpload.useMutation({
    onSuccess: (data) => {
      toast.success("File uploaded successfully! Processing data...");
      setLocation(`/analysis/${data.uploadId}`);
    },
    onError: (error) => {
      toast.error(`Processing failed: ${error.message}`);
      setUploading(false);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        toast.error("Please select an Excel file (.xlsx or .xls)");
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);

    try {
      // Step 1: Get pre-signed S3 upload URL
      toast.info("Preparing upload...");
      const { uploadUrl, apiKey, fileKey } = await getUploadUrlMutation.mutateAsync({
        filename: file.name,
      });

      // Step 2: Upload file directly to S3
      toast.info("Uploading file to cloud storage...");
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`S3 upload failed: ${errorText}`);
      }

      const uploadResult = await uploadResponse.json();
      const fileUrl = uploadResult.url;

      // Step 3: Notify backend to process the uploaded file
      toast.info("Processing data...");
      await processUploadMutation.mutateAsync({
        filename: file.name,
        fileKey,
        fileUrl,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setUploading(false);
    }
  };

  // Public access - no auth check

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
            {/* Public access - no user display */}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Upload Climate Data</h2>
            <p className="text-slate-600">
              Upload an Excel file containing company data, time series, emissions, and climate metrics
            </p>
          </div>

          {/* Upload Card */}
          <Card>
            <CardHeader>
              <CardTitle>Select Data File</CardTitle>
              <CardDescription>
                Your Excel file should contain the following sheets: Descriptive, RI, MV, S1, S2, S3, PE, GreenRev, EmissionTargets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* File Input */}
              <div
                className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <FileSpreadsheet className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                {file ? (
                  <div className="space-y-2">
                    <p className="text-lg font-medium text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-600">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-medium text-slate-900 mb-2">
                      Click to select Excel file
                    </p>
                    <p className="text-sm text-slate-600">
                      or drag and drop your file here
                    </p>
                  </div>
                )}
              </div>

              {/* Upload Button */}
              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full"
                size="lg"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Uploading and Processing...
                  </>
                ) : (
                  <>
                    <UploadIcon className="mr-2 h-5 w-5" />
                    Upload and Analyze
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Data Requirements */}
          <Card>
            <CardHeader>
              <CardTitle>Data Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Company Descriptive Data</p>
                    <p className="text-sm text-slate-600">ISIN, name, geography, sector classifications</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Time Series Data</p>
                    <p className="text-sm text-slate-600">Total return index, market cap, P/E ratios</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Emissions Data</p>
                    <p className="text-sm text-slate-600">Scope 1, 2, and 3 emissions by fiscal year</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Climate Metrics</p>
                    <p className="text-sm text-slate-600">SDG alignment scores and 2050 emission targets</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
