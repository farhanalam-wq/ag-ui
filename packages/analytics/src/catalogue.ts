/**
 * packages/analytics/src/catalogue.ts
 *
 * The analytics package's view of the metric contract.
 *
 * The contract itself lives in `@ag-ui/shared` (packages/shared/src/
 * analytics-catalogue.ts) because the API and the browser both have to read
 * it: the API validates queries against it and resolves caveat codes into
 * sentences, and the browser renders the same sentences plus the metric
 * stories. It is pure data, so it is safe on both sides.
 *
 * This module re-exports the catalogue's public surface, so every import
 * inside the analytics package keeps working and the package's own API stays
 * "the catalogue, plus the behaviour built on it".
 */

export {
  METRICS,
  DIMENSIONS,
  SURFACES,
  CAVEATS,
  GROUPS,
  REPORTS,
  BROWSER_VALUES,
  OS_VALUES,
  metricById,
  surfaceTabs,
  tabMetrics,
  caveatNotes,
  type MetricDef,
  type MetricStatus,
  type MetricUnit,
  type MetricGrain,
  type MetricFreshness,
  type DimensionId,
  type DimensionDef,
  type CaveatId,
  type SurfaceId,
  type SurfaceDef,
  type TabDef,
  type SourceRef,
  type SourceTable,
  type ReportGroup,
  type BrowserValue,
  type OsValue,
} from "@ag-ui/shared";
