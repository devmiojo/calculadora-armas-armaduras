CREATE TABLE `workshop_access` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`workshop_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON UPDATE no action ON DELETE no action
);
