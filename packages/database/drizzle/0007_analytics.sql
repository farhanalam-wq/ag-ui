-- Analytics DDL — formerly packages/database/src/migrate-analytics*.ts.
--
-- page_views is RANGE-partitioned by month, which drizzle-kit cannot express.
-- This migration is therefore hand-maintained; the 0007 snapshot only records
-- the ORM shape. Runtime ownership stays in code:
--   - new monthly partitions: workers/worker/src/analytics-worker.ts
--   - retention (DROP old partitions): packages/analytics/src/rollup.ts
-- Keep these shapes in sync with schema.ts (typed reads only).

CREATE TABLE IF NOT EXISTS "page_views" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"type" text DEFAULT 'pageview' NOT NULL,
	"company_id" uuid NOT NULL,
	"widget_key_id" uuid,
	"session_hash" text NOT NULL,
	"visitor_hash" text NOT NULL,
	"url" text NOT NULL,
	"path" text NOT NULL,
	"referrer" text DEFAULT '' NOT NULL,
	"viewport" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"value" numeric,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_views_id_created_at_pk" PRIMARY KEY("id","created_at")
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint

DO $$
DECLARE
	base timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
	i integer;
	from_ts timestamptz;
	to_ts timestamptz;
	part text;
BEGIN
	-- Guard against a page_views created by drizzle-kit push: partitioning is
	-- not expressible there, and silently keeping an unpartitioned table would
	-- break monthly retention.
	IF NOT EXISTS (
		SELECT 1
		FROM pg_partitioned_table pt
		JOIN pg_class c ON c.oid = pt.partrelid
		WHERE c.relname = 'page_views'
	) THEN
		RAISE EXCEPTION 'page_views exists but is not partitioned — drop it and rerun db:migrate';
	END IF;

	-- Current + next month, so events never hit a missing partition.
	FOR i IN 0..1 LOOP
		from_ts := base + make_interval(months => i);
		to_ts := from_ts + interval '1 month';
		part := 'page_views_' || to_char(from_ts AT TIME ZONE 'UTC', 'YYYYMM');
		EXECUTE format(
			'CREATE TABLE IF NOT EXISTS %I PARTITION OF page_views FOR VALUES FROM (%L) TO (%L)',
			part, from_ts, to_ts
		);
		EXECUTE format(
			'CREATE INDEX IF NOT EXISTS %I ON %I (company_id, created_at)',
			part || '_company_time_idx', part
		);
		EXECUTE format(
			'CREATE INDEX IF NOT EXISTS %I ON %I (session_hash)',
			part || '_session_idx', part
		);
	END LOOP;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_hash" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"pageview_count" integer DEFAULT 0 NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"converted" boolean DEFAULT false NOT NULL,
	"revenue" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_company_session_started_unique" UNIQUE("company_id","session_hash","started_at")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "metrics_daily" (
	"company_id" uuid NOT NULL,
	"day" date NOT NULL,
	"pageviews" integer DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"revenue" numeric DEFAULT '0' NOT NULL,
	"chat_opens" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"scrolls" integer DEFAULT 0 NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"heartbeats" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "metrics_daily_company_id_day_pk" PRIMARY KEY("company_id","day")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "metrics_hourly" (
	"company_id" uuid NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"pageviews" integer DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"revenue" numeric DEFAULT '0' NOT NULL,
	"chat_opens" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"scrolls" integer DEFAULT 0 NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"heartbeats" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "metrics_hourly_company_id_hour_pk" PRIMARY KEY("company_id","hour")
);
--> statement-breakpoint

-- Convergence guards for databases migrated by the old Phase 1/3/3b scripts.
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_session_hash_key";
--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'sessions_company_session_started_unique'
	) THEN
		ALTER TABLE "sessions" ADD CONSTRAINT "sessions_company_session_started_unique"
			UNIQUE ("company_id", "session_hash", "started_at");
	END IF;
END $$;
--> statement-breakpoint

DO $$
DECLARE
	tbl text;
	cname text;
BEGIN
	FOREACH tbl IN ARRAY ARRAY['metrics_daily', 'metrics_hourly'] LOOP
		FOREACH cname IN ARRAY ARRAY['scrolls', 'downloads', 'clicks', 'heartbeats'] LOOP
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = tbl AND column_name = cname
			) THEN
				EXECUTE format('ALTER TABLE %I ADD COLUMN %I integer NOT NULL DEFAULT 0', tbl, cname);
			END IF;
		END LOOP;
	END LOOP;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'active_seconds'
	) THEN
		ALTER TABLE "sessions" ADD COLUMN "active_seconds" integer NOT NULL DEFAULT 0;
	END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metrics_daily_company_id_companies_id_fk') THEN
		ALTER TABLE "metrics_daily" ADD CONSTRAINT "metrics_daily_company_id_companies_id_fk"
			FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metrics_hourly_company_id_companies_id_fk') THEN
		ALTER TABLE "metrics_hourly" ADD CONSTRAINT "metrics_hourly_company_id_companies_id_fk"
			FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_views_company_id_companies_id_fk') THEN
		ALTER TABLE "page_views" ADD CONSTRAINT "page_views_company_id_companies_id_fk"
			FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_company_id_companies_id_fk') THEN
		ALTER TABLE "sessions" ADD CONSTRAINT "sessions_company_id_companies_id_fk"
			FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
