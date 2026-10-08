CREATE TABLE "widget_key_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"include_paths" text[] NOT NULL,
	"exclude_paths" text[] NOT NULL,
	"created_by" text,
	"created_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "widget_key_domains_key_origin_unique" UNIQUE("key_id","origin")
);
--> statement-breakpoint
ALTER TABLE "widget_key_domains" ADD CONSTRAINT "widget_key_domains_key_id_widget_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."widget_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "widget_key_domains_key_idx" ON "widget_key_domains" USING btree ("key_id");