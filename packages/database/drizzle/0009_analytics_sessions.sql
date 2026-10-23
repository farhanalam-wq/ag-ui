ALTER TABLE "metrics_daily" ADD COLUMN "engaged_sessions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "metrics_hourly" ADD COLUMN "engaged_sessions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "engaged" boolean DEFAULT false NOT NULL;