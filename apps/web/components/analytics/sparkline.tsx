"use client";

/**
 * apps/web/components/analytics/sparkline.tsx
 *
 * A trend the size of a word, under a KPI.
 *
 * Recharts is deliberately not here: a sparkline renders inside the metric
 * grid, so it must be cheap enough to join the first paint. The shape is an
 * inline SVG polyline with a non-scaling stroke, so the component can stretch
 * to its container without the 2px line turning into a 2px mush.
 *
 * Gaps are honest: a non-finite value breaks the line rather than inventing a
 * point, and a single point draws as a dot instead of pretending to be a line.
 */

export function Sparkline({
  values,
  color = "hsl(var(--chart-1))",
  height = 28,
  className,
  ariaLabel,
}: {
  /** The series, in time order. Non-finite values draw as gaps. */
  values: Array<number | null | undefined>;
  color?: string;
  height?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => Number.isFinite(p.v));
  const n = values.length;

  if (points.length === 0 || n < 2) return null;

  const finite = points.map((p) => p.v);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const W = 100;
  const H = height;
  const pad = 3;
  const x = (i: number) => (i / (n - 1)) * (W - 2 * pad) + pad;
  const y = (v: number) =>
    H - pad - ((v - min) / span) * (H - 2 * pad);

  // One continuous path per run of finite values, so gaps stay gaps.
  const runs: string[] = [];
  let run: { v: number; i: number }[] = [];
  const flush = () => {
    if (run.length > 0) {
      runs.push(
        run.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ")
      );
      run = [];
    }
  };
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (Number.isFinite(v)) run.push({ v: v as number, i });
    else flush();
  }
  flush();

  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
    >
      {runs.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* The end dot marks where "now" is, even on a flat series. */}
      <circle
        cx={x(last.i)}
        cy={y(last.v)}
        r={2}
        fill={color}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
