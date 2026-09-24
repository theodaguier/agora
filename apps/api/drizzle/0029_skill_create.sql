ALTER TABLE "skill_request" ADD COLUMN "kind" text DEFAULT 'install' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_request" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_request" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "skill_request" ADD COLUMN "content" text;