CREATE TABLE "brand_logo" (
	"key" text PRIMARY KEY NOT NULL,
	"mime" text,
	"data" "bytea",
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
