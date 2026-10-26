ALTER TABLE "companies" DROP CONSTRAINT "companies_domain_unique";--> statement-breakpoint
ALTER TABLE "crawl_jobs" DROP CONSTRAINT "crawl_jobs_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "widget_key_domains" ALTER COLUMN "created_by" SET DATA TYPE uuid USING "created_by"::uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "owner_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_key_domains" ADD CONSTRAINT "widget_key_domains_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Deleting a user cascades users -> companies -> widget_keys -> widget_key_domains,
-- while widget_key_domains.created_by is SET NULL. Without deferral the SET NULL
-- update re-checks the key_id FK after the parent key is already gone and fails.
-- Deferring the key FK lets both paths resolve at commit.
ALTER TABLE "widget_key_domains" DROP CONSTRAINT "widget_key_domains_key_id_widget_keys_id_fk";--> statement-breakpoint
ALTER TABLE "widget_key_domains" ADD CONSTRAINT "widget_key_domains_key_id_widget_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."widget_keys"("id") ON DELETE cascade DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_owner_domain_unique" ON "companies" USING btree ("owner_id","domain");--> statement-breakpoint
CREATE INDEX "companies_owner_idx" ON "companies" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "crawl_jobs" DROP COLUMN "owner";--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_company_idempotency_unique" UNIQUE("company_id","idempotency_key");