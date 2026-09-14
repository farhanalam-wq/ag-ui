import * as React from "react";
import { resolveIcon, type ResolvedIcon } from "./resolver";
import { loadIconModule } from "./registry";

export interface TechIconProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: number | string;
  variant?: "default" | "mono";
  showLabel?: boolean;
  className?: string;
  iconClassName?: string;
}

export function TechIcon({
  name,
  size = 20,
  variant = "default",
  showLabel = false,
  className = "",
  iconClassName = "",
  ...props
}: TechIconProps) {
  const resolved: ResolvedIcon = React.useMemo(() => resolveIcon(name), [name]);
  const [dynamicSvg, setDynamicSvg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (resolved.svg) {
      setDynamicSvg(null);
      return;
    }
    // If not in synchronous core icons, attempt background load of the slug from @thesvg/icons
    let active = true;
    loadIconModule(resolved.slug).then((mod) => {
      if (active && mod?.svg) {
        setDynamicSvg(mod.svg);
      }
    });
    return () => {
      active = false;
    };
  }, [resolved.slug, resolved.svg]);

  const rawSvg = resolved.svg || dynamicSvg;

  const svgContent = React.useMemo(() => {
    if (!rawSvg) return null;
    if (variant === "mono" && resolved.variants?.mono) {
      return resolved.variants.mono;
    }
    return rawSvg;
  }, [rawSvg, resolved.variants, variant]);

  const sizePx = typeof size === "number" ? `${size}px` : size;
  const Fallback = resolved.FallbackComponent;

  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      title={resolved.displayName}
      {...props}
    >
      {svgContent ? (
        <span
          className={`inline-flex items-center justify-center shrink-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:block ${iconClassName}`}
          style={{ width: sizePx, height: sizePx }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
          role="img"
          aria-label={resolved.displayName}
        />
      ) : (
        <span
          className={`inline-flex items-center justify-center shrink-0 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 p-0.5 border border-zinc-200 dark:border-zinc-700/50 ${iconClassName}`}
          style={{ width: sizePx, height: sizePx }}
          role="img"
          aria-label={resolved.displayName}
        >
          <Fallback className="w-full h-full" />
        </span>
      )}

      {showLabel && (
        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 tracking-tight">
          {resolved.displayName}
        </span>
      )}
    </div>
  );
}
