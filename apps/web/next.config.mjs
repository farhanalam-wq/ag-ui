/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ag-ui/contracts", "@ag-ui/shared", "@ag-ui/genui"],
  // Verified against installed Next 16.4.0, which still reads this
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
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
