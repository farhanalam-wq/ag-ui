import { z } from "zod";

export const CrawlJobPayloadSchema = z.object({
  companyId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  url: z.string().url(),
  maxPages: z.number().default(50),
  maxDepth: z.number().default(3),
});
export type CrawlJobPayload = z.infer<typeof CrawlJobPayloadSchema>;

export const CrawledPageSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  html: z.string(),
  cleanText: z.string(),
  status: z.number(),
});
export type CrawledPage = z.infer<typeof CrawledPageSchema>;
