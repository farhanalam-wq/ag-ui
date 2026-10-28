CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'RECORDED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "webhook_events_company_created_idx" ON "webhook_events" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE INDEX "webhook_events_type_idx" ON "webhook_events" USING btree ("event_type");
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_status_check" CHECK ("leads"."status" in ('NEW', 'QUALIFIED', 'CONTACTED', 'DISMISSED'));
