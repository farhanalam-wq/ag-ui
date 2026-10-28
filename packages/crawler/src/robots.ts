/**
 * packages/crawler/src/robots.ts
 *
 * Robots.txt parsing and permission checks for the opt-in compliance
 * feature (TASKS.md #23). The default is no-robots: nothing here runs
 * unless the caller passes `useRobots: true`. When enabled, the rules
 * follow RFC 9309's semantics, deliberately simplified where the RFC
 * allows latitude:
 *
 *   - **Group selection.** The most-specific matching `User-agent` group
 *     wins: a group naming our product token (`ag-ui-crawler`) beats the
 *     `*` group; otherwise `*` applies. Only one group ever applies.
 *   - **Rule matching.** Patterns match the URL's path plus query, with
 *     `*` as a wildcard and a trailing `$` as an anchor. Among the rules
 *     that match, the longest pattern wins; a tie goes to Allow. Patterns
 *     and targets are compared percent-decoded so `/%20/` and `/ /` agree.
 *   - **Empty directives.** `Disallow:` with no value allows everything —
 *     per spec, not a bug.
 *   - **Fail-open.** A missing, malformed, or unreachable robots.txt means
 *     "no rules", never "crawl nothing". Unreachability is the caller's
 *     flag to show, not a silent swallow.
 *
 * The parser is pure; only `fetchRobotsTxt` does I/O, and its outcome
 * table (2xx → rules, 4xx → no rules, 5xx/net → unreachable) lives there.
 */

import { logger } from "@ag-ui/shared";
import { validateSafeUrl } from "./ssrf";

/** The product token our crawler identifies with in User-agent matching. */
export const CRAWLER_PRODUCT_TOKEN = "ag-ui-crawler";

export interface RobotsRule {
  /** True for an `Allow:` directive, false for `Disallow:`. */
  allow: boolean;
  /** The raw path pattern, `*` wildcard and trailing `$` anchor included. */
  path: string;
}

export interface RobotsGroup {
  /** User-agent product tokens this group names, lowercased. */
  agents: string[];
  rules: RobotsRule[];
  /** `Crawl-delay:` in seconds when the group declares one; surfaced, never enforced. */
  crawlDelaySec: number | null;
}

export interface RobotsRules {
  groups: RobotsGroup[];
}

/** Robust decode: a malformed escape keeps the raw text instead of throwing. */
function tryDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Compile one robots pattern into a matcher regex. Robots patterns match
 * as a *prefix* of the target (with wildcards): `Disallow: /a` blocks
 * `/about` too. `*` becomes `.*`; a trailing `$` anchors the end.
 * Everything else — including regex metacharacters in real paths — is
 * literal.
 */
function compilePattern(pattern: string): RegExp {
  let work = pattern;
  let anchored = false;
  if (work.endsWith("$")) {
    anchored = true;
    work = work.slice(0, -1);
  }
  const body = work
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/**
 * Parse robots.txt text. Never throws: unparseable input yields an empty
 * rules object (fail-open). Handles the classic layout — consecutive
 * `User-agent:` lines opening a group, `Disallow:`/`Allow:`/`Crawl-delay:`
 * rules following it — and ignores comments, blank lines, and unknown
 * directives (`Sitemap:` lines are discovery's business, not the gate's).
 */
export function parseRobots(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const directive = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (directive === "user-agent") {
      const token = value.toLowerCase();
      // Consecutive user-agent lines extend the current group only when
      // no rule has been seen since it opened (RFC 9309 grouping).
      if (current && current.rules.length === 0 && !current.agents.includes(token)) {
        current.agents.push(token);
      } else {
        current = { agents: [token], rules: [], crawlDelaySec: null };
        groups.push(current);
      }
      continue;
    }

    if (!current) continue;

    if (directive === "disallow" || directive === "allow") {
      // An empty value means "no restriction" — treat as absent.
      if (value === "") continue;
      current.rules.push({ allow: directive === "allow", path: tryDecode(value) });
    } else if (directive === "crawl-delay") {
      const secs = Number.parseFloat(value);
      if (Number.isFinite(secs) && secs >= 0) current.crawlDelaySec = secs;
    }
    // Unknown directives (Sitemap, etc.) are intentionally ignored here.
  }

  return { groups };
}

/**
 * The group that governs this crawler: a group explicitly naming our
 * product token wins; otherwise the `*` group; otherwise no rules.
 */
export function selectGroup(rules: RobotsRules): RobotsGroup | null {
  let star: RobotsGroup | null = null;
  for (const group of rules.groups) {
    if (group.agents.includes(CRAWLER_PRODUCT_TOKEN)) return group;
    if (group.agents.includes("*")) star = group;
  }
  return star;
}

/**
 * The permission decision for one URL: true unless the governing group's
 * longest matching rule is a Disallow. No group, no rules, no match —
 * all allowed.
 */
export function isAllowed(rules: RobotsRules | null, urlStr: string): boolean {
  if (!rules) return true;
  const group = selectGroup(rules);
  if (!group || group.rules.length === 0) return true;

  let target: string;
  try {
    const url = new URL(urlStr);
    target = tryDecode(`${url.pathname}${url.search}`);
  } catch {
    // Not a parseable URL: nothing in it could match a rule, so nothing
    // disallows it.
    return true;
  }

  let best: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!compilePattern(rule.path).test(target)) continue;
    // Longest pattern wins; a tie goes to Allow (checked first).
    if (
      best === null ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow)
    ) {
      best = rule;
    }
  }

  return best === null || best.allow;
}

export interface RobotsFetchResult {
  /** Parsed rules; null when there are none to apply (4xx/absent/malformed). */
  rules: RobotsRules | null;
  /** `Sitemap:` lines declared in the file (robots-declared sitemaps). */
  sitemaps: string[];
  /** True on 5xx or network failure — the caller's flag to surface. */
  unreachable: boolean;
  status: number;
}

/**
 * Fetch `/robots.txt` once and return both halves: the permission rules
 * and the declared sitemaps. Outcome table (deliberate, documented):
 *
 *   - `2xx`         → rules parsed (possibly empty), sitemaps extracted
 *   - `4xx` / empty  → no rules (standard crawler reading of "no robots")
 *   - `5xx` / net    → `unreachable: true`, no rules — proceed no-robots
 *
 * SSRF-checked like every discovery fetch; 5s timeout.
 */
export async function fetchRobotsTxt(baseUrl: URL): Promise<RobotsFetchResult> {
  const robotsUrl = new URL("/robots.txt", baseUrl);
  try {
    await validateSafeUrl(robotsUrl.toString());
    const res = await fetch(robotsUrl.toString(), {
      headers: { "User-Agent": "ag-ui-crawler/1.0" },
      // @ts-ignore - Bun native fetch TLS configuration
      tls: { rejectUnauthorized: false },
      signal: AbortSignal.timeout(5000),
    });
    const status = res.status;
    if (status >= 200 && status < 300) {
      const text = await res.text();
      const sitemaps: string[] = [];
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^sitemap:\s*(https?:\/\/[^\s#]+)/i);
        if (match?.[1]) sitemaps.push(match[1].trim());
      }
      return { rules: parseRobots(text), sitemaps, unreachable: false, status };
    }
    // 4xx and everything else non-2xx: no rules to apply. A 5xx is not
    // "unreachable" in the network sense, but a server that errors on its
    // own robots.txt cannot be trusted with the RFC's fail-closed reading
    // either — same product decision: proceed no-robots.
    return { rules: null, sitemaps: [], unreachable: status >= 500, status };
  } catch (err: any) {
    logger.debug(`[ROBOTS] fetch failed: ${err?.message ?? err}`);
    return { rules: null, sitemaps: [], unreachable: true, status: 0 };
  }
}
