/**
 * Extracts the client IP for rate-limit bucketing.
 *
 * `X-Forwarded-For` is client-controlled, so it is only trusted when the
 * server is known to sit behind a proxy that appends to it
 * (`TRUSTED_PROXY=1`). Even then, only the RIGHTMOST entry is used — that is
 * the hop added by our own proxy; everything to its left can be spoofed.
 * Without a trusted proxy, untrusted headers are ignored entirely so the
 * limiter cannot be bypassed by rotating a header value.
 */
export function getClientIp(request: Request): string {
  if (process.env.TRUSTED_PROXY === "1") {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const hops = forwarded
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);
      const last = hops[hops.length - 1];
      if (last) return last;
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp && realIp.trim()) return realIp.trim();
  }
  return "unknown";
}
