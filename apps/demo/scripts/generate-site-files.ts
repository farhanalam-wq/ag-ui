import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { publicSitePaths } from "../lib/site-map";
import { getSiteUrl } from "../lib/site-url";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function generateSiteFiles() {
  const isDev = process.argv.includes("--dev");
  const siteUrl = getSiteUrl(isDev);
  if (new Set(publicSitePaths).size !== publicSitePaths.length) {
    throw new Error("Sitemap paths must be unique.");
  }

  const xmlUrls = publicSitePaths
    .map((route) => `  <url><loc>${escapeXml(`${siteUrl}${route}`)}</loc></url>`)
    .join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlUrls}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
  const publicDir = path.resolve(import.meta.dirname, "../public");

  await mkdir(publicDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(publicDir, "sitemap.xml"), sitemap, "utf8"),
    writeFile(path.join(publicDir, "robots.txt"), robots, "utf8"),
  ]);
}

generateSiteFiles().catch((error: unknown) => {
  console.error("Failed to generate sitemap.xml and robots.txt.", error);
  process.exitCode = 1;
});
