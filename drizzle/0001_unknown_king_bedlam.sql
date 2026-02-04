CREATE TABLE `analysis_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`upload_id` int NOT NULL,
	`investment_type` enum('low_carbon','decarbonizing','solutions') NOT NULL,
	`date` timestamp NOT NULL,
	`geography` varchar(100),
	`sector` varchar(100),
	`avg_carbon_intensity` float,
	`avg_pe_ratio` float,
	`valuation_premium` float,
	`implied_carbon_price` float,
	`implied_decarb_rate` float,
	`portfolio_size` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysis_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`isin` varchar(12) NOT NULL,
	`name` text NOT NULL,
	`geography` varchar(100),
	`sector` varchar(100),
	`industry` varchar(100),
	`sdg_alignment_score` float,
	`emission_target_2050` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_isin_unique` UNIQUE(`isin`)
);
--> statement-breakpoint
CREATE TABLE `data_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`file_key` varchar(500) NOT NULL,
	`file_url` text NOT NULL,
	`status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
	`companies_count` int,
	`time_periods_count` int,
	`error_message` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `data_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `time_series` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`date` timestamp NOT NULL,
	`total_return_index` float,
	`market_cap` float,
	`price_earnings` float,
	`scope1_emissions` float,
	`scope2_emissions` float,
	`scope3_emissions` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `time_series_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_date_idx` UNIQUE(`company_id`,`date`)
);
--> statement-breakpoint
CREATE INDEX `upload_date_idx` ON `analysis_results` (`upload_id`,`date`);--> statement-breakpoint
CREATE INDEX `investment_type_idx` ON `analysis_results` (`investment_type`);--> statement-breakpoint
CREATE INDEX `isin_idx` ON `companies` (`isin`);--> statement-breakpoint
CREATE INDEX `geography_idx` ON `companies` (`geography`);--> statement-breakpoint
CREATE INDEX `sector_idx` ON `companies` (`sector`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `data_uploads` (`user_id`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `data_uploads` (`status`);--> statement-breakpoint
CREATE INDEX `date_idx` ON `time_series` (`date`);