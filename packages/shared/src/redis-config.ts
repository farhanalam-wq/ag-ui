// ------------------------------------------------------- redis-config ---

/**
 * Build ioredis/BullMQ connection options from the environment. `REDIS_URL`
 * wins when set (supports `redis://`, auth, a path-selected DB number, and
 * TLS via `rediss://`), otherwise the legacy `REDIS_HOST`/`REDIS_PORT` pair,
 * otherwise 127.0.0.1:6379. Caller adds its own retry/policy knobs on top.
 *
 * Why not hand ioredis the URL string directly: BullMQ takes its connection
 * as an *options object* (it dups one client per worker/queue from it), so
 * every consumer — object or `new Redis(...)` — parses the same way here.
 */
export function redisConnectionOptions(): Record<string, unknown> {
  const url = process.env.REDIS_URL?.trim();

  if (!url || url === "redis://127.0.0.1:6379" || url === "redis://localhost:6379") {
    return {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Malformed URL: fall back to the legacy pair rather than crash startup.
    return {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    };
  }

  const opts: Record<string, unknown> = {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
  };

  // ioredis treats username "default" as the Redis 6 ACL default; only pass
  // a non-default username so ACL-authenticated servers still work.
  if (parsed.username && parsed.username !== "default") {
    opts.username = decodeURIComponent(parsed.username);
  }
  if (parsed.password) {
    opts.password = decodeURIComponent(parsed.password);
  }
  const db = parsed.pathname.replace(/^\//, "");
  if (db && /^\d+$/.test(db)) {
    opts.db = parseInt(db, 10);
  }
  if (parsed.protocol === "rediss:") {
    // TLS. Verification honours NODE_TLS settings (the worker already allows
    // self-signed certs for corporate proxies) while still encrypting.
    opts.tls = {};
  }
  return opts;
}
