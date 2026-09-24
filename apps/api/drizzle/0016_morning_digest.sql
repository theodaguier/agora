CREATE TABLE "digest" (
	"id" text PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text NOT NULL,
	"locale" text NOT NULL,
	"team" jsonb,
	"stats" jsonb,
	"error" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "digest_day_unique" UNIQUE("day")
);
--> statement-breakpoint
CREATE TABLE "digest_personal" (
	"digest_id" text NOT NULL,
	"user_id" text NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "digest_personal_digest_id_user_id_pk" PRIMARY KEY("digest_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "digest_seen" text;--> statement-breakpoint
ALTER TABLE "digest_personal" ADD CONSTRAINT "digest_personal_digest_id_digest_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_personal" ADD CONSTRAINT "digest_personal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;