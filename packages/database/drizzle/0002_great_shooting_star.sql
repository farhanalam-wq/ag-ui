CREATE TABLE "batch_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime" text,
	"size" integer DEFAULT 0 NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batch_files" ADD CONSTRAINT "batch_files_batch_id_enrichment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."enrichment_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_files_batch_idx" ON "batch_files" USING btree ("batch_id");