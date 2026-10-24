/**
 * API startup environment validation (docs/auth-tenancy.md §10.7).
 *
 * Development and test keep the local defaults in `auth/config.ts` and the
 * shared schemas. Production must fail fast instead of silently booting
 * against localhost or a missing OAuth client.
 */
import { z } from "zod";
import { validateEnv } from "@ag-ui/shared";

const ProductionEnvSchema = z
  .object({
    APP_URL: z.string().url(),
    DATABASE_URL: z.string().min(1),
    REDIS_HOST: z.string().min(1).optional(),
    REDIS_PORT: z.string().min(1).optional(),
    REDIS_URL: z.string().url().optional(),
    QDRANT_URL: z.string().url(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_REDIRECT_URI: z.string().url(),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(8760).default(168),
    VOICE_TOOL_SECRET: z.string().min(1),
    /** Only required when web and API are sibling subdomains. */
    COOKIE_DOMAIN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const hasRedis =
      Boolean(env.REDIS_URL) || Boolean(env.REDIS_HOST && env.REDIS_PORT);
    if (!hasRedis) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "REDIS_URL or REDIS_HOST + REDIS_PORT is required",
      });
    }
  });

export type ProductionEnv = z.infer<typeof ProductionEnvSchema>;

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production" || env.RUNTIME_ENV === "production";
}

/**
 * Validate only in production. Returns the parsed values in production and
 * `null` in development/test (where local defaults are intentional).
 */
export function validateApiEnv(
  env: NodeJS.ProcessEnv = process.env
): ProductionEnv | null {
  if (!isProduction(env)) return null;
  return validateEnv(ProductionEnvSchema, env);
}
