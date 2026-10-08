CREATE TABLE "brand_stylesheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"snapshot_id" uuid,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"dtcg" jsonb,
	"tailwind" text,
	"design_md" text,
	"wcag" jsonb,
	"raw" jsonb,
	"screenshot_url" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_stylesheets" ADD CONSTRAINT "brand_stylesheets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_stylesheets" ADD CONSTRAINT "brand_stylesheets_snapshot_id_company_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."company_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_stylesheets_company_idx" ON "brand_stylesheets" USING btree ("company_id");