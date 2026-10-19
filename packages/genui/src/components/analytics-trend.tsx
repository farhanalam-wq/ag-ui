import * as React from "react";

export interface AnalyticsTrendPoint {
  label: string;
  value: number;
}

export interface AnalyticsTrendProps {
  points: AnalyticsTrendPoint[];
  variant?: "line" | "bar";
  title?: string;
  className?: string;
}

const W = 560;
const H = 220;
const PAD = 28;

export function AnalyticsTrend({ points = [], variant = "line", title, className = "" }: AnalyticsTrendProps) {
  const clean = (Array.isArray(points) ? points : []).filter(
    (p): p is AnalyticsTrendPoint => Boolean(p) && typeof p.label === "string" && Number.isFinite(Number(p.value))
  );
  if (clean.length === 0) return null;

  const vals = clean.map((p) => Number(p.value));
  const max = Math.max(1, ...vals);
  const n = clean.length;
  const x = (i: number) => (n === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (n - 1));
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const ticks = 4;

  return (
    <div className={className}>
      {title ? <p className="mb-2 text-sm font-medium">{title}</p> : null}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title ?? "Analytics trend"}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const gy = PAD + ((H - PAD * 2) * i) / ticks;
          return <line key={i} x1={PAD} x2={W - 8} y1={gy} y2={gy} stroke="currentColor" strokeOpacity={0.12} />;
        })}
        {variant === "bar" ? (
          clean.map((p, i) => {
            const bw = Math.max(4, ((W - PAD * 2) / n) * 0.6);
            return (
              <rect
                key={i}
                x={x(i) - bw / 2}
                y={y(Number(p.value))}
                width={bw}
                height={Math.max(1, H - PAD - y(Number(p.value)))}
                rx={3}
                fill="currentColor"
                fillOpacity={0.75}
              />
            );
          })
        ) : (
          <React.Fragment>
            <polyline
              points={clean.map((p, i) => `${x(i)},${y(Number(p.value))}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {clean.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(Number(p.value))} r={3.5} fill="currentColor" />
            ))}
          </React.Fragment>
        )}
        {clean.map((p, i) =>
          n <= 31 && i % Math.ceil(n / 8) === 0 ? (
            <text key={i} x={x(i)} y={H - 8} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.6}>
              {p.label}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}
