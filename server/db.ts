import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, companies, timeSeries, dataUploads, analysisResults, InsertCompany, InsertTimeSeries, InsertDataUpload, InsertAnalysisResult } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================================
// User Management
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// Company Management
// ============================================================================

export async function upsertCompany(company: InsertCompany) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(companies).values(company).onDuplicateKeyUpdate({
    set: {
      name: company.name,
      geography: company.geography,
      sector: company.sector,
      industry: company.industry,
      sdgAlignmentScore: company.sdgAlignmentScore,
      emissionTarget2050: company.emissionTarget2050,
    },
  });
}

export async function getCompanyByIsin(isin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(companies).where(eq(companies.isin, isin)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllCompanies() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(companies);
}

export async function getCompaniesByGeography(geography: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(companies).where(eq(companies.geography, geography));
}

export async function getCompaniesBySector(sector: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(companies).where(eq(companies.sector, sector));
}

// ============================================================================
// Time Series Management
// ============================================================================

export async function insertTimeSeries(data: InsertTimeSeries) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(timeSeries).values(data).onDuplicateKeyUpdate({
    set: {
      totalReturnIndex: data.totalReturnIndex,
      marketCap: data.marketCap,
      priceEarnings: data.priceEarnings,
      scope1Emissions: data.scope1Emissions,
      scope2Emissions: data.scope2Emissions,
      scope3Emissions: data.scope3Emissions,
    },
  });
}

export async function getTimeSeriesByCompany(companyId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query = db.select().from(timeSeries).where(eq(timeSeries.companyId, companyId));

  if (startDate && endDate) {
    query = db.select().from(timeSeries).where(
      and(
        eq(timeSeries.companyId, companyId),
        gte(timeSeries.date, startDate),
        lte(timeSeries.date, endDate)
      )
    );
  }

  return await query;
}

export async function getTimeSeriesByDate(date: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(timeSeries).where(eq(timeSeries.date, date));
}

export async function getTimeSeriesDateRange() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select({
    minDate: sql<Date>`MIN(${timeSeries.date})`,
    maxDate: sql<Date>`MAX(${timeSeries.date})`,
  }).from(timeSeries);

  return result[0];
}

// ============================================================================
// Data Upload Management
// ============================================================================

export async function createDataUpload(upload: InsertDataUpload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(dataUploads).values(upload);
  return result[0].insertId;
}

export async function updateDataUploadStatus(
  uploadId: number,
  status: "processing" | "completed" | "failed",
  updates: Partial<InsertDataUpload> = {}
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(dataUploads)
    .set({
      status,
      ...updates,
      completedAt: status === "completed" || status === "failed" ? new Date() : undefined,
    })
    .where(eq(dataUploads.id, uploadId));
}

export async function getDataUploadsByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(dataUploads).where(eq(dataUploads.userId, userId));
}

export async function getDataUploadById(uploadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(dataUploads).where(eq(dataUploads.id, uploadId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// Analysis Results Management
// ============================================================================

export async function insertAnalysisResult(result: InsertAnalysisResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(analysisResults).values(result);
}

export async function getAnalysisResults(
  uploadId: number,
  investmentType?: "low_carbon" | "decarbonizing" | "solutions",
  startDate?: Date,
  endDate?: Date,
  geography?: string,
  sector?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(analysisResults.uploadId, uploadId)];

  if (investmentType) {
    conditions.push(eq(analysisResults.investmentType, investmentType));
  }
  if (startDate) {
    conditions.push(gte(analysisResults.date, startDate));
  }
  if (endDate) {
    conditions.push(lte(analysisResults.date, endDate));
  }
  if (geography) {
    conditions.push(eq(analysisResults.geography, geography));
  }
  if (sector) {
    conditions.push(eq(analysisResults.sector, sector));
  }

  return await db.select().from(analysisResults).where(and(...conditions));
}

export async function deleteAnalysisResultsByUpload(uploadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(analysisResults).where(eq(analysisResults.uploadId, uploadId));
}
