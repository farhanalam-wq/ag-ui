import { z } from "zod";

export const BrandTokensSchema = z.object({
  colors: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    background: z.string(),
    foreground: z.string(),
  }),
  typography: z.object({
    headingFont: z.string().optional(),
    bodyFont: z.string().optional(),
  }),
  radius: z.string(),
  style: z.enum(["corporate", "playful", "minimal", "technical"]),
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
