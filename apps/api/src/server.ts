import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { logger } from "@ag-ui/shared";
import { recordError } from "@ag-ui/database";
import { companiesRoutes } from "./routes/companies";
import { analyticsRoutes } from "./routes/analytics";
import { chatRoutes } from "./routes/chat";
import { crawlerRoutes } from "./routes/crawler";
import { brandRoutes } from "./routes/brand";
import { embedRoutes } from "./routes/embed";
import { voiceRoutes } from "./routes/voice";
import { voiceToolRoutes } from "./routes/voice-tool";
import { uploadsRoutes } from "./routes/uploads";

const PORT = parseInt(process.env.PORT || "3001", 10);

export const app = new Elysia()
  .use(cors())
  // Operations error sink. Fire-and-forget and total by contract; returning
  // nothing keeps Elysia's normal status/response behaviour untouched.
  .onError(({ code, error, set, request }) => {
    const status = typeof set.status === "number" ? set.status : 500;
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
  .use(companiesRoutes)
  .use(analyticsRoutes)
  .use(chatRoutes)
  .use(crawlerRoutes)
  .use(brandRoutes)
  .use(embedRoutes)
  .use(voiceRoutes)
  .use(voiceToolRoutes)
  .use(uploadsRoutes)
  .listen(PORT);

logger.info(`ag-ui Elysia API running at http://localhost:${PORT}`);
logger.info(`Swagger docs available at http://localhost:${PORT}/swagger`);

export type App = typeof app;
// Reload trigger: 2026-09-14T18:20
