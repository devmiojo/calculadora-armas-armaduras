CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`workshop_id` text NOT NULL,
	`customer` text NOT NULL,
	`status` text NOT NULL,
	`document` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orders_workshop_created` ON `orders` (`workshop_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workshops` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
  `deleted_at` text,
  `deleted_by` text
);
CREATE TABLE `catalogs` (
  `workshop_id` text PRIMARY KEY NOT NULL REFERENCES `workshops`(`id`),
  `document` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `updated_by` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE TABLE `workshop_access` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `workshop_id` text NOT NULL REFERENCES `workshops`(`id`),
  `created_at` text NOT NULL
);
