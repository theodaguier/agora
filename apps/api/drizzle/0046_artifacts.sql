CREATE TABLE "artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"share_mode" text DEFAULT 'private' NOT NULL,
	"share_token" text NOT NULL,
	"last_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "artifact_conversation_slug" UNIQUE("conversation_id","slug")
);
--> statement-breakpoint
CREATE TABLE "artifact_version" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"version" integer NOT NULL,
	"attachment_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_version_number" UNIQUE("artifact_id","version")
);
--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_attachment_id_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachment"("id") ON DELETE cascade ON UPDATE no action;