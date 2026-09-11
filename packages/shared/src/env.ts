import { z } from "zod";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// Automatically load parent root .env if running from subpackage directory
function autoLoadMonorepoEnv() {
  let currentDir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const envPath = resolve(currentDir, ".env");
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, "utf-8");
        content.split("\n").forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            // Strip wrapping quotes if any
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (process.env[key] === undefined || process.env[key] === "") {
              process.env[key] = val;
            }
          }
        });
      } catch {}
      break;
    }
    currentDir = resolve(currentDir, "..");
  }
}

autoLoadMonorepoEnv();

export const BaseEnvSchema = z.object({
  RUNTIME_ENV: z.enum(["development", "test", "production"]).default("development"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("postgresql://postgres:password@localhost:5432/ag_ui"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;

export function validateEnv<T extends z.ZodTypeAny>(schema: T, env = process.env): z.infer<T> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    console.error("[ERROR] Invalid environment variables:", parsed.error.format());
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
