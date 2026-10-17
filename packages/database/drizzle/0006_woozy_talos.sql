CREATE TABLE "widget_theme_overrides" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"override" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "widget_theme_overrides" ADD CONSTRAINT "widget_theme_overrides_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;