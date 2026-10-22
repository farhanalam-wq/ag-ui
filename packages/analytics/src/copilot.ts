/**
 * packages/analytics/src/copilot.ts
 *
 * Phase 7 — deterministic analytics copilot. Deliberately NOT an LLM:
 * the free-build constraint forbids paid model APIs, and a rule-based
 * planner over the Phase 1 registry is fully validatable — every number
 * in an answer is templated from a service payload, never generated.
 *
 * Guardrails are structural: the parser can only emit registry enums,
 * execution goes only through company-scoped services, widget output
 * goes only through schema-parsed buildWidgetSpec.
 */

import type { CacheRedis } from "./cache";
import { getAcquisitionReport } from "./acquisition";
import { getEngagementReport } from "./engagement";
import { getContentReport } from "./content";
import { getInsightsReport } from "./insights";
import { buildWidgetSpec, type WidgetKind } from "./widgets";
import { GROUPS } from "./catalogue";
import type { Channel } from "./registry";

export interface QueryPlan {
  intent: "report" | "widget" | "insights";
  report?: "acquisition" | "engagement" | "content";
  section?: "anomalies" | "quality" | "opportunity" | "journeys";
  widgetKind?: WidgetKind;
  metrics: string[];
  rangeDays: number;
  compare: boolean;
  channels: Channel[];
  table?: string;
  trendMetric?: string;
  variant?: "line" | "bar";
}

export interface PlanRejection {
  code: "conversion-scope-excluded" | "unsupported-forecast" | "unparseable";
  message: string;
  examples: string[];
}

const EXAMPLES = [
  "sessions by channel last 7 days",
  "engagement rate and active time past 30 days",
  "top landing pages vs previous period",
  "any traffic anomalies?",
  "show views trend as a bar chart last 30 days",
];

const CHANNELS: Channel[] = ["Direct", "Organic Social", "Campaign", "Email", "Referral"];

/**
 * The words that map to a metric.
 *
 * The metric ids are catalogue ids. The catalogue test asserts that every
 * one of them exists and is available, so the copilot cannot drift into
 * asking for a metric the product does not have.
 */
export const METRIC_KEYWORDS: ReadonlyArray<{ pattern: RegExp; metrics: string[] }> = [
  { pattern: /\busers?\b|\bvisitors?\b/, metrics: ["uniques"] },
  { pattern: /\bsessions?\b|\bvisits?\b/, metrics: ["sessions"] },
  { pattern: /\bviews?\b|\bpageviews?\b|\btraffic\b/, metrics: ["pageviews"] },
  { pattern: /\bengaged?\b|\bengagement\b/, metrics: ["engagedSessions", "engagementRate"] },
  { pattern: /\bactive time\b|\btime on\b|\btime spent\b/, metrics: ["avgEngagementTime"] },
  { pattern: /\bscroll/, metrics: ["scrolls"] },
  { pattern: /\bdownload/, metrics: ["downloads"] },
  { pattern: /\bclicks?\b/, metrics: ["clicks"] },
];

function findChannels(text: string): Channel[] {
  const t = ` ${text.toLowerCase()} `;
  const found: Channel[] = [];
  if (/\bsocial\b/.test(t)) found.push("Organic Social");
  if (/\bemail\b|\bnewsletter\b/.test(t)) found.push("Email");
  if (/\bdirect\b/.test(t)) found.push("Direct");
  if (/\bcampaign\b|\butm\b/.test(t)) found.push("Campaign");
  if (/\breferral\b|\breferrer\b/.test(t)) found.push("Referral");
  return found;
}

function findRange(text: string): number {
  const t = text.toLowerCase();
  const dayMatch = /(?:last|past)\s+(\d{1,3})\s+days?/.exec(t);
  if (dayMatch) return Math.min(90, Math.max(1, parseInt(dayMatch[1] ?? "14", 10)));
  const weekMatch = /(?:last|past)\s+(\d{1,2})\s+weeks?/.exec(t);
  if (weekMatch) return Math.min(90, Math.max(1, parseInt(weekMatch[1] ?? "2", 10) * 7));
  if (/past month|last month|last 30 days/.test(t)) return 30;
  if (/last 90 days|quarter/.test(t)) return 90;
  if (/last 7 days|past week|this week/.test(t)) return 7;
  return 14;
}

/**
 * Parses a question into a typed plan. Never throws; unknown input
 * becomes an explicit rejection with supported examples.
 */
export function parseQuestion(text: string): { ok: true; plan: QueryPlan } | { ok: false; rejection: PlanRejection } {
  const t = (text ?? "").toLowerCase().trim();
  if (!t) {
    return { ok: false, rejection: { code: "unparseable", message: "Empty question.", examples: EXAMPLES } };
  }
  if (/\b(conversion|revenue|purchase|checkout|roi|roas)\b/.test(t)) {
    return {
      ok: false,
      rejection: { code: "conversion-scope-excluded", message: "Conversion and revenue analysis is out of product scope.", examples: EXAMPLES },
    };
  }
  if (/\b(predict|forecast|projection|next month|next week|will .* (grow|increase)|organic search|seo|google ads)\b/.test(t)) {
    return {
      ok: false,
      rejection: { code: "unsupported-forecast", message: "Forecasts, SEO, and ads analytics are not supported — I answer from measured on-site data only.", examples: EXAMPLES },
    };
  }

  const rangeDays = findRange(t);
  const compare = /\bvs\b|versus|previous|compared?|compare\b/.test(t);
  const channels = findChannels(t);
  const wantsWidget = /\bwidget\b|\bchart\b|\bgraph\b|\btable\b|\bshow\b|\bdisplay\b|\bvisual\b/.test(t);
  const variant = /\bbar\b/.test(t) ? "bar" : "line";

  // Insights sections.
  if (/\banomal|spike|dip|unusual|alert\b/.test(t)) {
    return { ok: true, plan: { intent: "insights", section: "anomalies", metrics: ["pageviews", "sessions"], rangeDays, compare: false, channels } };
  }
  if (/\bquality\b|\bbest channel\b|\bchannel performance\b/.test(t)) {
    return { ok: true, plan: { intent: "insights", section: "quality", metrics: ["sessions", "pageviews"], rangeDays, compare: false, channels } };
  }
  if (/\bopportunit|\bweak\b|\bbounce\b|\bleak\b/.test(t)) {
    return { ok: true, plan: { intent: "insights", section: "opportunity", metrics: ["sessions"], rangeDays, compare: false, channels } };
  }
  if (/\bjourney\b|\bflow\b|\bpath.*(after|then|next)\b/.test(t)) {
    return { ok: true, plan: { intent: "insights", section: "journeys", metrics: ["sessions"], rangeDays, compare: false, channels } };
  }

  // Metrics vocabulary.
  const metrics: string[] = [];
  for (const { pattern, metrics: ids } of METRIC_KEYWORDS) {
    if (pattern.test(t)) metrics.push(...ids);
  }
  if (metrics.length === 0) {
    // Bare dimension questions ("channels?", "top pages?") default to views+sessions.
    if (/\bchannels?\b|\bsources?\b|\bmedium\b|\bcampaigns?\b|\blanding\b|\bpages?\b|\bpaths?\b|\btitles?\b|\bdevice\b|\bmobile\b|\bdesktop\b/.test(t)) {
      metrics.push("sessions", "pageviews");
    } else {
      return { ok: false, rejection: { code: "unparseable", message: "I couldn't map that to a known metric or breakdown.", examples: EXAMPLES } };
    }
  }

  // Report routing.
  const engagementOnly = metrics.every((m) => (GROUPS.engagement as readonly string[]).includes(m));
  const wantsTitle = /\btitle\b|\btitles\b/.test(t);
  const wantsPath = /\bpages?\b|\bpaths?\b|\blanding\b/.test(t);
  const wantsChannelDim = /\bchannels?\b|\bsources?\b|\bmedium\b|\bcampaigns?\b/.test(t);
  let report: "acquisition" | "engagement" | "content" = "acquisition";
  if (engagementOnly) report = "engagement";
  else if (wantsTitle || (wantsPath && wantsChannelDim)) report = "content";
  else if (wantsPath && !wantsChannelDim) report = "engagement";

  if (wantsWidget) {
    const isTrend = /\btrend\b|\bover time\b|\bchart\b|\bgraph\b/.test(t);
    const isTable = /\btable\b/.test(t) || (!isTrend && (wantsChannelDim || wantsPath || wantsTitle || /\bdevice\b/.test(t)));
    if (isTrend) {
      const widgetKind: WidgetKind = report === "engagement" ? "engagement-trend" : "acquisition-trend";
      const trendMetric = metrics.includes("sessions") ? "sessions" : metrics.includes("engagedSessions") ? "engagedSessions" : "pageviews";
      return { ok: true, plan: { intent: "widget", report, widgetKind, metrics, rangeDays, compare, channels, trendMetric, variant } };
    }
    if (isTable) {
      const table = /\bsource\b|\bmedium\b/.test(t) ? "sourceMedium" : /\bcampaign\b/.test(t) ? "campaign"
        : /\blanding\b/.test(t) ? "landing" : /\btitle\b/.test(t) ? "title"
        : /\bdevice\b|\bmobile\b|\bdesktop\b/.test(t) ? "device" : /\bpages?\b|\bpaths?\b/.test(t) ? "path" : "channel";
      return { ok: true, plan: { intent: "widget", report, widgetKind: "data-table", table, metrics, rangeDays, compare, channels, variant } };
    }
    const widgetKind: WidgetKind = report === "engagement" ? "engagement-kpis" : "acquisition-kpis";
    return { ok: true, plan: { intent: "widget", report, widgetKind, metrics, rangeDays, compare, channels, variant } };
  }

  return { ok: true, plan: { intent: "report", report, metrics, rangeDays, compare, channels } };
}

export interface CopilotAnswer {
  question: string;
  plan: QueryPlan;
  summary: string[];
  supporting: { label: string; value: string }[];
  widgetSpec?: { component: string; props: Record<string, unknown> };
  meta: { companyId: string; rangeDays: number; dataQuality: string[] };
}

const fmtN = (n: number) => Number(n ?? 0).toLocaleString("en-US");

/**
 * Executes a parsed plan through company-scoped services only and
 * templates the answer from measured numbers. Failure returns a safe
 * error object — never a partial or invented answer.
 */
export async function answerQuestion(
  redis: CacheRedis | null,
  companyId: string,
  question: string
): Promise<{ ok: true; answer: CopilotAnswer } | { ok: false; rejection: PlanRejection } | { ok: false; error: string }> {
  const parsed = parseQuestion(question);
  if (!parsed.ok) return parsed;
  const plan = parsed.plan;
  const rangeLabel = `last ${plan.rangeDays} days`;
  const filterBits: string[] = [];
  if (plan.channels.length > 0) filterBits.push(`channels: ${plan.channels.join(", ")}`);
  const filterLabel = filterBits.length > 0 ? filterBits.join("; ") : "no filters";

  try {
    if (plan.intent === "insights") {
      const ins = await getInsightsReport(companyId, plan.rangeDays);
      const summary: string[] = [];
      const supporting: { label: string; value: string }[] = [];
      if (plan.section === "anomalies") {
        if (ins.anomalies.length === 0) {
          summary.push(`No traffic anomalies in the ${rangeLabel} — every day stayed within expectations.`);
        } else {
          for (const a of ins.anomalies.slice(0, 3)) {
            summary.push(`${a.direction === "spike" ? "Spike" : "Dip"} in ${a.metric} on ${a.day}: ${fmtN(a.observed)} vs ${fmtN(a.expected)} expected (z=${a.z}).`);
            supporting.push({ label: `${a.day} context`, value: a.context.map((c) => `${c.label} ${fmtN(c.pageviews)}`).join(", ") || "—" });
          }
          summary.push("These slices are context, not proven causes.");
        }
      } else if (plan.section === "quality") {
        const top = [...ins.qualityMatrix].sort((a, b) => b.qualityScore - a.qualityScore)[0];
        if (!top) summary.push(`No channel traffic in the ${rangeLabel}.`);
        else {
          summary.push(`Best channel: ${top.channel} (quality ${top.qualityScore}/100, ${fmtN(top.sessions)} sessions).`);
          for (const q of ins.qualityMatrix) supporting.push({ label: q.channel, value: `score ${q.qualityScore}, ${fmtN(q.sessions)} sessions${q.confidence === "low" ? " (low confidence)" : ""}` });
        }
      } else if (plan.section === "opportunity") {
        const high = ins.opportunityMap.filter((o) => o.opportunity === "high");
        if (high.length === 0) summary.push(`No high-opportunity landing pages in the ${rangeLabel}.`);
        else {
          summary.push(`Top fix candidate: ${high[0]!.path} (${fmtN(high[0]!.sessions)} sessions). ${high[0]!.reason}`);
          for (const o of high.slice(0, 5)) supporting.push({ label: o.path, value: o.reason });
        }
      } else {
        if (ins.journeys.length === 0) summary.push(`No repeated two-step journeys in the ${rangeLabel}.`);
        else {
          const j = ins.journeys[0]!;
          summary.push(`Top journey: ${j.from} → ${j.to} (${fmtN(j.journeys)} journeys, ${Math.round(j.shareOfEntry * 100)}% of entry volume).`);
          for (const e of ins.journeys.slice(0, 5)) supporting.push({ label: `${e.from} → ${e.to}`, value: fmtN(e.journeys) });
        }
      }
      return { ok: true, answer: { question, plan, summary, supporting, meta: { companyId, rangeDays: plan.rangeDays, dataQuality: ins.freshness.dataQuality } } };
    }

    if (plan.intent === "widget") {
      const kind: WidgetKind = plan.widgetKind ?? (plan.report === "engagement" ? "engagement-kpis" : "acquisition-kpis");
      const built = await buildWidgetSpec(redis, companyId, {
        kind,
        report: plan.report,
        table: plan.table,
        rangeDays: plan.rangeDays,
        variant: plan.variant ?? "line",
        trendMetric: (plan.trendMetric as "pageviews" | "sessions" | "engagedSessions" | undefined) ?? "pageviews",
        channels: plan.channels,
        compare: plan.compare,
      });
      if (!built.ok) {
        return { ok: false, rejection: { code: "unparseable", message: built.errors.map((e) => e.message).join(" "), examples: EXAMPLES } };
      }
      return {
        ok: true,
        answer: {
          question,
          plan,
          summary: [`Built a ${kind} widget from the ${rangeLabel} (${filterLabel}). Render it through the Widget Studio ${built.spec.component}.`],
          supporting: [],
          widgetSpec: { component: built.spec.component, props: built.spec.props },
          meta: { companyId, rangeDays: plan.rangeDays, dataQuality: built.spec.meta.dataQuality },
        },
      };
    }

    // report
    const summary: string[] = [];
    const supporting: { label: string; value: string }[] = [];
    let dq: string[] = [];
    if (plan.report === "acquisition") {
      const a = await getAcquisitionReport(redis, companyId, plan.rangeDays, plan.compare, plan.channels);
      dq = a.freshness.dataQuality;
      summary.push(`Sessions: ${fmtN(a.totals.sessions ?? 0)}, views: ${fmtN(a.totals.pageviews ?? 0)}${a.totals.uniques != null ? `, users: ${fmtN(Number(a.totals.uniques))}` : ""} in the ${rangeLabel} (${filterLabel}).`);
      if (plan.compare && a.previousTotals) {
        summary.push(`Previous ${plan.rangeDays} days: ${fmtN(a.previousTotals.sessions ?? 0)} sessions, ${fmtN(a.previousTotals.pageviews ?? 0)} views.`);
      }
      for (const r of a.byChannel.slice(0, 5)) supporting.push({ label: String(r.label), value: `${fmtN(Number(r.sessions))} sessions` });
    } else if (plan.report === "engagement") {
      const e = await getEngagementReport(companyId, plan.rangeDays);
      dq = e.freshness.dataQuality;
      const t = e.totals;
      const bits = [`${fmtN(t.sessions ?? 0)} sessions`, `${fmtN(t.pageviews ?? 0)} views`];
      if (plan.metrics.includes("engagedSessions") || plan.metrics.includes("engagementRate")) bits.push(`${fmtN(t.engagedSessions ?? 0)} engaged (${Number(t.engagementRate ?? 0)}%)`);
      if (plan.metrics.includes("avgEngagementTime")) bits.push(`avg active time ${Number(t.avgEngagementTime ?? 0)}s`);
      if (plan.metrics.includes("scrolls")) bits.push(`${fmtN(t.scrolls ?? 0)} scrolls`);
      if (plan.metrics.includes("downloads")) bits.push(`${fmtN(t.downloads ?? 0)} downloads`);
      if (plan.metrics.includes("clicks")) bits.push(`${fmtN(t.clicks ?? 0)} clicks`);
      summary.push(`${bits.join(", ")} in the ${rangeLabel} (${filterLabel}).`);
      for (const r of e.byPath.slice(0, 5)) supporting.push({ label: String(r.label), value: `${fmtN(Number(r.pageviews))} views` });
    } else {
      const c = await getContentReport(companyId, plan.rangeDays);
      dq = c.freshness.dataQuality;
      summary.push(`${fmtN(c.totals.pageviews ?? 0)} views across ${fmtN(c.totals.sessions ?? 0)} sessions in the ${rangeLabel} (${filterLabel}).`);
      for (const r of c.byPath.slice(0, 5)) supporting.push({ label: String(r.label), value: `${fmtN(Number(r.pageviews))} views` });
    }
    return { ok: true, answer: { question, plan, summary, supporting, meta: { companyId, rangeDays: plan.rangeDays, dataQuality: dq } } };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
