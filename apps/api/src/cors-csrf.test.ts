/**
 * CORS and CSRF contract tests (docs/auth-tenancy.md §10.3–§10.4).
 *
 * Pure decision functions first, then real preflight/unsafe requests through
 * the Elysia app. No database rows are touched: every integration request is
 * either a preflight or rejected before its handler.
 */
import { describe, expect, test } from "bun:test";
import { Elysia, status, t } from "elysia";
import { corsHeaders, corsPolicyFor, corsPlugin } from "./cors";
import { checkCsrf, csrfPlugin } from "./csrf";

const APP_URL = "http://localhost:3000";
const FOREIGN = "https://evil.example";

/**
 * Minimal app: the security plugins plus routes that stand in for the real
 * handlers. Keeping this app free of the database/queues means CORS/CSRF tests
 * do not create backend connections; `route-policy.test.ts` asserts the same
 * plugins are mounted on the real app.
 */
const testApp = new Elysia()
  .use(corsPlugin)
  .use(csrfPlugin)
  .get("/api/analytics/overview", () =>
    status(401, { error: "Authentication required" })
  )
  .post("/api/auth/login", () => ({ ok: true }), {
    body: t.Object({ email: t.String(), password: t.String() }),
  })
  .get("/api/embed/:key/config", () => ({ ok: true }))
  .post("/api/embed/:key/track", () => ({ ok: true }))
  .post("/api/voice/token", () => ({ ok: true }))
  .post("/api/voice/tool/query", () => ({ ok: true }));

function req(
  path: string,
  init: RequestInit = {}
): Request {
  return new Request(`http://localhost${path}`, init);
}

function unsafe(path: string, headers: Record<string, string> = {}): Request {
  return req(path, { method: "POST", headers });
}

describe("CORS policy", () => {
  test("dashboard only allows the exact APP_URL with credentials", () => {
    const own = corsPolicyFor("GET", "/api/companies", APP_URL, APP_URL);
    expect(own).toEqual({
      surface: "dashboard",
      allowOrigin: APP_URL,
      credentials: true,
    });

    const foreign = corsPolicyFor("GET", "/api/companies", FOREIGN, APP_URL);
    expect(foreign.allowOrigin).toBeNull();
    expect(foreign.credentials).toBe(false);
  });

  test("embed reflects the request origin without credentials", () => {
    const policy = corsPolicyFor(
      "POST",
      "/api/embed/abc/chat",
      "https://customer.example",
      APP_URL
    );
    expect(policy.surface).toBe("embed");
    expect(policy.allowOrigin).toBe("https://customer.example");
    expect(policy.credentials).toBe(false);

    const missing = corsPolicyFor("POST", "/api/embed/abc/chat", null, APP_URL);
    expect(missing.allowOrigin).toBeNull();
  });

  test("voice token is dashboard for APP_URL and embed otherwise", () => {
    const dashboard = corsPolicyFor(
      "POST",
      "/api/voice/token",
      APP_URL,
      APP_URL
    );
    expect(dashboard.surface).toBe("dashboard");
    expect(dashboard.credentials).toBe(true);

    const embed = corsPolicyFor(
      "POST",
      "/api/voice/token",
      "https://customer.example",
      APP_URL
    );
    expect(embed.surface).toBe("embed");
    expect(embed.allowOrigin).toBe("https://customer.example");
    expect(embed.credentials).toBe(false);
  });

  test("voice tool gets no CORS headers", () => {
    const policy = corsPolicyFor(
      "POST",
      "/api/voice/tool/query",
      APP_URL,
      APP_URL
    );
    expect(policy.surface).toBe("none");
    expect(corsHeaders(policy, unsafe("/api/voice/tool/query"))).toEqual({});
  });

  test("preflight headers never mix credentials into the embed surface", () => {
    const embed = corsHeaders(
      corsPolicyFor("OPTIONS", "/api/embed/abc/config", FOREIGN, APP_URL),
      req("/api/embed/abc/config", {
        method: "OPTIONS",
        headers: { origin: FOREIGN, "access-control-request-headers": "x-test" },
      })
    );
    expect(embed["Access-Control-Allow-Origin"]).toBe(FOREIGN);
    expect(embed["Access-Control-Allow-Credentials"]).toBeUndefined();
    expect(embed["Access-Control-Allow-Methods"]).toContain("POST");
    expect(embed["Access-Control-Allow-Headers"]).toBe("x-test");
  });
});

describe("CSRF decision", () => {
  test("unsafe dashboard requests require the APP_URL origin", () => {
    expect(checkCsrf(unsafe("/api/auth/login"), APP_URL)).toEqual({
      ok: false,
      reason: "origin",
    });
    expect(
      checkCsrf(unsafe("/api/auth/login", { origin: FOREIGN }), APP_URL)
    ).toEqual({ ok: false, reason: "origin" });
    expect(
      checkCsrf(unsafe("/api/auth/login", { origin: APP_URL }), APP_URL)
    ).toEqual({ ok: true });
  });

  test("Referer is an accepted fallback", () => {
    expect(
      checkCsrf(
        unsafe("/api/auth/login", { referer: `${APP_URL}/login` }),
        APP_URL
      )
    ).toEqual({ ok: true });
  });

  test("cross-site Sec-Fetch-Site is rejected even with a forged Origin", () => {
    expect(
      checkCsrf(
        unsafe("/api/auth/login", {
          origin: APP_URL,
          "sec-fetch-site": "cross-site",
        }),
        APP_URL
      )
    ).toEqual({ ok: false, reason: "fetch-site" });
  });

  test("safe methods and public embed/tool routes are exempt", () => {
    expect(checkCsrf(req("/api/auth/me"), APP_URL)).toEqual({ ok: true });
    expect(checkCsrf(unsafe("/api/embed/abc/track"), APP_URL)).toEqual({
      ok: true,
    });
    expect(checkCsrf(unsafe("/api/voice/tool/query"), APP_URL)).toEqual({
      ok: true,
    });
    expect(checkCsrf(unsafe("/api/voice/token"), APP_URL)).toEqual({
      ok: true,
    });
  });
});

describe("CORS integration", () => {
  test("dashboard preflight is answered once with credentials", async () => {
    const res = await testApp.handle(
      req("/api/analytics/overview", {
        method: "OPTIONS",
        headers: {
          origin: APP_URL,
          "access-control-request-method": "GET",
        },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP_URL);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("vary")).toContain("Origin");
  });

  test("foreign dashboard origin gets no allow-origin header", async () => {
    const res = await testApp.handle(
      req("/api/analytics/overview", {
        method: "OPTIONS",
        headers: { origin: FOREIGN, "access-control-request-method": "GET" },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("embed preflight reflects the customer origin without credentials", async () => {
    const res = await testApp.handle(
      req("/api/embed/abc/config", {
        method: "OPTIONS",
        headers: { origin: FOREIGN, "access-control-request-method": "GET" },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(FOREIGN);
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("voice tool preflight has no CORS headers", async () => {
    const res = await testApp.handle(
      req("/api/voice/tool/query", {
        method: "OPTIONS",
        headers: { origin: FOREIGN },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("vary")).toBeNull();
  });

  test("auth errors still carry the dashboard CORS headers", async () => {
    const res = await testApp.handle(
      req("/api/analytics/overview?companyId=11111111-1111-4111-8111-111111111111", {
        headers: { origin: APP_URL },
      })
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP_URL);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

describe("CSRF integration", () => {
  test("unsafe auth POST without an origin is 403", async () => {
    const res = await testApp.handle(
      req("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Invalid request origin" });
  });

  test("foreign origin is 403", async () => {
    const res = await testApp.handle(
      req("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: FOREIGN },
        body: "{}",
      })
    );

    expect(res.status).toBe(403);
  });

  test("matching origin reaches validation", async () => {
    const res = await testApp.handle(
      req("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_URL },
        body: "{}",
      })
    );

    expect(res.status).toBe(422);
  });

  test("matching Referer reaches validation", async () => {
    const res = await testApp.handle(
      req("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          referer: `${APP_URL}/login`,
        },
        body: "{}",
      })
    );

    expect(res.status).toBe(422);
  });

  test("cross-site Sec-Fetch-Site is 403 even with APP_URL Origin", async () => {
    const res = await testApp.handle(
      req("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: APP_URL,
          "sec-fetch-site": "cross-site",
        },
        body: "{}",
      })
    );

    expect(res.status).toBe(403);
  });
});
