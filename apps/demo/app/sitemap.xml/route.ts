import { articles } from "@/lib/content";
import { sitePageGroups } from "@/lib/site-map";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function GET() {
  const siteUrl = getSiteUrl();
  const paths = [
    ...sitePageGroups.flatMap((group) => group.pages.map((page) => page.href)),
    ...articles.map((article) => `/insights/${article.slug}`),
  ];
  const urls = paths
    .map((path) => `  <url><loc>${escapeXml(`${siteUrl}${path}`)}</loc></url>`)
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
