import * as React from "react";
import { Buildings, Compass, GlobeHemisphereWest, Sparkle } from "@phosphor-icons/react";

export interface GlobalHub {
  city: string;
  country: string;
  isHq?: boolean;
  address?: string;
  lat?: number;
  lng?: number;
  region?: string;
}

export interface GlobalNetworkMapProps {
  title?: string;
  hubs?: GlobalHub[];
  stats?: {
    totalHubs?: number;
    reachCount?: number;
  };
  companyName?: string;
  className?: string;
}

// Default global network nodes if not provided
const DEFAULT_HUBS: GlobalHub[] = [
  { city: "Kolkata", country: "India", isHq: true, lat: 22.5726, lng: 88.3639, region: "APAC HQ" },
  { city: "London", country: "UK", isHq: false, lat: 51.5074, lng: -0.1278, region: "EMEA Hub" },
  { city: "Munich", country: "Germany", isHq: false, lat: 48.1351, lng: 11.582, region: "Central Europe" },
  { city: "Warsaw", country: "Poland", isHq: false, lat: 52.2297, lng: 21.0122, region: "Nearshore Center" },
  { city: "Singapore", country: "Singapore", isHq: false, lat: 1.3521, lng: 103.8198, region: "ASEAN Hub" },
  { city: "New York", country: "USA", isHq: false, lat: 40.7128, lng: -74.006, region: "US East" },
  { city: "San Francisco", country: "USA", isHq: false, lat: 37.7749, lng: -122.4194, region: "US West" },
];

/**
 * Projects latitude/longitude to X/Y percentages on an equirectangular world map.
 */
function projectCoordinates(lat: number, lng: number): { x: number; y: number } {
  // Map longitude (-180 to 180) -> 0% to 100%
  const x = ((lng + 180) / 360) * 100;
  // Map latitude (85 to -60 clipped) -> 10% to 90%
  const clampedLat = Math.max(-60, Math.min(85, lat));
  const y = ((85 - clampedLat) / 145) * 100;
  return { x: Math.max(5, Math.min(95, x)), y: Math.max(8, Math.min(92, y)) };
}

export function GlobalNetworkMap({
  title = "GLOBAL NETWORK",
  hubs,
  stats,
  companyName,
  className = "",
}: GlobalNetworkMapProps) {
  const activeHubs = hubs && hubs.length > 0 ? hubs : DEFAULT_HUBS;
  const [selectedHub, setSelectedHub] = React.useState<GlobalHub | null>(
    () => activeHubs.find((h) => h.isHq) || activeHubs[0]
  );

  const countries = React.useMemo(() => {
    const set = new Set<string>();
    activeHubs.forEach((h) => set.add(h.country.toUpperCase()));
    return Array.from(set);
  }, [activeHubs]);

  const totalHubsCount = stats?.totalHubs || activeHubs.length;
  const reachCount = stats?.reachCount || countries.length;

  return (
    <div
      className={`relative w-full min-w-0 rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-[#e8f1f5] dark:bg-[#0d1622] shadow-xl flex flex-col justify-between transition-all select-none ${className}`}
    >
      {/* Top Bar: Title & Legend */}
      <div className="relative z-10 flex items-center justify-between p-5 pb-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100 font-sans">
            {title}
          </h2>
          {companyName && (
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              | {companyName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200 dark:border-zinc-700/60 text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-300 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
            <span>HQ</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200 dark:border-zinc-700/60 text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-300 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            <span>REGIONS</span>
          </div>
        </div>
      </div>

      {/* Interactive World Map Canvas */}
      <div className="relative w-full h-[280px] sm:h-[340px] my-2 overflow-hidden flex items-center justify-center">
        {/* SVG World Map Continents Silhouette */}
        <svg
          viewBox="0 0 1000 500"
          className="w-full h-full object-contain pointer-events-none opacity-40 dark:opacity-25 fill-zinc-400 dark:fill-zinc-600"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* North America */}
          <path d="M 120 70 Q 200 60 280 100 Q 300 170 260 240 Q 200 250 160 210 Q 110 140 120 70 Z" />
          <path d="M 160 110 Q 240 100 270 140 Q 250 200 180 180 Z" />
          {/* South America */}
          <path d="M 280 270 Q 350 290 340 370 Q 310 450 280 440 Q 250 350 280 270 Z" />
          {/* Europe */}
          <path d="M 470 90 Q 560 80 570 150 Q 510 180 480 140 Z" />
          <path d="M 490 120 Q 540 110 530 160 Q 480 160 490 120 Z" />
          {/* Africa */}
          <path d="M 460 190 Q 570 180 580 270 Q 540 380 490 370 Q 450 270 460 190 Z" />
          {/* Asia */}
          <path d="M 580 80 Q 820 60 880 160 Q 850 260 740 280 Q 640 230 580 170 Z" />
          <path d="M 680 190 Q 750 180 770 270 Q 720 280 680 240 Z" />
          {/* Australia */}
          <path d="M 780 340 Q 890 330 880 410 Q 810 430 780 380 Z" />
        </svg>

        {/* Global Connection Network Curves */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
          <defs>
            <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          {activeHubs.map((hub, i) => {
            const hq = activeHubs.find((h) => h.isHq) || activeHubs[0];
            if (hub === hq) return null;
            const p1 = projectCoordinates(hq.lat ?? 22.57, hq.lng ?? 88.36);
            const p2 = projectCoordinates(hub.lat ?? 0, hub.lng ?? 0);
            return (
              <path
                key={i}
                d={`M ${p1.x}% ${p1.y}% Q ${(p1.x + p2.x) / 2}% ${Math.min(p1.y, p2.y) - 12}% ${p2.x}% ${p2.y}%`}
                fill="none"
                stroke="url(#curveGradient)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            );
          })}
        </svg>

        {/* Map Pins */}
        {activeHubs.map((hub, idx) => {
          const coords = projectCoordinates(hub.lat ?? 20, hub.lng ?? 0);
          const isSelected = selectedHub?.city === hub.city;

          return (
            <div
              key={idx}
              style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer group"
              onClick={() => setSelectedHub(hub)}
            >
              {hub.isHq ? (
                // HQ glowing radar pin
                <div className="relative flex items-center justify-center">
                  <span className="absolute -inset-2.5 rounded-full bg-blue-500/40 animate-ping pointer-events-none" />
                  <span className="absolute -inset-1.5 rounded-full bg-blue-500/30" />
                  <div className="relative w-4 h-4 rounded-full bg-blue-600 border-2 border-white dark:border-zinc-900 shadow-lg flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  {/* Tooltip */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg bg-zinc-900/90 text-white text-[11px] font-mono shadow-md backdrop-blur-md border border-white/10 pointer-events-none">
                    {hub.city} HQ
                  </div>
                </div>
              ) : (
                // Regional Hub dot
                <div className="relative flex items-center justify-center">
                  <div
                    className={`w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 shadow-md transition-transform ${
                      isSelected
                        ? "bg-blue-600 scale-125 ring-2 ring-blue-400"
                        : "bg-sky-400 group-hover:scale-125"
                    }`}
                  />
                  {/* Tooltip on hover/select */}
                  <div
                    className={`absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-md bg-zinc-900/90 text-white text-[10px] font-mono shadow-sm transition-opacity ${
                      isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {hub.city}, {hub.country}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Floating HUD Bar (Matching Screenshot 2) */}
      <div className="relative z-10 m-3 sm:m-4 rounded-2xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        {/* Left Statistics: Hubs & Reach */}
        <div className="flex items-center gap-6">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
              HUBS
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50">
                {totalHubsCount}
              </span>
              <span className="text-xs font-mono text-zinc-500">Nodes</span>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-800" />

          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
              PRESENCE
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
                {reachCount}
              </span>
              <span className="text-xs font-mono text-zinc-500">Countries</span>
            </div>
          </div>

          {selectedHub && (
            <>
              <div className="hidden md:block h-8 w-px bg-zinc-200 dark:bg-zinc-800" />
              <div className="hidden md:block min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                  SELECTED NODE
                </div>
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                  {selectedHub.city}, {selectedHub.country} {selectedHub.isHq && "(Global HQ)"}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Country Pill Badges (Interactive Filtering) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {countries.map((country, idx) => {
            const isMatch = selectedHub?.country.toUpperCase() === country;
            return (
              <button
                key={idx}
                onClick={() => {
                  const match = activeHubs.find((h) => h.country.toUpperCase() === country);
                  if (match) setSelectedHub(match);
                }}
                className={`px-3 py-1 rounded-xl text-xs font-mono font-semibold uppercase tracking-wider transition-all ${
                  isMatch
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
                    : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {country}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
