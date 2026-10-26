import { NextRequest, NextResponse } from "next/server";

/**
 * UX-level route guard for the authenticated dashboard (A8, docs
 * auth-tenancy.md §10.4). Cookie presence is advisory — the API remains the
 * enforcement point and answers 401 for any bad or expired session, which the
 * dashboard surfaces through the session store. The proxy just saves a flash
 * of app chrome on a cold navigation.
 *
 * Public: `/` (landing), `/login`, `/register`, and the `/embed/[key]` widget
 * iframe, which is key+origin gated on the API and never carries cookies.
 */

const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/embed"]);
const AUTH_ONLY_PATHS = new Set(["/login", "/register"]);

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) =>
      name === "ag_session" || name.endsWith("-ag_session")
    );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const authed = hasSessionCookie(request);

  if (AUTH_ONLY_PATHS.has(pathname)) {
    // Signed-in users do not linger on auth pages.
    if (authed) {
      const url = request.nextUrl.clone();
      url.pathname = "/overview";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/embed/")) {
    return NextResponse.next();
  }

  if (!authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next's own assets, the public widget script, the
    // optimized image pipeline, and metadata files.
    "/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|embed.js|crowd.webp|robots.txt|apple-icon|icon|api).*)",
  ],
};
