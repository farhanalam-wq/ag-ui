CREATE TABLE "enrichment_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"minor" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"docs" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"manifest" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb,
	"error_sample" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "enrichment_batches_snapshot_minor_unique" UNIQUE("snapshot_id","minor")
);
--> statement-breakpoint
ALTER TABLE "company_snapshots" ADD COLUMN "summary" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_kind" text DEFAULT 'crawl' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "origin_name" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "enrichment_batches" ADD CONSTRAINT "enrichment_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_batches" ADD CONSTRAINT "enrichment_batches_snapshot_id_company_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."company_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrichment_batches_company_idx" ON "enrichment_batches" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_batch_id_enrichment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."enrichment_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_batch_id_idx" ON "documents" USING btree ("batch_id");