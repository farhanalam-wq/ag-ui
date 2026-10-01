import { z } from "zod";

export const BrandTokensSchema = z.object({
  colors: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    background: z.string(),
    foreground: z.string(),
    muted: z.string().optional(),
    border: z.string().optional(),
    card: z.string().optional(),
    accent: z.string().optional(),
  }),
  typography: z.object({
    headingFont: z.string().optional(),
    bodyFont: z.string().optional(),
  }),
  radius: z.string(),
  style: z.enum(["corporate", "playful", "minimal", "technical"]),
  theme: z.enum(["light", "dark", "auto"]).optional(),
  cssVariables: z.record(z.string()).optional(),
  stylesheet: z.string().optional(),
});
export type BrandTokens = z.infer<typeof BrandTokensSchema>;

export const BrandSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  logoUrl: z.string().nullable().optional(),
  tokens: BrandTokensSchema,
  createdAt: z.date(),
});
export type Brand = z.infer<typeof BrandSchema>;
