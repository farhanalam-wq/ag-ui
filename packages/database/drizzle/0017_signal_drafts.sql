CREATE TABLE "signal_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"cluster_key" text NOT NULL,
	"question" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"faq" jsonb,
	"jsonld" jsonb,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "signal_drafts_status_check" CHECK ("signal_drafts"."status" in ('DRAFT', 'APPROVED', 'DISMISSED'))
);
--> statement-breakpoint
ALTER TABLE "signal_drafts" ADD CONSTRAINT "signal_drafts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signal_drafts_company_cluster_unique" ON "signal_drafts" USING btree ("company_id","cluster_key");--> statement-breakpoint
CREATE INDEX "signal_drafts_company_status_idx" ON "signal_drafts" USING btree ("company_id","status","updated_at");