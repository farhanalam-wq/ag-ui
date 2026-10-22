// Client-safe entry — pure browser code only (no node:fs, node:crypto, ioredis).
// Widget theme is sanitized CSS mapping; safe to bundle via transpilePackages.
// The analytics catalogue is pure data: the browser needs the same metric
// stories and caveat sentences the API uses.
export * from "./widget-theme";
export * from "./analytics-catalogue";
