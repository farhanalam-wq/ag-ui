import * as React from "react";
import {
  MapPin,
  AirplaneTilt,
  Train,
  Car,
  Bus,
  Clock,
  GlobeHemisphereWest,
  NavigationArrow,
} from "@phosphor-icons/react";

export interface TransitOption {
  mode: "air" | "train" | "transit" | "road" | "walk";
  description: string;
  duration?: string;
}

export type CoordinateData =
  | string
  | {
      lat?: number | string;
      lng?: number | string;
      latitude?: number | string;
      longitude?: number | string;
    };

export interface GeoCardProps {
  locationName: string;
  address: string;
  coordinates?: CoordinateData;
  transitOptions?: TransitOption[];
  workingHours?: string;
  timezone?: string;
  notes?: string;
  className?: string;
}

function getTransitIcon(mode: TransitOption["mode"]) {
  switch (mode) {
    case "air":
      return <AirplaneTilt size={16} className="text-sky-500" />;
    case "train":
      return <Train size={16} className="text-amber-500" />;
    case "road":
      return <Car size={16} className="text-emerald-500" />;
    case "transit":
    case "walk":
    default:
      return <Bus size={16} className="text-indigo-500" />;
  }
}

export function GeoCard({
  locationName,
  address,
  coordinates,
  transitOptions = [],
  workingHours,
  timezone,
  notes,
  className = "",
}: GeoCardProps) {
  if (!locationName && !address) return null;

  // Safely parse and format coordinates regardless of whether LLM passed string or object
  const { formattedGps, numericLat, numericLng } = React.useMemo(() => {
    if (!coordinates) return { formattedGps: null, numericLat: null, numericLng: null };
    if (typeof coordinates === "string") {
      const match = coordinates.match(/([-+]?\d+(?:\.\d+)?)[,\s]+([-+]?\d+(?:\.\d+)?)/);
      if (match) {
        return {
          formattedGps: coordinates,
          numericLat: parseFloat(match[1]),
          numericLng: parseFloat(match[2]),
        };
      }
      return { formattedGps: coordinates, numericLat: null, numericLng: null };
    }
    if (typeof coordinates === "object") {
      const lat = coordinates.lat ?? coordinates.latitude;
      const lng = coordinates.lng ?? coordinates.longitude;
      if (lat != null && lng != null) {
        const nLat = typeof lat === "number" ? lat : parseFloat(lat);
        const nLng = typeof lng === "number" ? lng : parseFloat(lng);
        return {
          formattedGps: `${nLat.toFixed(4)}° N, ${nLng.toFixed(4)}° E`,
          numericLat: nLat,
          numericLng: nLng,
        };
      }
    }
    return { formattedGps: null, numericLat: null, numericLng: null };
  }, [coordinates]);

  return (
    <div
      className={`w-full min-w-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl p-5 sm:p-6 shadow-md space-y-5 transition-all ${className}`}
    >
      {/* Header with Location Name & Badges */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0 text-brand-primary">
            <MapPin size={22} weight="duotone" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              {locationName}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 font-mono flex items-center gap-1.5">
              <span>{address}</span>
            </p>
          </div>
        </div>

        {/* Timezone / Hours pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-500">
          {timezone && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/50">
              <GlobeHemisphereWest size={14} className="text-zinc-400" />
              <span>{timezone}</span>
            </div>
          )}
          {workingHours && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/50">
              <Clock size={14} className="text-zinc-400" />
              <span>{workingHours}</span>
            </div>
          )}
        </div>
      </div>

      {/* Interactive OpenStreetMap preview if coordinates exist */}
      {numericLat != null && numericLng != null && (
        <div className="relative w-full h-44 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950">
          <iframe
            title={locationName}
            className="w-full h-full border-0 pointer-events-none opacity-90 dark:invert-[0.92] dark:hue-rotate-180"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${numericLng - 0.015}%2C${numericLat - 0.01}%2C${numericLng + 0.015}%2C${numericLat + 0.01}&layer=mapnik&marker=${numericLat}%2C${numericLng}`}
          />
          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-zinc-900/80 backdrop-blur-md text-[10px] font-mono text-zinc-300 border border-white/10">
            OpenStreetMap
          </div>
        </div>
      )}

      {/* Transit & Commute Pathways */}
      {Array.isArray(transitOptions) && transitOptions.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
              <NavigationArrow size={13} className="text-brand-primary" />
              <span>Access & Transit Options</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              {transitOptions.length} Routes Identified
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {transitOptions.map((opt, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800/70 bg-zinc-50/60 dark:bg-zinc-900/40 p-3"
              >
                <div className="w-7 h-7 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 border border-zinc-300/40 dark:border-zinc-700/50 flex items-center justify-center shrink-0 mt-0.5">
                  {getTransitIcon(opt.mode)}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                      {opt.mode}
                    </span>
                    {opt.duration && (
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-200/50 dark:bg-zinc-800/60 px-1.5 py-0.5 rounded">
                        {opt.duration}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug">
                    {opt.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coordinates / Footnote */}
      {(notes || formattedGps) && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          {notes && <p className="leading-relaxed">{notes}</p>}
          {formattedGps && (
            <span className="font-mono text-[10px] shrink-0 bg-zinc-100 dark:bg-zinc-800/50 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700/40">
              GPS: {formattedGps}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
