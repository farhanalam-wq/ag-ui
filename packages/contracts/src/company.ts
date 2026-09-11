import { z } from "zod";

export const CompanyStatusSchema = z.enum([
  "QUEUED",
  "CRAWLING",
  "PROCESSING",
  "READY",
  "FAILED",
]);
export type CompanyStatus = z.infer<typeof CompanyStatusSchema>;

export const CompanySchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  name: z.string(),
  url: z.string().url(),
  createdAt: z.date(),
});
export type Company = z.infer<typeof CompanySchema>;

export const CreateCompanyInputSchema = z.object({
  url: z.string().url(),
});
export type CreateCompanyInput = z.infer<typeof CreateCompanyInputSchema>;
