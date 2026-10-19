import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // NOTE: analytics tables (page_views/sessions/metrics_*) are DDL-owned by
  // drizzle/0007_*.sql because page_views is RANGE-partitioned, which
  // drizzle-kit cannot express. Do not use `db:push` for this database: it
  // would create page_views unpartitioned and fight the partition children.
  // The canonical setup path is `db:migrate`.
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/ag_ui",
  },
});
