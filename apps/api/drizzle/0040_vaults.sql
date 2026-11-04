CREATE TABLE "vault" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"owner_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vault_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
CREATE TABLE "vault_agent" (
	"vault_id" text NOT NULL,
	"agent_id" text NOT NULL,
	CONSTRAINT "vault_agent_vault_id_agent_id_pk" PRIMARY KEY("vault_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "vault_item" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"website" text,
	"fields" jsonb NOT NULL,
	"secret" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_member" (
	"vault_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "vault_member_vault_id_user_id_pk" PRIMARY KEY("vault_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "vault_request" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_item_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"requested_by" text,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault" ADD CONSTRAINT "vault_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault" ADD CONSTRAINT "vault_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_agent" ADD CONSTRAINT "vault_agent_vault_id_vault_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vault"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_agent" ADD CONSTRAINT "vault_agent_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_vault_id_vault_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vault"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_member" ADD CONSTRAINT "vault_member_vault_id_vault_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vault"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_member" ADD CONSTRAINT "vault_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_request" ADD CONSTRAINT "vault_request_vault_item_id_vault_item_id_fk" FOREIGN KEY ("vault_item_id") REFERENCES "public"."vault_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_request" ADD CONSTRAINT "vault_request_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_request" ADD CONSTRAINT "vault_request_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_request" ADD CONSTRAINT "vault_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vault_agent_agent_idx" ON "vault_agent" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "vault_item_vault_idx" ON "vault_item" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "vault_member_user_idx" ON "vault_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vault_request_item_idx" ON "vault_request" USING btree ("vault_item_id");