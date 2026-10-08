import { Elysia, t } from "elysia";
import {
  db,
  companies,
  companySnapshots,
  brands,
  documents,
  chunks,
  facts,
  conversations,
  messages,
  retrieveCompanyContext,
  createWidgetKeyRow,
  findActiveKeyByLabel,
  resolveWidgetKeyByHash,
  listKeysByCompany,
  revokeWidgetKey,
  checkEmbedRateLimit,
  resolveThemeStylesheetId,
  listDomainsByKey,
  getKeyCompanyId,
  addDomain,
  removeDomain,
  assertOriginAllowed,
  safeRefererForLog,
  DomainValidationError,
  eq,
  desc,
  and,
  isNull,
  inArray,
  count,
} from "@ag-ui/database";
import { generateWidgetKey, hashWidgetKey, logger, buildAnswerSystemPrompt, streamChatCompletionGenerator, mapBrandToWidgetTheme } from "@ag-ui/shared";

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

async function resolveActiveKey(rawKey: string) {
  let keyHash: string;
  try {
    keyHash = hashWidgetKey(rawKey);
  } catch {
    return { error: "not_found" as const };
  }
  const row = await resolveWidgetKeyByHash(keyHash);
  if (!row) return { error: "not_found" as const };
  if (row.revoked) return { error: "revoked" as const };
  return { row, keyHash };
}

async function getLatestSnapshot(companyId: string) {
  const [snap] = await db
    .select()
    .from(companySnapshots)
    .where(eq(companySnapshots.companyId, companyId))
    .orderBy(desc(companySnapshots.version))
    .limit(1);
  return snap ?? null;
}

export const embedRoutes = new Elysia({ prefix: "/api/embed" })
  // 1. Issue (or reuse) an opaque widget key for a company. Raw is returned once, only the hash is stored.
  .post(
    "/keys",
    async ({ body, set }) => {
      const label = body.label?.trim().slice(0, 64) || "default";

      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, body.companyId))
        .limit(1);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }

      const existing = await findActiveKeyByLabel(company.id, label);
      if (existing) {
        return {
          widgetKey: null,
          reused: true,
          id: existing.id,
          keyPrefix: existing.keyPrefix,
          companyId: company.id,
          label: existing.label,
        };
      }

      const generated = generateWidgetKey();
      const created = await createWidgetKeyRow({
        companyId: company.id,
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
        label,
      });

      logger.info(`[EMBED] Issued widget key ${generated.prefix}… for ${company.domain}`);
      set.status = 201;
      return {
        widgetKey: generated.raw,
        reused: false,
        id: created.id,
        keyPrefix: created.keyPrefix,
        companyId: company.id,
        label: created.label,
      };
    },
    {
      body: t.Object({
        companyId: t.String({ format: "uuid" }),
        label: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
      }),
      detail: {
        summary: "Issue widget key",
        description: "Issues (or reuses) an opaque hashed widget key for a company. Raw key is returned once.",
      },
    }
  )
  // 2. List issued keys (prefixes only — never hashes or raw keys).
  .get(
    "/keys",
    async ({ query, set }) => {
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, query.companyId))
        .limit(1);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      const keys = await listKeysByCompany(company.id);
      return { companyId: company.id, keys };
    },
    {
      query: t.Object({ companyId: t.String({ format: "uuid" }) }),
      detail: { summary: "List widget keys", description: "Lists key prefixes and revocation status for a company." },
    }
  )
  // 3. Revoke a key by row id. Revoked keys immediately 410 on config/chat.
  .post(
    "/keys/:keyId/revoke",
    async ({ params, set }) => {
      const revoked = await revokeWidgetKey(params.keyId);
      if (!revoked) {
        set.status = 404;
        return { error: "Widget key not found" };
      }
      return { revoked: true, id: revoked.id, keyPrefix: revoked.keyPrefix };
    },
    {
      params: t.Object({ keyId: t.String({ format: "uuid" }) }),
      detail: { summary: "Revoke widget key", description: "Revokes a widget key; public config/chat return 410 afterwards." },
    }
  )
  // 3b. List allowed origins for a key (prefixes never leave as raw).
  .get(
    "/keys/:keyId/domains",
    async ({ params, set }) => {
      const companyId = await getKeyCompanyId(params.keyId);
      if (!companyId) {
        set.status = 404;
        return { error: "Widget key not found" };
      }
      const domains = await listDomainsByKey(params.keyId);
      return { keyId: params.keyId, domains };
    },
    {
      params: t.Object({ keyId: t.String({ format: "uuid" }) }),
      detail: { summary: "List allowed origins", description: "Lists origin whitelist entries for a widget key." },
    }
  )
  // 3c. Add an allowed origin to a key. Origin normalized server-side.
  .post(
    "/keys/:keyId/domains",
    async ({ params, body, set, request }) => {
      const companyId = await getKeyCompanyId(params.keyId);
      if (!companyId) {
        set.status = 404;
        return { error: "Widget key not found" };
      }
      const actor = request.headers.get("x-actor")?.trim().slice(0, 64) || null;
      try {
        const domain = await addDomain({
          keyId: params.keyId,
          origin: body.origin,
          includePaths: body.includePaths,
          excludePaths: body.excludePaths,
          createdBy: actor,
          createdIp: getClientIp(request),
        });
        set.status = 201;
        return { domain };
      } catch (err: any) {
        if (err?.code === "DUPLICATE") {
          set.status = 409;
          return { error: "This origin is already allowlisted for this key", field: "origin" };
        }
        if (err?.code === "LIMIT_REACHED") {
          set.status = 422;
          return { error: err.message };
        }
        if (err instanceof DomainValidationError) {
          set.status = 400;
          return { error: err.message, field: err.field };
        }
        throw err;
      }
    },
    {
      params: t.Object({ keyId: t.String({ format: "uuid" }) }),
      body: t.Object({
        origin: t.String({ minLength: 1, maxLength: 253 }),
        includePaths: t.Optional(t.Array(t.String(), { maxItems: 50 })),
        excludePaths: t.Optional(t.Array(t.String(), { maxItems: 50 })),
      }),
      detail: { summary: "Add allowed origin", description: "Allowists an exact origin (scheme://host[:port]) for a widget key." },
    }
  )
  // 3d. Remove an allowed origin by row id (resolves key internally).
  .delete(
    "/domains/:id",
    async ({ params, set }) => {
      const removed = await removeDomain(params.id);
      if (!removed) {
        set.status = 404;
        return { error: "Allowed origin not found" };
      }
      return { removed: true, id: params.id };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: { summary: "Remove allowed origin", description: "Removes an origin whitelist entry." },
    }
  )
  // 4. Public widget config by opaque key (no company id in the URL).
  .get(
    "/:key/config",
    async ({ params, set, request }) => {
      const resolved = await resolveActiveKey(params.key);
      if (resolved.error === "not_found") {
        set.status = 404;
        return { error: "Widget key not found" };
      }
      if (resolved.error === "revoked") {
        set.status = 410;
        return { error: "Widget key revoked" };
      }

      // Per-key origin gate (zero rules = open). Never burns rate-limit budget.
      const gate = await assertOriginAllowed(resolved.row.id, request);
      if (set.headers) set.headers["vary"] = "Origin";
      if (!gate.allowed) {
        logger.warn(
          `[EMBED] Blocked config for key ${resolved.row.keyPrefix}… reason=${gate.reason} referer=${safeRefererForLog(request.headers.get("referer"))}`
        );
        set.status = 403;
        return { error: "This key is not allowed on this site", reason: gate.reason };
      }

      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, resolved.row.companyId))
        .limit(1);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }

      const snapshot = await getLatestSnapshot(company.id);
      const [brand] = await db
        .select()
        .from(brands)
        .where(eq(brands.companyId, company.id))
        .limit(1);

      // Server-sanitized theme + version, scoped to the ACTIVE snapshot so
      // theme follows knowledge rollbacks. Clients skip re-apply when
      // `themeVersion` is unchanged.
      const themeVersion = await resolveThemeStylesheetId(company.id, snapshot?.id ?? null);
      const theme = mapBrandToWidgetTheme(brand?.tokens, brand?.logoUrl);

      let docCount = 0;
      let chunkCount = 0;
      let factCount = 0;
      if (snapshot) {
        try {
          const [docRes] = await db
            .select({ count: count() })
            .from(documents)
            .where(
              and(
                eq(documents.snapshotId, snapshot.id),
                isNull(documents.deletedBatchId)
              )
            );
          docCount = docRes?.count ?? 0;
          const [factRes] = await db
            .select({ count: count() })
            .from(facts)
            .where(eq(facts.snapshotId, snapshot.id));
          factCount = factRes?.count ?? 0;
          const docRows = await db
            .select({ id: documents.id })
            .from(documents)
            .where(
              and(
                eq(documents.snapshotId, snapshot.id),
                isNull(documents.deletedBatchId)
              )
            );
          if (docRows.length > 0) {
            const [chunkRes] = await db
              .select({ count: count() })
              .from(chunks)
              .where(inArray(chunks.documentId, docRows.map((d) => d.id)));
            chunkCount = chunkRes?.count ?? 0;
          }
        } catch {
          // fall back to snapshot pageCount below
        }
      }

      return {
        name: company.name,
        domain: company.domain,
        url: company.url,
        status: snapshot?.status ?? "QUEUED",
        ready: snapshot?.status === "READY",
        version: snapshot?.version ?? 0,
        counts: { docs: docCount || snapshot?.pageCount || 0, chunks: chunkCount, facts: factCount },
        brand: brand ? { logoUrl: brand.logoUrl, tokens: brand.tokens } : null,
        theme,
        themeVersion,
      };
    },
    {
      params: t.Object({ key: t.String() }),
      detail: { summary: "Get widget config", description: "Resolves an opaque widget key to public company config and readiness." },
    }
  )
  // 5. Public anonymous chat by opaque key (READY-gated + rate-limited SSE).
  .post(
    "/:key/chat",
    async function* ({ params, body, set, request }) {
      set.headers["content-type"] = "text/event-stream";
      set.headers["cache-control"] = "no-cache";
      set.headers["connection"] = "keep-alive";
      set.headers["access-control-allow-origin"] = "*";

      const resolved = await resolveActiveKey(params.key);
      if (resolved.error === "not_found") {
        set.status = 404;
        yield { event: "error", data: { message: "Widget key not found" } };
        return;
      }
      if (resolved.error === "revoked" || !resolved.row || !resolved.keyHash) {
        set.status = 410;
        yield { event: "error", data: { message: "Widget key revoked" } };
        return;
      }

      // Per-key origin gate runs before snapshot + rate-limit work.
      const gate = await assertOriginAllowed(resolved.row.id, request);
      if (!gate.allowed) {
        logger.warn(
          `[EMBED] Blocked chat for key ${resolved.row.keyPrefix}… reason=${gate.reason} referer=${safeRefererForLog(request.headers.get("referer"))}`
        );
        set.status = 403;
        yield { event: "error", data: { message: "This key is not allowed on this site", reason: gate.reason } };
        return;
      }

      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, resolved.row.companyId))
        .limit(1);
      if (!company) {
        set.status = 404;
        yield { event: "error", data: { message: "Company not found" } };
        return;
      }

      const snapshot = await getLatestSnapshot(company.id);
      if (!snapshot || snapshot.status !== "READY") {
        set.status = 409;
        yield {
          event: "error",
          data: { message: "Company indexing — try again shortly", status: snapshot?.status ?? "QUEUED" },
        };
        return;
      }

      const ip = getClientIp(request);
      const limit = await checkEmbedRateLimit(resolved.keyHash, ip);
      if (!limit.allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(limit.retryAfterSec);
        yield {
          event: "error",
          data: { message: `Slow down — retry in ${limit.retryAfterSec}s`, retryAfterSec: limit.retryAfterSec },
        };
        return;
      }

      const userQuery = body.message;
      const conversationId = body.conversationId;

      try {
        yield {
          event: "status",
          data: { stage: "retrieving", message: "Performing hybrid search across knowledge base..." },
        };

        const retrieved = await retrieveCompanyContext(company.id, userQuery);
        if (retrieved.brand) yield { event: "brand", data: retrieved.brand };
        yield { event: "evidence", data: retrieved.evidence };

        let activeConvId = conversationId;
        if (!activeConvId) {
          const [newConv] = await db
            .insert(conversations)
            .values({ companyId: company.id, title: userQuery.slice(0, 50) })
            .returning();
          activeConvId = newConv.id;
        }

        await db.insert(messages).values({ conversationId: activeConvId, role: "user", content: userQuery });

        yield {
          event: "status",
          data: { stage: "synthesizing", message: "Synthesizing answer with company knowledge..." },
        };

        const systemPrompt = buildAnswerSystemPrompt({
          companyName: retrieved.company.name,
          companyDomain: retrieved.company.domain,
          compiledPromptContext: retrieved.compiledPromptContext,
        });

        const previousMessages = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, activeConvId))
          .orderBy(desc(messages.createdAt))
          .limit(6);
        const conversationHistory = previousMessages.reverse().map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        let finalFullText = "";
        for await (const event of streamChatCompletionGenerator([
          { role: "system", content: systemPrompt },
          ...conversationHistory,
        ])) {
          if (event.type === "delta") {
            finalFullText += event.text;
            yield { event: "delta", data: { text: event.text } };
          } else if (event.type === "done") {
            finalFullText = event.fullText;
          }
        }

        const [savedMsg] = await db
          .insert(messages)
          .values({ conversationId: activeConvId, role: "assistant", content: finalFullText, evidence: retrieved.evidence, visualSpec: null })
          .returning();

        yield {
          event: "done",
          data: { conversationId: activeConvId, messageId: savedMsg.id, evidenceCount: retrieved.evidence.length, hasVisual: false },
        };
      } catch (err: any) {
        logger.error(`[EMBED CHAT] Stream failed: ${err.message}`);
        yield { event: "error", data: { message: err.message } };
      }
    },
    {
      params: t.Object({ key: t.String() }),
      body: t.Object({
        message: t.String({ minLength: 1, maxLength: 2000 }),
        conversationId: t.Optional(t.String()),
      }),
      detail: { summary: "Stream widget chat (SSE)", description: "Anonymous rate-limited streaming chat resolved via opaque widget key." },
    }
  );
