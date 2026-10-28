import { describe, expect, test } from "bun:test";
import {
  CRAWLER_PRODUCT_TOKEN,
  fetchRobotsTxt,
  isAllowed,
  parseRobots,
  selectGroup,
} from "./robots";

// The canonical example from RFC 9309 §2.1, plus our product-token group.
const SAMPLE = `
# one comment line the parser must ignore
User-agent: gptbot
Disallow: /private/

User-agent: ${CRAWLER_PRODUCT_TOKEN}
Disallow: /admin/
Disallow: /tmp/*.pdf$
Allow: /tmp/
Crawl-delay: 2

User-agent: *
Disallow:
`;

describe("parseRobots", () => {
  test("groups consecutive user-agent lines and attaches rules", () => {
    const rules = parseRobots(SAMPLE);
    const ours = selectGroup(rules);
    expect(ours).not.toBeNull();
    expect(ours!.agents).toEqual([CRAWLER_PRODUCT_TOKEN]);
    expect(ours!.rules).toHaveLength(3);
    expect(ours!.crawlDelaySec).toBe(2);
  });

  test("captures the named and star groups", () => {
    const rules = parseRobots(SAMPLE);
    const agents = rules.groups.map((g) => g.agents);
    expect(agents).toContainEqual(["gptbot"]);
    expect(agents).toContainEqual(["*"]);
  });

  test("empty Disallow directive yields no rule (allow everything)", () => {
    const rules = parseRobots(SAMPLE);
    const star = rules.groups.find((g) => g.agents.includes("*"))!;
    expect(star.rules).toHaveLength(0);
  });

  test("comments and blank lines are ignored; unknown directives skipped", () => {
    const rules = parseRobots(
      `User-agent: *\nSitemap: https://example.com/sitemap.xml # trailing comment\nDisallow: /x # inline comment\n`
    );
    // Sitemap lines are discovery's business — never a rule.
    expect(selectGroup(rules)!.rules.map((r) => r.path)).toEqual(["/x"]);
  });

  test("unparseable input never throws — empty rules, fail-open", () => {
    expect(() => parseRobots("\n\n:::\ngibberish without directives")).not.toThrow();
    const rules = parseRobots("no colons here at all");
    expect(rules.groups).toHaveLength(0);
  });

  test("malformed group interleaving still terminates rules at a new user-agent", () => {
    // A rule after a new UA block must not leak back into the earlier group.
    const rules = parseRobots(
      `User-agent: a\nDisallow: /a/\nUser-agent: b\nDisallow: /b/\n`
    );
    expect(rules.groups).toHaveLength(2);
    expect(rules.groups[0].rules.map((r) => r.path)).toEqual(["/a/"]);
    expect(rules.groups[1].rules.map((r) => r.path)).toEqual(["/b/"]);
  });
});

describe("selectGroup", () => {
  test("product-token group beats the star group", () => {
    const rules = parseRobots(
      `User-agent: *\nDisallow: /\nUser-agent: ${CRAWLER_PRODUCT_TOKEN}\nAllow: /\n`
    );
    expect(selectGroup(rules)!.agents).toEqual([CRAWLER_PRODUCT_TOKEN]);
  });

  test("falls back to the star group when no product group exists", () => {
    const rules = parseRobots(`User-agent: gptbot\nDisallow: /\nUser-agent: *\nDisallow: /x/\n`);
    expect(selectGroup(rules)!.agents).toEqual(["*"]);
  });

  test("no matching group → null (no rules apply)", () => {
    const rules = parseRobots(`User-agent: gptbot\nDisallow: /\n`);
    expect(selectGroup(rules)).toBeNull();
  });

  test("empty rules file → null", () => {
    expect(selectGroup(parseRobots(""))).toBeNull();
  });
});

describe("isAllowed", () => {
  const rules = () => parseRobots(SAMPLE);

  test("star group's empty Disallow allows everything", () => {
    const starOnly = parseRobots(`User-agent: *\nDisallow:\n`);
    expect(isAllowed(starOnly, "https://example.com/anything")).toBe(true);
  });

  test("product group's specific rules apply over star", () => {
    expect(isAllowed(rules(), "https://example.com/admin/login")).toBe(false);
    expect(isAllowed(rules(), "https://example.com/public/page")).toBe(true);
  });

  test("$-anchored Disallow beats the shorter Allow when strictly longer", () => {
    // SAMPLE has Disallow: /tmp/*.pdf$ (11 chars) vs Allow: /tmp/ (6 chars).
    expect(isAllowed(rules(), "https://example.com/tmp/x.pdf")).toBe(false);
    // $ anchors the end: *.pdf$ does not match .pdfx, and /tmp/ still allows.
    expect(isAllowed(rules(), "https://example.com/tmp/deep/x.pdfx")).toBe(true);
    expect(isAllowed(rules(), "https://example.com/tmp/other.html")).toBe(true);
  });

  test("literal prefix semantics: /a blocks /about", () => {
    const r = parseRobots(`User-agent: *\nDisallow: /a\n`);
    expect(isAllowed(r, "https://example.com/about")).toBe(false);
    expect(isAllowed(r, "https://example.com/a/x")).toBe(false);
    expect(isAllowed(r, "https://example.com/b/a")).toBe(true);
  });

  test("bare * wildcard matches everything", () => {
    const r = parseRobots(`User-agent: *\nDisallow: *\n`);
    expect(isAllowed(r, "https://example.com/anything/here?q=1")).toBe(false);
  });

  test("mid-path wildcards", () => {
    const r = parseRobots(`User-agent: *\nDisallow: /docs/*/draft\n`);
    expect(isAllowed(r, "https://example.com/docs/2024/draft")).toBe(false);
    expect(isAllowed(r, "https://example.com/docs/draft")).toBe(true);
  });

  test("query string participates in matching", () => {
    const r = parseRobots(`User-agent: *\nDisallow: /search?*\n`);
    expect(isAllowed(r, "https://example.com/search?q=x")).toBe(false);
    expect(isAllowed(r, "https://example.com/search")).toBe(true);
  });

  test("percent-encoded paths match their decoded forms", () => {
    const r = parseRobots(`User-agent: *\nDisallow: /my docs/\n`);
    expect(isAllowed(r, "https://example.com/my%20docs/page")).toBe(false);
  });

  test("null rules / non-URL targets fail-open to allowed", () => {
    expect(isAllowed(null, "https://example.com/x")).toBe(true);
    expect(isAllowed(parseRobots(`User-agent: *\nDisallow: /\n`), "::not a url::")).toBe(true);
  });

  test("no rules for the page → allowed even with rules present", () => {
    const r = parseRobots(`User-agent: gptbot\nDisallow: /\n`);
    expect(isAllowed(r, "https://example.com/anything")).toBe(true);
  });

  test("allow beats disallow on exact tie", () => {
    const r = parseRobots(`User-agent: *\nDisallow: /p\nAllow: /p\n`);
    expect(isAllowed(r, "https://example.com/p")).toBe(true);
  });
});

describe("fetchRobotsTxt", () => {
  test("network failure → unreachable:true, no rules, status 0 (fail-open)", async () => {
    // Loopback is SSRF-blocked, so this always fails before any I/O —
    // exercising the catch branch deterministically without network.
    const res = await fetchRobotsTxt(new URL("https://localhost:1/"));
    expect(res.rules).toBeNull();
    expect(res.sitemaps).toEqual([]);
    expect(res.unreachable).toBe(true);
    expect(res.status).toBe(0);
  });
});
