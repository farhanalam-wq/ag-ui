import * as React from "react";
import {
  Car,
  Bus,
  AirplaneTilt,
  Train,
  NavigationArrow,
  Clock,
  Compass,
  ArrowRight,
} from "@phosphor-icons/react";
import { TechIcon } from "../icons/tech-icon";

export interface RoutePoint {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface RouteStep {
  instruction: string;
  distance?: string;
}

export interface RouteMapProps {
  origin: RoutePoint | string;
  destination: RoutePoint | string;
  mode?: "drive" | "transit" | "walk" | "train" | "air";
  distance?: string;
  duration?: string;
  steps?: RouteStep[];
  brandIcon?: string;
  companyName?: string;
  className?: string;
}

function normalizePoint(p: RoutePoint | string): RoutePoint {
  if (typeof p === "string") return { name: p };
  return p;
}

export function RouteMap({
  origin,
  destination,
  mode = "drive",
  distance = "7.8 km",
  duration = "20 mins",
  steps = [],
  brandIcon,
  companyName,
  className = "",
}: RouteMapProps) {
  const normOrigin = normalizePoint(origin);
  const normDest = normalizePoint(destination);

  // Approximate default coordinates for Kolkata Airport -> Ecospace if none passed
  const oLat = normOrigin.lat ?? 22.645;
  const oLng = normOrigin.lng ?? 88.446;
  const dLat = normDest.lat ?? 22.585;
  const dLng = normDest.lng ?? 88.468;

  // Bounding box for OpenStreetMap embed
  const minLng = Math.min(oLng, dLng) - 0.02;
  const maxLng = Math.max(oLng, dLng) + 0.02;
  const minLat = Math.min(oLat, dLat) - 0.015;
  const maxLat = Math.max(oLat, dLat) + 0.015;

  const modeIcon = React.useMemo(() => {
    switch (mode) {
      case "transit":
        return <Bus size={16} weight="fill" />;
      case "train":
        return <Train size={16} weight="fill" />;
      case "air":
        return <AirplaneTilt size={16} weight="fill" />;
      case "drive":
      default:
        return <Car size={16} weight="fill" />;
    }
  }, [mode]);

  return (
    <div
      className={`relative w-full min-w-0 rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 shadow-xl flex flex-col justify-between transition-all select-none ${className}`}
    >
      {/* Map View Area */}
      <div className="relative w-full h-[320px] sm:h-[400px] overflow-hidden bg-[#e5e3df] dark:bg-[#1f242d]">
        {/* OpenStreetMap Tile Layer (Matching Screenshot 3) */}
        <iframe
          title="Turn-by-turn Route Map"
          className="w-full h-full border-0 pointer-events-none opacity-95 dark:invert-[0.92] dark:hue-rotate-180"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik`}
        />

        {/* Dynamic SVG Vector Route Line Layer on top of the street map */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
            <filter id="routeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1e3a8a" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Polyline connecting Origin (top-left) to Destination (bottom-right) */}
          <path
            d="M 32% 28% L 46% 34% L 50% 52% L 58% 66% L 62% 72%"
            fill="none"
            stroke="url(#routeGradient)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#routeShadow)"
          />
        </svg>

        {/* Origin Blue Marker Pin (A) */}
        <div
          style={{ left: "32%", top: "28%" }}
          className="absolute -translate-x-1/2 -translate-y-full z-20 flex flex-col items-center pointer-events-none"
        >
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-white text-white shadow-lg flex items-center justify-center text-xs font-bold font-mono">
              A
            </div>
            <div className="w-2 h-2 bg-blue-600 rotate-45 mx-auto -mt-1" />
          </div>
        </div>

        {/* Destination Red Marker Pin (B) */}
        <div
          style={{ left: "62%", top: "72%" }}
          className="absolute -translate-x-1/2 -translate-y-full z-20 flex flex-col items-center pointer-events-none"
        >
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-red-600 border-2 border-white text-white shadow-lg flex items-center justify-center text-xs font-bold font-mono">
              B
            </div>
            <div className="w-2 h-2 bg-red-600 rotate-45 mx-auto -mt-1" />
          </div>
        </div>

        {/* Top Stats Floating HUD (Matching Screenshot 3) */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          {/* Mode Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow-lg text-xs font-mono font-bold uppercase tracking-wider">
            {modeIcon}
            <span>{mode}</span>
          </div>

          {/* Distance & Time Pills */}
          <div className="inline-flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-700/70 shadow-lg text-xs font-mono">
            <div>
              <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-bold block">
                DISTANCE
              </span>
              <span className="font-bold text-zinc-900 dark:text-zinc-50">{distance}</span>
            </div>
            <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />
            <div>
              <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-bold block">
                TIME
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{duration}</span>
            </div>
          </div>
        </div>

        {/* Map Attribution */}
        <div className="absolute bottom-2 right-3 z-10 text-[9px] font-mono text-zinc-600 dark:text-zinc-400 bg-white/70 dark:bg-zinc-900/70 px-1.5 py-0.5 rounded backdrop-blur-sm">
          © OpenStreetMap contributors
        </div>
      </div>

      {/* Bottom Journey Location Card (Matching Screenshot 3) */}
      <div className="relative z-20 m-3 sm:m-4 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Brand / Mode Emblem */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 p-2 shadow-sm">
            {brandIcon || companyName ? (
              <TechIcon name={brandIcon || companyName || "route"} size={24} />
            ) : (
              <NavigationArrow size={22} className="text-blue-600 dark:text-blue-400" />
            )}
          </div>

          {/* Journey Waypoints */}
          <div className="min-w-0 space-y-2">
            {/* Origin Row */}
            <div className="flex items-center gap-2 min-w-0 text-xs">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-500 bg-white shrink-0" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold shrink-0">
                YOUR LOCATION
              </span>
              <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                {normOrigin.name}
              </span>
            </div>

            {/* Destination Row */}
            <div className="flex items-center gap-2 min-w-0 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold shrink-0">
                DESTINATION
              </span>
              <span className="font-bold text-zinc-900 dark:text-zinc-50 truncate">
                {normDest.name}
              </span>
            </div>
          </div>
        </div>

        {/* Right Duration Pill */}
        <div className="flex items-center gap-2 sm:self-center shrink-0">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center shadow-md">
            <Clock size={20} weight="bold" />
          </div>
        </div>
      </div>

      {/* Optional Turn-by-Turn Steps */}
      {Array.isArray(steps) && steps.length > 0 && (
        <div className="px-4 pb-4 border-t border-zinc-200 dark:border-zinc-800/80 pt-3 space-y-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold block">
            Navigation Steps
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-200/60 dark:border-zinc-800"
              >
                <ArrowRight size={13} className="text-blue-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span>{step.instruction}</span>
                  {step.distance && (
                    <span className="text-[10px] font-mono text-zinc-400 ml-1.5">
                      ({step.distance})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
