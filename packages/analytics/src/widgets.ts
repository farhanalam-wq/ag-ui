/**
 * packages/analytics/src/widgets.ts
 *
 * Phase 5 — validated analytics widget specs for the Widget Studio engine.
 * A spec is { component, props } where props ALWAYS parse against the real
 * genui zod schemas (single source of truth, imported — never mirrored).
 * Data comes only from company-scoped services; an invalid config or a
 * cross-company leak fails loudly instead of rendering.
 */

import { z } from "zod";
import {
  MetricGridSchema,
  AnalyticsTrendSchema,
  AnalyticsTableSchema,
} from "@ag-ui/genui";
import type { CacheRedis } from "./cache";
import { getAcquisitionReport } from "./acquisition";
import { getEngagementReport } from "./engagement";
import { getContentReport } from "./content";
import type { Channel } from "./registry";

export const WIDGET_KINDS = [
  "acquisition-kpis",
  "engagement-kpis",
  "acquisition-trend",
  "engagement-trend",
  "data-table",
] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

const REPORTS = ["acquisition", "engagement", "content"] as const;
type Report = (typeof REPORTS)[number];
const TABLES = ["channel", "sourceMedium", "campaign", "landing", "path", "title", "device"] as const;
type TableSel = (typeof TABLES)[number];

/** Which tables each report can serve (registry dimensions, enforced). */
const REPORT_TABLES: Record<Report, TableSel[]> = {
  acquisition: ["channel", "sourceMedium", "campaign", "landing"],
  engagement: ["path", "device"],
  content: ["path", "title", "channel", "device"],
};

export const WidgetConfigSchema = z.object({
  kind: z.enum(WIDGET_KINDS),
  report: z.enum(REPORTS).optional(),
  table: z.enum(TABLES).optional(),
  rangeDays: z.number().int().min(1).max(90).default(14),
  variant: z.enum(["line", "bar"]).default("line"),
  trendMetric: z.enum(["pageviews", "sessions", "engagedSessions"]).default("pageviews"),
  channels: z.array(z.enum(["Direct", "Organic Social", "Campaign", "Email", "Referral"])).default([]),
  compare: z.boolean().default(false),
});
export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;

export interface WidgetSpecError {
  code: "bad-kind" | "incompatible-report" | "incompatible-table" | "bad-channels" | "bad-trend-metric" | "backend-error";
  message: string;
}

const fmtInt = (n: number) => Number(n ?? 0).toLocaleString("en-US");
const pct = (cur: number, prev: number): { change: string; trend: "up" | "down" | "neutral" } => {
  if (!(prev > 0)) return { change: "no prior data", trend: "neutral" };
  const p = ((cur - prev) / prev) * 100;
  const r = Math.round(p * 10) / 10;
  return { change: `${r > 0 ? "+" : ""}${r}% vs prev`, trend: r > 0 ? "up" : r < 0 ? "down" : "neutral" };
};

function configErrors(c: WidgetConfig): WidgetSpecError[] {
  const errors: WidgetSpecError[] = [];
  if (c.kind === "data-table") {
    if (!c.report) errors.push({ code: "incompatible-report", message: "data-table needs a report." });
    if (!c.table) errors.push({ code: "incompatible-table", message: "data-table needs a table." });
    if (c.report && c.table && !REPORT_TABLES[c.report].includes(c.table)) {
      errors.push({ code: "incompatible-table", message: `"${c.table}" is not served by the ${c.report} report.` });
    }
    if (c.channels.length > 0 && c.report !== "acquisition") {
      errors.push({ code: "bad-channels", message: "Channel filters apply to acquisition tables only." });
    }
  } else {
    if (c.report && ((c.kind.startsWith("acquisition") && c.report !== "acquisition") || (c.kind.startsWith("engagement") && c.report !== "engagement"))) {
      errors.push({ code: "incompatible-report", message: `"${c.kind}" reads its own report; report must match or be omitted.` });
    }
    if (c.table) errors.push({ code: "incompatible-table", message: `Table selection applies to data-table only.` });
    if (c.channels.length > 0 && !c.kind.startsWith("acquisition")) {
      errors.push({ code: "bad-channels", message: "Channel filters apply to acquisition widgets only." });
    }
  }
  if (c.kind.endsWith("-trend") && c.trendMetric === "engagedSessions" && !c.kind.startsWith("engagement")) {
    errors.push({ code: "bad-trend-metric", message: "engagedSessions trend needs an engagement widget." });
  }
  return errors;
}

export interface WidgetSpec {
  component: "MetricGrid" | "AnalyticsTrend" | "AnalyticsTable";
  props: Record<string, unknown>;
  meta: { companyId: string; rangeDays: number; generatedAt: string; dataQuality: string[] };
}

export async function buildWidgetSpec(
  redis: CacheRedis | null,
  companyId: string,
  raw: unknown
): Promise<{ ok: true; spec: WidgetSpec } | { ok: false; errors: WidgetSpecError[] }> {
  const parsed = WidgetConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({
        code: "bad-kind" as const,
        message: `${i.path.join(".") || "config"}: ${i.message}`,
      })),
    };
  }
  const c = parsed.data;
  const cfgErrs = configErrors(c);
  if (cfgErrs.length > 0) return { ok: false, errors: cfgErrs };

  const meta = (dq: string[]) => ({
    companyId,
    rangeDays: c.rangeDays,
    generatedAt: new Date().toISOString(),
    dataQuality: dq,
  });

  try {
    if (c.kind === "acquisition-kpis" || c.kind === "acquisition-trend") {
      const a = await getAcquisitionReport(redis, companyId, c.rangeDays, c.compare, c.channels as Channel[]);
      if (c.kind === "acquisition-kpis") {
        const metrics = [
          { label: "Sessions", value: fmtInt(a.totals.sessions ?? 0), ...(c.compare && a.previousTotals ? pct(a.totals.sessions ?? 0, a.previousTotals.sessions ?? 0) : {}) },
          {
            label: "Unique visitors",
            value: a.totals.uniques != null ? fmtInt(Number(a.totals.uniques)) : "—",
            ...(c.compare && a.previousTotals?.uniques != null && a.totals.uniques != null
              ? pct(Number(a.totals.uniques), Number(a.previousTotals.uniques))
              : {}),
          },
          { label: "Views", value: fmtInt(a.totals.pageviews ?? 0), ...(c.compare && a.previousTotals ? pct(a.totals.pageviews ?? 0, a.previousTotals.pageviews ?? 0) : {}) },
        ];
        const props = { metrics, title: "Acquisition" };
        MetricGridSchema.parse(props);
        return { ok: true, spec: { component: "MetricGrid", props, meta: meta(a.freshness.dataQuality) } };
      }
      const points = a.trend.map((t) => ({
        label: t.d.slice(5),
        value: Number((t as Record<string, number>)[c.trendMetric] ?? t.pageviews),
      }));
      const props = { points, variant: c.variant, title: "Acquisition trend" };
      AnalyticsTrendSchema.parse(props);
      return { ok: true, spec: { component: "AnalyticsTrend", props, meta: meta(a.freshness.dataQuality) } };
    }

    if (c.kind === "engagement-kpis" || c.kind === "engagement-trend") {
      const e = await getEngagementReport(companyId, c.rangeDays);
      if (c.kind === "engagement-kpis") {
        const t = e.totals;
        const metrics = [
          { label: "Views", value: fmtInt(t.pageviews ?? 0) },
          { label: "Sessions", value: fmtInt(t.sessions ?? 0) },
          { label: "Engaged sessions", value: fmtInt(t.engagedSessions ?? 0) },
          { label: "Engagement rate", value: `${Number(t.engagementRate ?? 0)}%` },
          { label: "Avg. active time", value: `${Number(t.avgEngagementTime ?? 0)}s` },
        ];
        const props = { metrics, title: "Engagement" };
        MetricGridSchema.parse(props);
        return { ok: true, spec: { component: "MetricGrid", props, meta: meta(e.freshness.dataQuality) } };
      }
      const points = e.trend.map((t) => ({
        label: t.d.slice(5),
        value: Number((t as Record<string, number>)[c.trendMetric] ?? t.sessions),
      }));
      const props = { points, variant: c.variant, title: "Engagement trend" };
      AnalyticsTrendSchema.parse(props);
      return { ok: true, spec: { component: "AnalyticsTrend", props, meta: meta(e.freshness.dataQuality) } };
    }

    // data-table
    const report = c.report as Report;
    const table = c.table as TableSel;
    const rows = await (async () => {
      if (report === "acquisition") {
        const a = await getAcquisitionReport(redis, companyId, c.rangeDays, false, c.channels as Channel[]);
        const src =
          table === "channel" ? a.byChannel : table === "sourceMedium" ? a.bySourceMedium : table === "campaign" ? a.byCampaign : a.byLandingPage;
        return { rows: src.map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) })), dq: a.freshness.dataQuality };
      }
      if (report === "engagement") {
        const e = await getEngagementReport(companyId, c.rangeDays);
        const src = table === "path" ? e.byPath : e.byDevice;
        return { rows: src.map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) })), dq: e.freshness.dataQuality };
      }
      const ct = await getContentReport(companyId, c.rangeDays);
      const src = table === "path" ? ct.byPath : table === "title" ? ct.byTitle : table === "channel" ? ct.byChannel : ct.byDevice;
      return { rows: src.map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) })), dq: ct.freshness.dataQuality };
    })();
    const props = { rows: rows.rows.slice(0, 10), title: `${report} · ${table}` };
    AnalyticsTableSchema.parse(props);
    return { ok: true, spec: { component: "AnalyticsTable", props, meta: meta(rows.dq) } };
  } catch (err: unknown) {
    return { ok: false, errors: [{ code: "backend-error", message: err instanceof Error ? err.message : String(err) }] };
  }
}
