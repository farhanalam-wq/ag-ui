ALTER TABLE "conversations" ADD COLUMN "channel" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_company_channel_created_idx" ON "conversations" USING btree ("company_id","channel","created_at");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_check" CHECK ("conversations"."channel" in ('text', 'voice'));