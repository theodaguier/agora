ALTER TABLE "vault_request" ALTER COLUMN "vault_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_request" ADD COLUMN "kind" text DEFAULT 'use' NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_request" ADD COLUMN "website" text;