import { Elysia, t } from "elysia";
import {
  db,
  companies,
  companySnapshots,
  brands,
  documents,
  eq,
  desc,
} from "@ag-ui/database";
import { crawlQueue } from "@ag-ui/queues";
import { validateSafeUrl, SSRFError } from "@ag-ui/crawler";
import { logger } from "@ag-ui/shared";

export const companiesRoutes = new Elysia({ prefix: "/api/companies" })
  // 1. Submit a company URL for ingestion
  .post(
    "/",
    async ({ body, set }) => {
      const { url: rawUrl, maxPages } = body;

      // Ensure valid URL format
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          set.status = 400;
          return { error: "URL must use http or https protocol" };
        }
      } catch {
        set.status = 400;
        return { error: "Invalid URL string provided" };
      }

      // SSRF validation
      try {
        await validateSafeUrl(parsedUrl.toString());
      } catch (err: any) {
        set.status = 403;
        return {
          error: "SSRF check failed: Target IP/domain is not permitted",
          details: err.message,
        };
      }

      const domain = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
      const companyName = domain.split(".")[0].toUpperCase();

      // 1. Find or create company
      let [existingCompany] = await db
        .select()
        .from(companies)
        .where(eq(companies.domain, domain))
        .limit(1);

      let companyId: string;

      if (!existingCompany) {
        const [insertedCompany] = await db
          .insert(companies)
          .values({
            domain,
            name: companyName,
            url: parsedUrl.origin,
          })
          .returning();
        companyId = insertedCompany.id;
      } else {
        companyId = existingCompany.id;
      }

      // 2. Find latest snapshot version
      const [latestSnapshot] = await db
        .select()
        .from(companySnapshots)
        .where(eq(companySnapshots.companyId, companyId))
        .orderBy(desc(companySnapshots.version))
        .limit(1);

      const nextVersion = (latestSnapshot?.version || 0) + 1;

      // 3. Create snapshot record with QUEUED status
      const [newSnapshot] = await db
        .insert(companySnapshots)
        .values({
          companyId,
          version: nextVersion,
          status: "QUEUED",
          pageCount: 0,
        })
        .returning();

      // 4. Enqueue crawl job in BullMQ
      await crawlQueue.add("crawl", {
        companyId,
        snapshotId: newSnapshot.id,
        url: parsedUrl.origin,
        maxPages: maxPages || 10,
      });

      logger.info(`[API] Enqueued crawl job for ${domain} (snapshot: ${newSnapshot.id})`);

      set.status = 201;
      return {
        success: true,
        companyId,
        snapshotId: newSnapshot.id,
        domain,
        version: nextVersion,
        status: "QUEUED",
      };
    },
    {
      body: t.Object({
        url: t.String(),
        maxPages: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
      }),
      detail: {
        summary: "Ingest a new company URL",
        description: "Validates URL, provisions company & snapshot, and enqueues background crawl job.",
      },
    }
  )

  // 2. List all ingested companies
  .get(
    "/",
    async () => {
      const allCompanies = await db
        .select()
        .from(companies)
        .orderBy(desc(companies.createdAt));

      const results = await Promise.all(
        allCompanies.map(async (company) => {
          const [latestSnapshot] = await db
            .select()
            .from(companySnapshots)
            .where(eq(companySnapshots.companyId, company.id))
            .orderBy(desc(companySnapshots.version))
            .limit(1);

          const [brand] = await db
            .select()
            .from(brands)
            .where(eq(brands.companyId, company.id))
            .limit(1);

          return {
            id: company.id,
            domain: company.domain,
            name: company.name,
            url: company.url,
            createdAt: company.createdAt,
            latestSnapshot: latestSnapshot
              ? {
                  id: latestSnapshot.id,
                  version: latestSnapshot.version,
                  status: latestSnapshot.status,
                  pageCount: latestSnapshot.pageCount,
                }
              : null,
            brand: brand
              ? {
                  logoUrl: brand.logoUrl,
                  tokens: brand.tokens,
                }
              : null,
          };
        })
      );

      return { companies: results };
    },
    {
      detail: {
        summary: "List all companies",
        description: "Returns all registered companies with their latest snapshot status and brand tokens.",
      },
    }
  )

  // 3. Get single company status and brand tokens
  .get(
    "/:id",
    async ({ params, set }) => {
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, params.id))
        .limit(1);

      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }

      const snapshots = await db
        .select()
        .from(companySnapshots)
        .where(eq(companySnapshots.companyId, company.id))
        .orderBy(desc(companySnapshots.version));

      const [brand] = await db
        .select()
        .from(brands)
        .where(eq(brands.companyId, company.id))
        .limit(1);

      return {
        company,
        latestSnapshot: snapshots[0] || null,
        snapshots,
        brand: brand || null,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Get company by ID",
        description: "Returns company metadata, brand tokens, and snapshot history.",
      },
    }
  )

  // 4. Get documents for a company's latest snapshot
  .get(
    "/:id/documents",
    async ({ params, set }) => {
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, params.id))
        .limit(1);

      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }

      const [latestSnapshot] = await db
        .select()
        .from(companySnapshots)
        .where(eq(companySnapshots.companyId, company.id))
        .orderBy(desc(companySnapshots.version))
        .limit(1);

      if (!latestSnapshot) {
        return { documents: [] };
      }

      const docs = await db
        .select({
          id: documents.id,
          url: documents.url,
          title: documents.title,
          category: documents.category,
          contentLength: documents.content,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(eq(documents.snapshotId, latestSnapshot.id));

      return {
        companyId: company.id,
        snapshotId: latestSnapshot.id,
        snapshotStatus: latestSnapshot.status,
        documents: docs.map((d) => ({
          ...d,
          contentLength: d.contentLength.length,
          preview: d.contentLength.slice(0, 150).replace(/\n/g, " "),
        })),
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Get documents for company snapshot",
        description: "Returns all crawled documents and metadata for the latest snapshot.",
      },
    }
  );
