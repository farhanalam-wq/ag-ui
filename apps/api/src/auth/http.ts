/** Small request helpers shared by the auth routes. */

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/** 302 with one or more Set-Cookie headers. */
export function redirectResponse(location: string, cookies: string[] = []): Response {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  headers.set("location", location);
  return new Response(null, { status: 302, headers });
}
