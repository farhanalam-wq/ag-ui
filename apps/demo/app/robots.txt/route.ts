import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export function GET() {
  const siteUrl = getSiteUrl();

  return new Response(
    `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`,
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
