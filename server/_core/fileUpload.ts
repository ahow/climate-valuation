import { Express } from "express";
import multer from "multer";
import * as db from "../db";
import { parseExcelFile, processClimateData } from "../dataProcessor";
import { computeTercilesForUpload } from "../tercileCalculator";
import { storagePut } from "../storage";

// Configure multer for memory storage (file will be in req.file.buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

export function registerFileUploadRoute(app: Express) {
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const userId = 1; // Default user ID for public access
      const filename = req.file.originalname;
      const buffer = req.file.buffer;

      console.log(`[FileUpload] Received file: ${filename}, size: ${buffer.length} bytes`);

      // Upload to S3
      const fileKey = `uploads/${userId}/${Date.now()}-${filename}`;
      const { url: fileUrl } = await storagePut(
        fileKey,
        buffer,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      // Create upload record
      const uploadId = await db.createDataUpload({
        userId,
        filename,
        fileKey,
        fileUrl,
        status: "processing",
      });

      console.log(`[FileUpload] Created upload record ${uploadId}, starting async processing...`);

      // Process file asynchronously
      (async () => {
        try {
          console.log(`[Upload ${uploadId}] Starting async processing...`);
          console.log(`[Upload ${uploadId}] Buffer size: ${buffer.length} bytes`);
          console.log(`[Upload ${uploadId}] Parsing Excel file...`);

          // Parse Excel file
          const rawData = parseExcelFile(buffer);

          console.log(`[Upload ${uploadId}] Processing climate data...`);
          // Process data
          const processedData = processClimateData(rawData);
          console.log(
            `[Upload ${uploadId}] Parsed ${processedData.stats.totalCompanies} companies, ${processedData.timeSeries.length} time series records.`
          );

          // Insert companies
          console.log(`[Upload ${uploadId}] Inserting ${processedData.companies.length} companies...`);
          for (const company of processedData.companies) {
            await db.upsertCompany(company);
          }
          console.log(`[Upload ${uploadId}] Companies inserted.`);

          // Get company IDs
          const companies = await db.getAllCompanies();
          const isinToId = new Map(companies.map((c) => [c.isin, c.id!]));

          // Insert time series with correct company IDs in batches
          console.log(`[Upload ${uploadId}] Preparing ${processedData.timeSeries.length} time series records...`);
          const timeSeriesWithIds = processedData.timeSeries
            .map((ts) => {
              const companyIsin = processedData.companies[ts.companyId - 1]?.isin;
              if (!companyIsin) return null;
              const actualCompanyId = isinToId.get(companyIsin);
              if (!actualCompanyId) return null;
              return { ...ts, companyId: actualCompanyId };
            })
            .filter((ts): ts is NonNullable<typeof ts> => ts !== null);

          console.log(`[Upload ${uploadId}] Inserting ${timeSeriesWithIds.length} time series records in batches...`);
          await db.insertTimeSeriesBatch(timeSeriesWithIds);
          console.log(`[Upload ${uploadId}] Time series insertion completed.`);

          // Compute tercile assignments
          console.log(`[Upload ${uploadId}] Computing tercile assignments...`);
          await computeTercilesForUpload(uploadId);
          console.log(`[Upload ${uploadId}] Tercile computation completed.`);

          // Update upload status
          console.log(`[Upload ${uploadId}] Processing completed successfully.`);
          await db.updateDataUploadStatus(uploadId, "completed", {
            companiesCount: processedData.stats.totalCompanies,
            timePeriodsCount: processedData.stats.totalTimePeriods,
          });
        } catch (error) {
          console.error(`[Upload ${uploadId}] Error processing upload:`, error);
          console.error(`[Upload ${uploadId}] Error stack:`, error instanceof Error ? error.stack : "No stack trace");
          await db.updateDataUploadStatus(uploadId, "failed", {
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          });
        }
      })();

      // Return immediately with upload ID
      res.json({ uploadId, status: "processing" });
    } catch (error) {
      console.error("[FileUpload] Error handling upload:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
