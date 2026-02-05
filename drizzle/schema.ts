import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, index, unique } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Companies master data
 */
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  isin: varchar("isin", { length: 12 }).notNull().unique(),
  name: text("name").notNull(),
  geography: varchar("geography", { length: 100 }),
  sector: varchar("sector", { length: 100 }),
  industry: varchar("industry", { length: 100 }),
  sdgAlignmentScore: float("sdg_alignment_score"),
  emissionTarget2050: float("emission_target_2050"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  isinIdx: index("isin_idx").on(table.isin),
  geographyIdx: index("geography_idx").on(table.geography),
  sectorIdx: index("sector_idx").on(table.sector),
}));

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

/**
 * Time series data for companies
 */
export const timeSeries = mysqlTable("time_series", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  date: timestamp("date").notNull(),
  totalReturnIndex: float("total_return_index"),
  marketCap: float("market_cap"),
  priceEarnings: float("price_earnings"),
  scope1Emissions: float("scope1_emissions"),
  scope2Emissions: float("scope2_emissions"),
  scope3Emissions: float("scope3_emissions"),
  netProfit: float("net_profit"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  companyDateIdx: unique("company_date_idx").on(table.companyId, table.date),
  dateIdx: index("date_idx").on(table.date),
}));

export type TimeSeries = typeof timeSeries.$inferSelect;
export type InsertTimeSeries = typeof timeSeries.$inferInsert;

/**
 * Data uploads tracking
 */
export const dataUploads = mysqlTable("data_uploads", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  fileKey: varchar("file_key", { length: 500 }).notNull(),
  fileUrl: text("file_url").notNull(),
  status: mysqlEnum("status", ["processing", "completed", "failed"]).default("processing").notNull(),
  companiesCount: int("companies_count"),
  timePeriodsCount: int("time_periods_count"),
  errorMessage: text("error_message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => ({
  userIdIdx: index("user_id_idx").on(table.userId),
  statusIdx: index("status_idx").on(table.status),
}));

export type DataUpload = typeof dataUploads.$inferSelect;
export type InsertDataUpload = typeof dataUploads.$inferInsert;

/**
 * Analysis results cache
 */
export const analysisResults = mysqlTable("analysis_results", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: int("upload_id").notNull(),
  investmentType: mysqlEnum("investment_type", ["low_carbon", "decarbonizing", "solutions"]).notNull(),
  date: timestamp("date").notNull(),
  geography: varchar("geography", { length: 100 }),
  sector: varchar("sector", { length: 100 }),
  avgCarbonIntensity: float("avg_carbon_intensity"),
  avgPeRatio: float("avg_pe_ratio"),
  valuationPremium: float("valuation_premium"),
  impliedCarbonPrice: float("implied_carbon_price"),
  impliedDecarbRate: float("implied_decarb_rate"),
  portfolioSize: int("portfolio_size"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uploadDateIdx: index("upload_date_idx").on(table.uploadId, table.date),
  investmentTypeIdx: index("investment_type_idx").on(table.investmentType),
}));

export type AnalysisResult = typeof analysisResults.$inferSelect;
export type InsertAnalysisResult = typeof analysisResults.$inferInsert;
