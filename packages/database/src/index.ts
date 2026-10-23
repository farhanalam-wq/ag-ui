import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/ag_ui";

// Disable prefetch as it is not supported for "Transaction" pool mode.
//
// TimeZone=UTC is part of the analytics contract, not a preference: the
// naive `timestamp` columns (conversations, messages, error_events,
// company_snapshots) hold UTC wall-clock, the day buckets are UTC days, and
// `now() - interval` has to mean the same thing as the JS side. postgres.js
// passes `connection` through as startup parameters, so every session in
// the pool gets it. Without this, the module's time arithmetic depends on
// how the database host happens to be configured.
export const client = postgres(connectionString, {
  prepare: false,
  connection: { TimeZone: "UTC" },
});
export const db = drizzle(client, { schema });

export * from "./schema";
export * from "./errors";
export * from "drizzle-orm";
export type { PgColumn } from "drizzle-orm/pg-core";
export * from "./theme";
export * from "./retrieval";
export * from "./qdrant";
export * from "./cache";
export * from "./widget-keys";
export * from "./widget-key-domains";
export * from "./rate-limit";
