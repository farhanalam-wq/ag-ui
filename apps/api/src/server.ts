import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { logger } from "@ag-ui/shared";

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
  .listen(PORT);

logger.info(`🚀 ag-ui Elysia API running at http://localhost:${PORT}`);
logger.info(`📚 Swagger docs available at http://localhost:${PORT}/swagger`);

export type App = typeof app;
