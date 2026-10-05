import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { autoLoadMonorepoEnv, logger } from "@ag-ui/shared";

// Ensure environment variables are loaded from monorepo root
autoLoadMonorepoEnv();

import { companiesRoutes } from "./routes/companies";
import { chatRoutes } from "./routes/chat";
import { crawlerRoutes } from "./routes/crawler";
import { embedRoutes } from "./routes/embed";
import { voiceRoutes } from "./routes/voice";
import { voiceToolRoutes } from "./routes/voice-tool";

const PORT = parseInt(process.env.PORT || "3001", 10);

export const app = new Elysia()
  .use(cors())
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
  .use(chatRoutes)
  .use(crawlerRoutes)
  .use(embedRoutes)
  .use(voiceRoutes)
  .use(voiceToolRoutes)
  .listen(PORT);

logger.info(`ag-ui Elysia API running at http://localhost:${PORT}`);
logger.info(`Swagger docs available at http://localhost:${PORT}/swagger`);
logger.info(`[API BOOT] OPENAI_API_KEY configured: ${!!process.env.OPENAI_API_KEY}`);

export type App = typeof app;
// Reload trigger: 2026-10-01T12:35
