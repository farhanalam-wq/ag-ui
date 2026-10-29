import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { logger } from "@ag-ui/shared";
import { recordError } from "@ag-ui/database";
import { corsPlugin } from "./cors";
import { csrfPlugin } from "./csrf";
import { validateApiEnv } from "./env";
import { companiesRoutes } from "./routes/companies";
import { analyticsRoutes } from "./routes/analytics";
import { chatRoutes } from "./routes/chat";
import { crawlerRoutes } from "./routes/crawler";
import { brandRoutes } from "./routes/brand";
import { embedRoutes } from "./routes/embed";
import { voiceRoutes } from "./routes/voice";
import { voiceToolRoutes } from "./routes/voice-tool";
import { uploadsRoutes } from "./routes/uploads";
import { operationsRoutes } from "./routes/operations";
import { authRoutes } from "./routes/auth";
import { visitorsRoutes } from "./routes/visitors";
import { intelligenceRoutes } from "./routes/intelligence";
import { authPlugin } from "./auth/plugin";
import { sweepOrphanedCrawlJobs } from "@ag-ui/ingest";

const PORT = parseInt(process.env.PORT || "3001", 10);

// Fail fast in production; development/test keep local defaults.
validateApiEnv();

export const app = new Elysia()
  // CORS first so every later response (including 403/401) carries the right
  // allow-origin headers. CSRF runs before auth: an unsafe cookie-authenticated
  // request without a matching Origin never reaches session lookup.
  .use(corsPlugin)
  .use(csrfPlugin)
  // Operations error sink. Fire-and-forget and total by contract; returning
  // nothing keeps Elysia's normal status/response behaviour untouched.
  .onError(({ code, error, set, request }) => {
    const status = typeof set.status === "number" ? set.status : 500;
    // Expected 4xx (validation, auth, not-found) are part of the contract, not
    // failures. The sink is for unexpected 5xx (docs/auth-tenancy.md §9.4).
    // Elysia reports NOT_FOUND with a 200 `set.status`, so check the code too.
    if (
      (status >= 400 && status < 500) ||
      code === "NOT_FOUND" ||
      code === "VALIDATION" ||
      code === "PARSE"
    ) {
      return;
    }
    void recordError({
      level: status >= 500 ? "error" : "warn",
      source: "api",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: {
        code,
        method: request.method,
        path: new URL(request.url).pathname,
        status,
      },
    });
  })
  // Must run before every route so the manifest guards the whole surface.
  .use(authPlugin)
  .use(
    swagger({
      path: "/swagger",
      documentation: {
        info: {
          title: "ag-ui API",
          version: "0.0.1",
          description: "Company AI Modular Monolith Backend",
        },
      },
    })
  )
  .get("/health", () => ({
    status: "ok",
    service: "ag-ui-api",
    timestamp: new Date().toISOString(),
  }))
  .get("/", () => ({
    message: "ag-ui backend active",
    documentation: "/swagger",
  }))
  .use(authRoutes)
  .use(companiesRoutes)
  .use(analyticsRoutes)
  .use(chatRoutes)
  .use(crawlerRoutes)
  .use(brandRoutes)
  .use(embedRoutes)
  .use(voiceRoutes)
  .use(voiceToolRoutes)
  .use(uploadsRoutes)
  .use(operationsRoutes)
  .use(visitorsRoutes)
  .use(intelligenceRoutes);

// Tests import `app` to enumerate routes; only the real entrypoint listens.
if (process.env.NODE_ENV !== "test" && process.env.AG_UI_NO_LISTEN !== "1") {
  app.listen(PORT);
  logger.info(`ag-ui Elysia API running at http://localhost:${PORT}`);
  logger.info(`Swagger docs available at http://localhost:${PORT}/swagger`);
  // In-process pipelines die with the API process, so any live crawl job at
  // boot is a zombie holding the max_concurrent_jobs cap. Reap before traffic.
  void sweepOrphanedCrawlJobs();
}

export type App = typeof app;
// Reload trigger: 2026-09-14T18:20
