import * as React from "react";

export interface AnalyticsTableRow {
  label: string;
  pageviews: number;
  sessions: number;
}

export interface AnalyticsTableProps {
  rows: AnalyticsTableRow[];
  title?: string;
  className?: string;
}

export function AnalyticsTable({ rows = [], title, className = "" }: AnalyticsTableProps) {
  const clean = (Array.isArray(rows) ? rows : []).filter(
    (r): r is AnalyticsTableRow => Boolean(r) && typeof r.label === "string"
  );
  if (clean.length === 0) return null;

  return (
    <div className={className}>
      {title ? <p className="mb-2 text-sm font-medium">{title}</p> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs opacity-60">
            <th className="py-1 pr-2 font-medium">Label</th>
            <th className="py-1 pr-2 text-right font-medium">Views</th>
            <th className="py-1 text-right font-medium">Sessions</th>
          </tr>
        </thead>
        <tbody>
          {clean.map((r, i) => (
            <tr key={`${r.label}-${i}`} className="border-t border-neutral-500/20">
              <td className="max-w-[280px] truncate py-1.5 pr-2">{r.label}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{Number(r.pageviews ?? 0).toLocaleString()}</td>
              <td className="py-1.5 text-right tabular-nums">{Number(r.sessions ?? 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
