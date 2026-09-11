import { z } from "zod";

export const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("postgresql://postgres:password@localhost:5432/ag_ui"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;

export function validateEnv<T extends z.ZodTypeAny>(schema: T, env = process.env): z.infer<T> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.format());
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
