// Client-safe entry — pure browser code only (no node:fs, node:crypto, ioredis).
// Widget theme is sanitized CSS mapping; safe to bundle via transpilePackages.
export * from "./widget-theme";
