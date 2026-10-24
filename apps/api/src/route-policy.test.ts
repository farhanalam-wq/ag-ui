/**
 * Route coverage backstop.
 *
 * The auth plugin fails closed at runtime if a route has no manifest entry,
 * but this test is the earlier signal: it fails in CI the moment a route is
 * added, renamed, or removed without updating apps/api/src/route-policy.ts.
 *
 * See docs/auth-tenancy.md §5.4 and §14.1.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { client } from "@ag-ui/database";
import {
  analyticsQueue,
  brandQueue,
  crawlQueue,
  embeddingQueue,
  enrichQueue,
  processingQueue,
} from "@ag-ui/queues";
import { app } from "./server";
import { authConfig } from "./auth/config";
import {
  ROUTE_POLICIES,
  findRouteRule,
  normalizeRoutePath,
  routeKey,
} from "./route-policy";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function liveRoutes() {
  return app.routes
    .filter((route) => METHODS.has(route.method))
    .map((route) => ({ method: route.method, path: route.path }))
    .sort((a, b) => routeKey(a.method, a.path).localeCompare(routeKey(b.method, b.path)));
}

const live = liveRoutes();

afterAll(async () => {
  // Importing the app wires the real queues and db client. Close them so the
  // test process exits without waiting on Redis/Postgres handles.
  await Promise.allSettled([
    crawlQueue.close(),
    processingQueue.close(),
    embeddingQueue.close(),
    enrichQueue.close(),
    brandQueue.close(),
    analyticsQueue.close(),
  ]);
  await client.end().catch(() => undefined);
});

describe("route policy manifest", () => {
  test("declares every live route exactly once", () => {
    const declared = ROUTE_POLICIES.map((rule) => routeKey(rule.method, rule.path)).sort();
    const actual = live.map((route) => routeKey(route.method, route.path));

    expect(declared).toEqual(actual);
  });

  test("resolves every live route to its own manifest entry", () => {
    for (const route of live) {
      const rule = findRouteRule(route.method, route.path);
      expect(rule).not.toBeNull();
      expect(normalizeRoutePath(rule!.path)).toBe(normalizeRoutePath(route.path));
    }
  });

  test("matches concrete request paths, not just patterns", () => {
    expect(findRouteRule("GET", "/api/companies/abc/chunks")?.path).toBe(
      "/api/companies/:id/chunks"
    );
    expect(findRouteRule("GET", "/api/companies/abc/uploads")?.path).toBe(
      "/api/companies/:id/uploads/"
    );
    expect(findRouteRule("GET", "/api/embed/abc/config")?.path).toBe(
      "/api/embed/:key/config"
    );
    expect(findRouteRule("GET", "/api/embed/keys/abc/domains")?.path).toBe(
      "/api/embed/keys/:keyId/domains"
    );
    expect(findRouteRule("GET", "/api/analytics/overview")?.path).toBe(
      "/api/analytics/overview"
    );
  });

  test("every path company policy has a company id parameter", () => {
    for (const rule of ROUTE_POLICIES) {
      if (rule.policy.kind !== "company" || rule.policy.id !== "path") continue;
      expect(rule.path).toMatch(/:(id|companyId)(\/|$)/);
    }
  });

  test("has exactly one dual-policy voice route", () => {
    const dual = ROUTE_POLICIES.filter((rule) => rule.policy.kind === "voice-token");
    expect(dual).toHaveLength(1);
    expect(dual[0]).toMatchObject({
      method: "POST",
      path: "/api/voice/token",
    });
  });

  test("unknown routes fail closed", () => {
    expect(findRouteRule("GET", "/api/not-a-route")).toBeNull();
    expect(findRouteRule("DELETE", "/api/health")).toBeNull();
  });
});

describe("global enforcement", () => {
  test("public routes stay public", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
  });

  test("company routes reject anonymous requests", async () => {
    const res = await app.handle(
      new Request(
        "http://localhost/api/companies/11111111-1111-4111-8111-111111111111/chunks"
      )
    );
    expect(res.status).toBe(401);
  });

  test("authenticated routes reject anonymous requests", async () => {
    const res = await app.handle(new Request("http://localhost/api/auth/me"));
    expect(res.status).toBe(401);
  });

  test("voice token rejects neither credential with 422", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/voice/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    );
    expect(res.status).toBe(422);
  });

  test("unknown paths are 404, not a policy 500", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/not-a-route")
    );
    expect(res.status).toBe(404);
  });
});

describe("security plugins are mounted on the real app", () => {
  test("CORS preflight is answered before the auth policy", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/analytics/overview", {
        method: "OPTIONS",
        headers: {
          origin: authConfig.appUrl,
          "access-control-request-method": "GET",
        },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      authConfig.appUrl
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("unsafe auth POST without an Origin is rejected by CSRF", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Invalid request origin" });
  });

  test("unsafe auth POST with APP_URL Origin reaches validation", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: authConfig.appUrl,
        },
        body: "{}",
      })
    );

    expect(res.status).toBe(422);
  });
});
