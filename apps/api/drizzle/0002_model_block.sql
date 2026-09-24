CREATE TABLE "model_block" (
	"user_id" text NOT NULL,
	"model" text NOT NULL,
	CONSTRAINT "model_block_user_id_model_pk" PRIMARY KEY("user_id","model")
);
--> statement-breakpoint
ALTER TABLE "model_block" ADD CONSTRAINT "model_block_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;