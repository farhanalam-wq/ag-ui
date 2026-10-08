// Brand extractor package: thin wrapper around the `dembrandt` CLI plus
// defensive mappers from raw dembrandt JSON to ag-ui brand tokens.

declare const Bun: any;

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface DembrandtRunOptions {
  timeoutMs?: number;
  noSandbox?: boolean;
  /** Capture Tailwind v4 @theme CSS via --tailwind into a temp file. Default true. */
  tailwind?: boolean;
}

export interface DembrandtRunResult {
  raw: any;
  tailwindCss: string | null;
}

const DEFAULT_TIMEOUT_MS = 90_000;

export async function runDembrandt(origin: string, opts?: DembrandtRunOptions): Promise<DembrandtRunResult> {
  const target = (origin ?? "").trim();
  if (!target) throw new Error("runDembrandt: origin is required");
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wantTailwind = opts?.tailwind ?? true;

  // Temp dir for file exports dembrandt can only write to disk (--tailwind).
  // stdout stays the raw extraction JSON (proven: file flags don't hijack it,
  // unlike --dtcg which replaces stdout with the DTCG document).
  const workdir = await mkdtemp(join(tmpdir(), "dembrandt-"));
  const themePath = join(workdir, "theme.css");
  const args = [
    "x",
    "-y",
    "dembrandt@0.38.0",
    target,
    "--json-only",
    "--wcag",
    "--color-format",
    "hex",
  ];
  if (wantTailwind) args.push("--tailwind", themePath);
  if (opts?.noSandbox) args.push("--no-sandbox");

  const proc = Bun.spawn(["bun", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise: Promise<string> = new Response(proc.stdout).text();
  const stderrPromise: Promise<string> = new Response(proc.stderr).text();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // ignore kill errors; the rejection below carries the failure
      }
      reject(new Error(`dembrandt timed out after ${timeoutMs}ms for ${target}`));
    }, timeoutMs);
  });

  let exitCode: number;
  try {
    exitCode = (await Promise.race([proc.exited, timeoutPromise])) as number;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  if (exitCode !== 0) {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
    const detail = (stderr || stdout || "").slice(0, 2000).trim();
    throw new Error(`dembrandt failed (exit ${exitCode})${detail ? `: ${detail}` : ""}`);
  }
  const text = (stdout || "").trim();
  if (!text) {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
    throw new Error("dembrandt returned empty output");
  }
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `dembrandt returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  let tailwindCss: string | null = null;
  if (wantTailwind) {
    try {
      const css = (await readFile(themePath, "utf8")).trim();
      tailwindCss = css.length > 0 ? css : null;
    } catch {
      tailwindCss = null;
    }
  }
  await rm(workdir, { recursive: true, force: true }).catch(() => {});
  return { raw, tailwindCss };
}

/**
 * Pure (no browser) DTCG export from a stored raw extraction, using
 * dembrandt's own formatter. Null when the input isn't a valid extraction.
 */
export async function buildDtcg(raw: any): Promise<Record<string, any> | null> {
  try {
    const mod: any = await import("dembrandt/dtcg-export");
    const doc = mod.toDtcgTokens(raw);
    if (doc && typeof doc === "object") return doc as Record<string, any>;
    return null;
  } catch {
    return null;
  }
}

/**
 * Pure (no browser) DESIGN.md brand doc from a stored raw extraction.
 * Null when generation fails.
 */
export async function buildDesignMd(raw: any): Promise<string | null> {
  try {
    const mod: any = await import("dembrandt/markdown");
    const md = mod.generateDesignMd(raw);
    if (typeof md === "string" && md.trim().length > 0) return md;
    return null;
  } catch {
    return null;
  }
}

export interface BrandTokens {
  colors: {
    primary: string;
    secondary?: string;
    background: string;
    foreground: string;
  };
  typography: {
    headingFont?: string;
    bodyFont?: string;
  };
  radius: string;
  style: "corporate" | "playful" | "minimal" | "technical";
}

export interface MappedBrand {
  logoUrl?: string;
  tokens: BrandTokens;
}

function asRecord(v: unknown): Record<string, any> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, any>;
  return {};
}

function firstNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return undefined;
}

function rgbToHex(input: string): string | undefined {
  const m = input.trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (!m) return undefined;
  const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, parseInt(n, 10))));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeColorString(input: string): string {
  const t = input.trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t)) return t.toLowerCase();
  return rgbToHex(t) ?? t;
}

function colorString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim().length > 0) return normalizeColorString(v);
  const r = asRecord(v);
  const found = firstNonEmptyString(
    r.normalized,
    r.hex,
    r.value,
    r.color,
    r.background,
    r.text,
    r.primary,
    r.name
  );
  return found ? normalizeColorString(found) : undefined;
}

function confidenceOf(v: unknown): number {
  const r = asRecord(v);
  const c = r.confidence ?? r.score ?? r.weight ?? r.count;
  return typeof c === "number" && Number.isFinite(c) ? c : 0;
}

function topPaletteColor(palette: unknown): string | undefined {
  if (!Array.isArray(palette)) {
    const r = asRecord(palette);
    const vals = Object.values(r);
    if (vals.length > 0 && vals.every((v) => typeof v === "string" || typeof asRecord(v).hex === "string") === false) {
      // fall through to generic handling below
    } else if (vals.length > 0) {
      for (const v of vals) {
        const c = colorString(v);
        if (c) return c;
      }
    }
    return undefined;
  }
  const ranked = palette
    .map((entry) => ({ color: colorString(entry), confidence: confidenceOf(entry) }))
    .filter((e): e is { color: string; confidence: number } => !!e.color)
    .sort((a, b) => b.confidence - a.confidence);
  return ranked[0]?.color;
}

function paletteAt(palette: unknown, n: number): string | undefined {
  if (!Array.isArray(palette)) return undefined;
  const ranked = palette
    .map((entry) => ({ color: colorString(entry), confidence: confidenceOf(entry) }))
    .filter((e): e is { color: string; confidence: number } => !!e.color)
    .sort((a, b) => b.confidence - a.confidence);
  return ranked[n]?.color;
}

function fontFamilyOf(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  const r = asRecord(v);
  return firstNonEmptyString(r.family, r.fontFamily, r.font, r.name, r.value);
}

function pickFont(
  styles: unknown,
  matchers: RegExp[],
  fallbackIndex: number
): string | undefined {
  if (!Array.isArray(styles)) return undefined;
  for (const s of styles) {
    const r = asRecord(s);
    const role = firstNonEmptyString(r.role, r.kind, r.category, r.usage, r.name) ?? "";
    if (matchers.some((m) => m.test(role))) {
      const f = fontFamilyOf(s) ?? fontFamilyOf(r.family) ?? firstNonEmptyString(r.fontFamily);
      if (f) return f;
    }
  }
  return fontFamilyOf(styles[fallbackIndex]);
}

function radiusString(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return `${v}px`;
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  const r = asRecord(v);
  return firstNonEmptyString(r.value, r.radius, r.md, r.medium, r.default, r.base);
}

function mostUsedRadius(v: unknown): string | undefined {
  if (Array.isArray(v)) {
    const ranked = v
      .map((entry) => {
        if (typeof entry === "string" || typeof entry === "number") {
          return { radius: radiusString(entry), count: 0 };
        }
        const r = asRecord(entry);
        const countRaw = r.count ?? r.uses ?? r.frequency ?? r.weight;
        return {
          radius: radiusString(entry) ?? radiusString(r.value ?? r.radius),
          count: typeof countRaw === "number" && Number.isFinite(countRaw) ? countRaw : 0,
        };
      })
      .filter((e): e is { radius: string; count: number } => !!e.radius)
      .sort((a, b) => b.count - a.count);
    return ranked[0]?.radius;
  }
  const r = asRecord(v);
  // Object map form: { "0.5rem": 12, "8px": 4 } or { sm: "4px", md: "8px" }
  const entries = Object.entries(r);
  if (entries.length === 0) return radiusString(v);
  const counted = entries.map(([k, val]) => {
    if (typeof val === "number") return { radius: k, count: val };
    const rs = radiusString(val);
    return { radius: rs ?? k, count: 0 };
  });
  counted.sort((a, b) => b.count - a.count);
  // If every count is 0 there is no usage signal; prefer a `md`-ish key.
  if (counted.every((e) => e.count === 0)) {
    const preferred = entries.find(([k]) => /^(md|medium|default|base)$/i.test(k));
    if (preferred) return radiusString(preferred[1]) ?? preferred[0];
  }
  return counted[0]?.radius;
}

function detectStyle(raw: Record<string, any>): BrandTokens["style"] {
  const haystack = [
    firstNonEmptyString(raw.style, raw.mood, raw.vibe),
    firstNonEmptyString(asRecord(raw.brand).style),
    Array.isArray(raw.keywords) ? raw.keywords.filter((k) => typeof k === "string").join(" ") : "",
    Array.isArray(raw.moods) ? raw.moods.filter((k) => typeof k === "string").join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\bplayful\b|\bfun\b|\bwitty\b|\brounded\b|\bquirky\b/.test(haystack)) return "playful";
  if (/\bminimal\b|\bclean\b|\bsimple\b|\bspare\b|\bswiss\b/.test(haystack)) return "minimal";
  if (/\btechnical\b|\bdeveloper\b|\bmono\b|\bengineering\b|\bterminal\b/.test(haystack))
    return "technical";
  return "corporate";
}

export function mapDembrandtToTokens(raw: any): MappedBrand {
  try {
    const root = asRecord(raw);
    const colors = asRecord(root.colors);
    const semantic = asRecord(colors.semantic ?? root.semantic);
    const palette = colors.palette ?? root.palette;

    const primary =
      colorString(semantic.primary) ??
      colorString(semantic.brand) ??
      colorString(colors.primary) ??
      topPaletteColor(palette) ??
      "#2563eb";
    const secondary =
      colorString(semantic.secondary) ??
      colorString(semantic.accent) ??
      colorString(colors.secondary) ??
      colorString(colors.accent) ??
      paletteAt(palette, 1);
    const background =
      colorString(semantic.background) ??
      colorString(semantic.surface) ??
      colorString(colors.background) ??
      "#09090b";
    const foreground =
      colorString(semantic.text) ??
      colorString(semantic.foreground) ??
      colorString(semantic.onBackground) ??
      colorString(colors.foreground) ??
      colorString(colors.text) ??
      "#fafafa";

    const typography = asRecord(root.typography);
    const styles = typography.styles ?? root.fonts ?? root.type;
    const headingFont = pickFont(styles, [/head/i, /title/i, /display/i, /h1/i], 0);
    const bodyFont = pickFont(styles, [/body/i, /text/i, /paragraph/i, /content/i], 1);

    const borderRadius = root.borderRadius ?? root.radius ?? colors.borderRadius;
    const radius =
      mostUsedRadius(asRecord(borderRadius).values ?? borderRadius) ?? "0.5rem";

    const logoUrl = firstNonEmptyString(
      asRecord(root.logo).url,
      asRecord(root.brand).logo,
      root.logoUrl,
      root.logo,
      asRecord(root.assets).logo,
      asRecord(asRecord(root.assets).images).logo
    );

    return {
      ...(logoUrl ? { logoUrl } : {}),
      tokens: {
        colors: {
          primary,
          ...(secondary ? { secondary } : {}),
          background,
          foreground,
        },
        typography: {
          ...(headingFont ? { headingFont } : {}),
          ...(bodyFont ? { bodyFont } : {}),
        },
        radius,
        style: detectStyle(root),
      },
    };
  } catch {
    return {
      tokens: {
        colors: { primary: "#2563eb", background: "#09090b", foreground: "#fafafa" },
        typography: {},
        radius: "0.5rem",
        style: "corporate",
      },
    };
  }
}

export function extractTailwindHint(raw: any): string | null {
  try {
    const root = asRecord(raw);
    const direct = firstNonEmptyString(
      typeof root.tailwind === "string" ? root.tailwind : undefined,
      typeof root.tailwindHint === "string" ? root.tailwindHint : undefined
    );
    if (direct) return direct;
    const nested = asRecord(root.tailwind);
    const fromNested = firstNonEmptyString(
      nested.config,
      nested.css,
      nested.hint,
      nested.snippet
    );
    if (fromNested) return fromNested;
    const hints = asRecord(root.hints);
    const fromHints = firstNonEmptyString(
      typeof hints.tailwind === "string" ? hints.tailwind : undefined,
      asRecord(hints.tailwind).config,
      asRecord(hints.tailwind).css
    );
    if (fromHints) return fromHints;
    const tokens = asRecord(root.tokens);
    const fromTokens = firstNonEmptyString(
      typeof tokens.tailwind === "string" ? tokens.tailwind : undefined
    );
    if (fromTokens) return fromTokens;
    return null;
  } catch {
    return null;
  }
}
