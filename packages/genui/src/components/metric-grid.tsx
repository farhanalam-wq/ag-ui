import * as React from "react";
import {
  TrendUp,
  TrendDown,
  Minus,
  ChartLineUp,
  Clock,
  ShieldCheck,
  Globe,
  Lightning,
} from "@phosphor-icons/react";

export interface MetricData {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  subtitle?: string;
  icon?: string;
}

export interface MetricGridProps {
  metrics: MetricData[];
  title?: string;
  columns?: number;
  className?: string;
}

function getMetricIcon(label?: string, iconHint?: string) {
  const text = (iconHint || label || "").toLowerCase();
  if (text.includes("latency") || text.includes("speed") || text.includes("time") || text.includes("ms")) {
    return Clock;
  }
  if (text.includes("delivery") || text.includes("uptime") || text.includes("rate") || text.includes("growth")) {
    return ChartLineUp;
  }
  if (text.includes("security") || text.includes("sla") || text.includes("compliance")) {
    return ShieldCheck;
  }
  if (text.includes("global") || text.includes("region") || text.includes("country")) {
    return Globe;
  }
  return Lightning;
}

export function MetricGrid({
  metrics = [],
  title,
  columns = 3,
  className = "",
}: MetricGridProps) {
  if (!metrics || !Array.isArray(metrics) || metrics.length === 0) return null;

  const validMetrics = metrics.filter((m): m is MetricData => Boolean(m && typeof m === "object"));
  if (validMetrics.length === 0) return null;

  const colsClass =
    columns === 2 || validMetrics.length === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : columns === 4 || validMetrics.length === 4
      ? "grid-cols-2 lg:grid-cols-4"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`w-full min-w-0 space-y-3 ${className}`}>
      {title && (
        <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800/80">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
            {title}
          </h4>
          <span className="text-[11px] font-mono text-zinc-400">
            {validMetrics.length} Key Indicators
          </span>
        </div>
      )}

      <div className={`grid ${colsClass} gap-3 w-full min-w-0`}>
        {validMetrics.map((metric, idx) => {
          const label = typeof metric.label === "string" ? metric.label : "";
          const value = typeof metric.value === "string" ? metric.value : (metric.value != null ? String(metric.value) : "");
          const change = typeof metric.change === "string" ? metric.change : "";
          const subtitle = typeof metric.subtitle === "string" ? metric.subtitle : "";
          const IconComp = getMetricIcon(label, metric.icon);

          const isPositive =
            metric.trend === "up" ||
            change.startsWith("+") ||
            label.toLowerCase().includes("uptime");
          const isNegative =
            metric.trend === "down" ||
            change.startsWith("-");

          return (
            <div
              key={idx}
              className="flex flex-col justify-between p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/90 bg-white/70 dark:bg-zinc-900/40 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all backdrop-blur-md space-y-3 min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 font-mono uppercase tracking-wider truncate">
                  {label || "Metric"}
                </span>
                <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0">
                  <IconComp className="size-4" />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {value || "—"}
                  </span>

                  {change && (
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold ${
                        isPositive
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : isNegative
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      {isPositive ? (
                        <TrendUp className="size-3 shrink-0" />
                      ) : isNegative ? (
                        <TrendDown className="size-3 shrink-0" />
                      ) : (
                        <Minus className="size-3 shrink-0" />
                      )}
                      <span>{change}</span>
                    </span>
                  )}
                </div>

                {subtitle && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono line-clamp-2">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
