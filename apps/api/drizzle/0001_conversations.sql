-- Fils (salarié, agent) → conversations directes, en gardant les ids (et donc les sessions Hermes).
CREATE TABLE "conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"direct_key" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_direct_key_unique" UNIQUE("direct_key")
);
--> statement-breakpoint
CREATE TABLE "conversation_agent" (
	"conversation_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"added_by" text,
	"model" text,
	"seen_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_agent_conversation_id_agent_id_pk" PRIMARY KEY("conversation_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_member" (
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp DEFAULT now() NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_member_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
INSERT INTO "conversation" ("id", "kind", "direct_key", "created_by", "created_at", "updated_at")
SELECT "id", 'direct', 'a:' || "agent_id" || '|u:' || "user_id", "user_id", "created_at", "updated_at" FROM "thread";
--> statement-breakpoint
INSERT INTO "conversation_member" ("conversation_id", "user_id", "last_read_at", "joined_at")
SELECT "id", "user_id", "last_read_at", "created_at" FROM "thread";
--> statement-breakpoint
INSERT INTO "conversation_agent" ("conversation_id", "agent_id", "added_by", "model", "created_at")
SELECT "id", "agent_id", "user_id", "model", "created_at" FROM "thread";
--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "author_user_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "author_agent_id" text;--> statement-breakpoint
UPDATE "message" m SET
	"conversation_id" = t."id",
	"author_user_id" = CASE WHEN m."kind" = 'user' THEN t."user_id" END,
	"author_agent_id" = CASE WHEN m."kind" = 'bot' THEN t."agent_id" END
FROM "thread" t WHERE t."id" = m."thread_id";
--> statement-breakpoint
ALTER TABLE "message" ALTER COLUMN "conversation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "message_thread_id_thread_id_fk";--> statement-breakpoint
DROP INDEX "message_thread_created_idx";--> statement-breakpoint
ALTER TABLE "message" DROP COLUMN "thread_id";--> statement-breakpoint
ALTER TABLE "attachment" RENAME COLUMN "thread_id" TO "conversation_id";--> statement-breakpoint
ALTER TABLE "attachment" DROP CONSTRAINT "attachment_thread_id_thread_id_fk";--> statement-breakpoint
DROP INDEX "attachment_thread_idx";--> statement-breakpoint
DROP TABLE "thread";--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_agent" ADD CONSTRAINT "conversation_agent_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_agent" ADD CONSTRAINT "conversation_agent_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_agent" ADD CONSTRAINT "conversation_agent_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_member" ADD CONSTRAINT "conversation_member_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_member" ADD CONSTRAINT "conversation_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_agent_id_agent_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_conversation_idx" ON "attachment" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_agent_agent_idx" ON "conversation_agent" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "conversation_member_user_idx" ON "conversation_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_conversation_created_idx" ON "message" USING btree ("conversation_id","created_at");
