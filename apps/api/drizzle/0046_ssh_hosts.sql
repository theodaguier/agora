CREATE TABLE "ssh_host" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 22 NOT NULL,
	"username" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"host_keys" text,
	"host_key_fingerprint" text,
	"excluded_agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ssh_host_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ssh_log" (
	"id" text PRIMARY KEY NOT NULL,
	"host_id" text NOT NULL,
	"agent_id" text,
	"user_id" text,
	"conversation_id" text,
	"command" text,
	"exit_code" integer,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ssh_host" ADD CONSTRAINT "ssh_host_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_log" ADD CONSTRAINT "ssh_log_host_id_ssh_host_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."ssh_host"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_log" ADD CONSTRAINT "ssh_log_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_log" ADD CONSTRAINT "ssh_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_log" ADD CONSTRAINT "ssh_log_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ssh_log_host_idx" ON "ssh_log" USING btree ("host_id","at");