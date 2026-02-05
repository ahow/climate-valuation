CREATE TABLE `carbon_price_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`upload_id` int NOT NULL,
	`date` timestamp NOT NULL,
	`method` enum('absolute','sector_relative') NOT NULL,
	`include_scope3` int NOT NULL,
	`winsorize` int NOT NULL,
	`winsorize_percentile` int,
	`top_tercile_emissions` float,
	`top_tercile_profit` float,
	`top_tercile_market_cap` float,
	`top_tercile_pe_ratio` float,
	`top_tercile_company_count` int,
	`bottom_tercile_emissions` float,
	`bottom_tercile_profit` float,
	`bottom_tercile_market_cap` float,
	`bottom_tercile_pe_ratio` float,
	`bottom_tercile_company_count` int,
	`implied_carbon_price` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `carbon_price_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `upload_date_method_params_idx` UNIQUE(`upload_id`,`date`,`method`,`include_scope3`,`winsorize`,`winsorize_percentile`)
);
--> statement-breakpoint
CREATE TABLE `company_terciles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`upload_id` int NOT NULL,
	`company_id` int NOT NULL,
	`date` timestamp NOT NULL,
	`method` enum('absolute','sector_relative') NOT NULL,
	`include_scope3` int NOT NULL,
	`carbon_intensity` float,
	`tercile_assignment` enum('bottom','middle','top'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_terciles_id` PRIMARY KEY(`id`),
	CONSTRAINT `upload_company_date_method_idx` UNIQUE(`upload_id`,`company_id`,`date`,`method`,`include_scope3`)
);
--> statement-breakpoint
CREATE INDEX `upload_date_idx` ON `company_terciles` (`upload_id`,`date`);--> statement-breakpoint
CREATE INDEX `tercile_idx` ON `company_terciles` (`tercile_assignment`);