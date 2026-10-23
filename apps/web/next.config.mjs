/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ag-ui/contracts", "@ag-ui/shared", "@ag-ui/genui"],
  // Verified against installed Next 16.4.2, which still reads this
  // from `experimental` (see node_modules/next/dist/build/webpack-config.js).
  // A top-level key would silently do nothing.
  experimental: {
    optimizePackageImports: [
      "@phosphor-icons/react",
      "lucide-react",
      "recharts",
      "streamdown",
      "@streamdown/cjk",
      "@streamdown/code",
      "sonner",
    ],
  },
  compiler: {
    removeConsole: { exclude: ["error", "warn"] },
  },
  /**
   * The old Analytics pages are one surface with tabs now. These redirects keep
   * links, bookmarks and the nav history of the previous release working for
   * one cycle; the destination is the nearest tab, not a 404.
   */
  async redirects() {
    return [
      { source: "/analytics", destination: "/analytics/website", permanent: false },
      {
        source: "/analytics/acquisition",
        destination: "/analytics/website?tab=acquisition",
        permanent: false,
      },
      {
        source: "/analytics/content",
        destination: "/analytics/website?tab=content",
        permanent: false,
      },
      // Engagement's numbers moved into the Overview KPI row.
      { source: "/analytics/engagement", destination: "/analytics/website", permanent: false },
      // Insights kept its anomalies, now on the Overview.
      { source: "/analytics/insights", destination: "/analytics/website", permanent: false },
      // The voice page never existed as its own route, but links did.
      {
        source: "/analytics/voice",
        destination: "/analytics/agent?tab=voice",
        permanent: false,
      },
      // Intent Radar lives in Intelligence; the Analytics placeholder is gone.
      {
        source: "/analytics/intent",
        destination: "/intelligence/intent-radar",
        permanent: false,
      },
    ];
  },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
