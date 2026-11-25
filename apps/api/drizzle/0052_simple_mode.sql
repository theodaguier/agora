ALTER TABLE "invitation" ADD COLUMN "ui_mode" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ui_mode" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "default_model" text;