CREATE TABLE "error_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text DEFAULT 'error' NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"context" jsonb,
	"company_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "error_events_source_created_idx" ON "error_events" USING btree ("source","created_at");--> statement-breakpoint
CREATE INDEX "error_events_company_created_idx" ON "error_events" USING btree ("company_id","created_at");