-- Analytics dimensions — browser, operating system and the visitor's timezone.
--
-- These are derived once, at the collector, and stored on the event. A report
-- never re-parses a user agent: the same row must not be able to read as two
-- different browsers depending on which library version the API was running.
--
-- `page_views` is RANGE-partitioned. In PostgreSQL 11+ an ADD COLUMN on the
-- partitioned parent propagates to every existing partition, so this is a
-- plain ALTER — no per-partition DDL, no table rewrite.
--
-- Country is deliberately absent: the GeoIP source is still an open decision
-- (docs/analytics-rebuild.md D12). Adding the column later is the same
-- migration shape.

ALTER TABLE "page_views" ADD COLUMN "browser" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "os" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "tz_offset" smallint;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "browser" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "os" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "tz_offset" smallint;
