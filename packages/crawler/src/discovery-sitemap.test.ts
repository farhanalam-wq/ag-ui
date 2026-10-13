import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import {
  buildManualDiscovery,
  fetchChildSitemaps,
  normalizeManualUrl,
  parseSitemapBuffer,
  parseSitemapBufferWithMeta,
  parseSitemapXml,
  SitemapParseError,
} from "./discovery";

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><priority>1.0</priority></url>
  <url><loc>https://example.com/pricing</loc><priority>0.8</priority></url>
  <url><loc>https://example.com/blog/hello</loc></url>
</urlset>`;

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-blog.xml</loc></sitemap>
</sitemapindex>`;

describe("parseSitemapXml", () => {
  test("parses urlset with priority passthrough", () => {
    const entries = parseSitemapXml(URLSET);
    expect(entries.length).toBe(3);
    expect(entries[0]).toEqual({ url: "https://example.com/", priority: 1 });
    expect(entries[1].priority).toBeCloseTo(0.8);
    expect(entries[2].priority).toBeUndefined();
  });

  test("parses sitemapindex child locs as entries", () => {
    const entries = parseSitemapXml(INDEX);
    expect(entries.length).toBe(2);
    expect(entries[0].url).toBe("https://example.com/sitemap-pages.xml");
  });

  test("returns empty array for non-sitemap xml (caller decides)", () => {
    expect(parseSitemapXml(`<root><a>hi</a></root>`)).toEqual([]);
  });
});

describe("parseSitemapBuffer", () => {
  test("parses plain .xml buffer", () => {
    const entries = parseSitemapBuffer(Buffer.from(URLSET, "utf8"), "sitemap.xml");
    expect(entries.length).toBe(3);
  });

  test("parses .xml.gz buffer", () => {
    const gz = gzipSync(Buffer.from(URLSET, "utf8"));
    const entries = parseSitemapBuffer(Buffer.from(gz), "sitemap.xml.gz");
    expect(entries.length).toBe(3);
    expect(entries[1].url).toBe("https://example.com/pricing");
  });

  test("rejects non-XML content", () => {
    expect(() =>
      parseSitemapBuffer(Buffer.from(JSON.stringify({ a: 1 }), "utf8"), "data.xml")
    ).toThrow(SitemapParseError);
  });

  test("rejects empty urlset", () => {
    expect(() =>
      parseSitemapBuffer(
        Buffer.from(`<urlset xmlns="http://x"></urlset>`, "utf8"),
        "empty.xml"
      )
    ).toThrow(SitemapParseError);
  });

  test("rejects oversize buffer", () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, "a");
    expect(() => parseSitemapBuffer(big, "big.xml")).toThrow(SitemapParseError);
  });

  test("reports index-ness via WithMeta", () => {
    expect(parseSitemapBufferWithMeta(Buffer.from(URLSET, "utf8"), "s.xml").isIndex).toBe(
      false
    );
    const meta = parseSitemapBufferWithMeta(Buffer.from(INDEX, "utf8"), "i.xml");
    expect(meta.isIndex).toBe(true);
    expect(meta.entries.length).toBe(2);
    const gzMeta = parseSitemapBufferWithMeta(
      Buffer.from(gzipSync(Buffer.from(INDEX, "utf8"))),
      "i.xml.gz"
    );
    expect(gzMeta.isIndex).toBe(true);
  });
});

describe("normalizeManualUrl", () => {
  const base = new URL("https://example.com");
  test("accepts same-host http(s)", () => {
    expect(normalizeManualUrl("https://example.com/pricing/", base)).toBe(
      "https://example.com/pricing"
    );
  });
  test("rejects cross-host and non-http", () => {
    expect(normalizeManualUrl("https://evil.com/x", base)).toBeNull();
    expect(normalizeManualUrl("ftp://example.com/x", base)).toBeNull();
    expect(normalizeManualUrl("   ", base)).toBeNull();
  });
});

describe("fetchChildSitemaps", () => {
  test("fetches one level of index children, skips failures", async () => {
    const realFetch = globalThis.fetch;
    const childXml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>`;
    (globalThis as any).fetch = async (url: string) => {
      if (String(url).endsWith("sitemap-a.xml")) {
        return { status: 200, text: async () => childXml };
      }
      return { status: 404, text: async () => "" };
    };
    try {
      const out = await fetchChildSitemaps(
        ["https://example.com/sitemap-a.xml", "https://example.com/missing.xml"],
        2000
      );
      expect(out.length).toBe(2);
      expect(out[0].url).toBe("https://example.com/a");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("buildManualDiscovery", () => {
  test("dedupes across sitemap + manual, counts cross-host", async () => {
    const base = new URL("https://example.com");
    const { pages, info, droppedCrossDomain } = await buildManualDiscovery(
      [
        { url: "https://example.com/pricing", priority: 0.8, source: "sitemap" },
        { url: "https://example.com/pricing/", source: "manual" },
        { url: "https://example.com/about", source: "manual" },
        { url: "https://evil.com/x", source: "manual" },
        { url: "not a url", source: "manual" },
      ],
      base,
      { maxUrls: 2000 }
    );
    expect(pages.length).toBe(2);
    expect(droppedCrossDomain).toBe(1);
    expect(info.bySource["sitemap"]).toBe(1);
    expect(info.bySource["manual"]).toBe(1);
    // sitemap entry wins dedupe (first-seen), pricing keeps sitemap source
    expect(pages.find((p) => p.url === "https://example.com/pricing")?.source).toBe(
      "sitemap"
    );
  });

  test("truncates to maxUrls keeping highest priority", async () => {
    const base = new URL("https://example.com");
    const entries = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/page-${i}`,
      source: "manual" as const,
    }));
    const { pages, info } = await buildManualDiscovery(entries, base, { maxUrls: 4 });
    expect(pages.length).toBe(4);
    expect(info.truncated).toBe(true);
  });

  test("root scores above deep pages", async () => {
    const base = new URL("https://example.com");
    const { pages } = await buildManualDiscovery(
      [
        { url: "https://example.com/a/b/c/d", source: "manual" },
        { url: "https://example.com/", source: "sitemap" },
      ],
      base
    );
    expect(pages[0].url).toBe("https://example.com/");
  });
});
