import * as React from "react";

export interface GraphicBannerProps {
  title: string;
  category?: string;
  accentColor?: "cyan" | "indigo" | "emerald" | "violet" | "amber" | "rose" | "blue";
  aspectRatio?: "16:9" | "21:9" | "3:1" | "auto";
  className?: string;
}

const ACCENT_STYLES = {
  cyan: {
    border: "border-cyan-500/30",
    glow: "from-cyan-500/20 via-sky-500/10 to-transparent",
    pill: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
    textGradient: "from-white via-cyan-100 to-cyan-400",
    gridStroke: "rgba(6, 182, 212, 0.15)",
  },
  indigo: {
    border: "border-indigo-500/30",
    glow: "from-indigo-500/20 via-purple-500/10 to-transparent",
    pill: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400",
    textGradient: "from-white via-indigo-100 to-indigo-400",
    gridStroke: "rgba(99, 102, 241, 0.15)",
  },
  emerald: {
    border: "border-emerald-500/30",
    glow: "from-emerald-500/20 via-teal-500/10 to-transparent",
    pill: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    textGradient: "from-white via-emerald-100 to-emerald-400",
    gridStroke: "rgba(16, 185, 129, 0.15)",
  },
  violet: {
    border: "border-violet-500/30",
    glow: "from-violet-500/20 via-fuchsia-500/10 to-transparent",
    pill: "bg-violet-500/10 border-violet-500/30 text-violet-400",
    textGradient: "from-white via-violet-100 to-violet-400",
    gridStroke: "rgba(139, 92, 246, 0.15)",
  },
  amber: {
    border: "border-amber-500/30",
    glow: "from-amber-500/20 via-orange-500/10 to-transparent",
    pill: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    textGradient: "from-white via-amber-100 to-amber-400",
    gridStroke: "rgba(245, 158, 11, 0.15)",
  },
  rose: {
    border: "border-rose-500/30",
    glow: "from-rose-500/20 via-pink-500/10 to-transparent",
    pill: "bg-rose-500/10 border-rose-500/30 text-rose-400",
    textGradient: "from-white via-rose-100 to-rose-400",
    gridStroke: "rgba(244, 63, 94, 0.15)",
  },
  blue: {
    border: "border-blue-500/30",
    glow: "from-blue-500/20 via-indigo-500/10 to-transparent",
    pill: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    textGradient: "from-white via-blue-100 to-blue-400",
    gridStroke: "rgba(59, 130, 246, 0.15)",
  },
};

const ASPECT_RATIO_CLASSES = {
  "16:9": "aspect-[16/9] min-h-[160px]",
  "21:9": "aspect-[21/9] min-h-[140px]",
  "3:1": "aspect-[3/1] min-h-[120px]",
  auto: "h-36 sm:h-44",
};

export function GraphicBanner({
  title,
  category = "CAPABILITY DOMAIN",
  accentColor = "indigo",
  aspectRatio = "auto",
  className = "",
}: GraphicBannerProps) {
  const styles = ACCENT_STYLES[accentColor] || ACCENT_STYLES.indigo;
  const aspectClass = ASPECT_RATIO_CLASSES[aspectRatio] || ASPECT_RATIO_CLASSES.auto;

  return (
    <div
      className={`relative w-full ${aspectClass} overflow-hidden rounded-2xl bg-zinc-950 border ${styles.border} flex flex-col justify-end p-5 select-none shadow-lg ${className}`}
    >
      {/* Background isometric perspective grid */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-60"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id={`grid-pattern-${accentColor}`}
            width="36"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 36 0 L 0 0 0 36"
              fill="none"
              stroke={styles.gridStroke}
              strokeWidth="0.8"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-pattern-${accentColor})`} />
      </svg>

      {/* Radial atmospheric ambient bloom */}
      <div
        className={`absolute -top-12 -right-12 w-64 h-64 rounded-full bg-gradient-to-br ${styles.glow} blur-2xl pointer-events-none`}
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent pointer-events-none"
      />

      {/* Foreground category badge & title */}
      <div className="relative z-10 space-y-1.5 max-w-xl">
        {category && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-medium tracking-widest uppercase backdrop-blur-md ${styles.pill}">
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            <span>{category}</span>
          </div>
        )}
        <h3 className={`text-base sm:text-lg md:text-xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r ${styles.textGradient} line-clamp-2`}>
          {title}
        </h3>
      </div>
    </div>
  );
}
