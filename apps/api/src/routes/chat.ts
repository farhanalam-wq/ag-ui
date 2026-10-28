import { Elysia, t } from "elysia";
import {
  db,
  conversations,
  messages,
  retrieveCompanyContext,
  resolveOwnedConversation,
  eq,
  desc,
  recordError,
} from "@ag-ui/database";
import { streamChatCompletionGenerator, buildAnswerSystemPrompt, logger, buildMessageMeta } from "@ag-ui/shared";
import { chatEnrichQueue, type ConversationEnrichJobData } from "@ag-ui/queues";
import { requireCompany, requireUser } from "../auth/plugin";

export const chatRoutes = new Elysia()
  // 1. Streaming Chat Endpoint (Native Elysia SSE Generator)
  .post(
    "/api/companies/:id/chat",
    async function* (ctx) {
      const { body, set } = ctx;
      set.headers["content-type"] = "text/event-stream";
      set.headers["cache-control"] = "no-cache";
      set.headers["connection"] = "keep-alive";
      set.headers["access-control-allow-origin"] = "*";

      const user = requireUser(ctx);
      const company = await requireCompany(ctx);
      const companyId = company.id;
      const { message: userQuery, conversationId } = body;

      // T2: a supplied conversation id must belong to the company the guard
      // just resolved. Foreign and nonexistent ids are indistinguishable.
      if (conversationId) {
        const owned = await resolveOwnedConversation(user.id, conversationId);
        if (!owned || owned.conversation.companyId !== companyId) {
          set.status = 404;
          yield { event: "error", data: { message: "Conversation not found" } };
          return;
        }
      }

      let activeConvId = conversationId;
      try {
        // Stage 1: Retrieval
        yield {
          event: "status",
          data: {
            stage: "retrieving",
            message: "Performing hybrid search across knowledge base...",
          },
        };

        const t0 = Date.now();
        const retrieved = await retrieveCompanyContext(companyId, userQuery);

        // Stream brand tokens so UI can theme itself immediately
        if (retrieved.brand) {
          yield { event: "brand", data: retrieved.brand };
        }

        // Stream evidence sources
        yield { event: "evidence", data: retrieved.evidence };

        // Provision or fetch conversation
        if (!activeConvId) {
          const [newConv] = await db
            .insert(conversations)
            .values({
              companyId,
              title: userQuery.slice(0, 50),
            })
            .returning();
          activeConvId = newConv.id;
        }

        // Save user query to DB
        await db.insert(messages).values({
          conversationId: activeConvId,
          role: "user",
          content: userQuery,
        });

        // Stage 2: Synthesis
        yield {
          event: "status",
          data: {
            stage: "synthesizing",
            message: "Synthesizing answer with company knowledge...",
          },
        };

        const systemPrompt = buildAnswerSystemPrompt({
          companyName: retrieved.company.name,
          companyDomain: retrieved.company.domain,
          compiledPromptContext: retrieved.compiledPromptContext,
        });

        // Fetch recent conversation history for multi-turn context
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

        logger.info(`[CHAT API] Invoking streamChatCompletionGenerator with ${conversationHistory.length} messages...`);

        // Stream text-only completion via async generator
        for await (const event of streamChatCompletionGenerator([
          { role: "system", content: systemPrompt },
          ...conversationHistory,
        ])) {
          logger.info(`[CHAT API] Generator event: type=${event.type}`);
          if (event.type === "delta") {
            finalFullText += event.text;
            yield { event: "delta", data: { text: event.text } };
          } else if (event.type === "done") {
            finalFullText = event.fullText;
          }
        }

        // Persist assistant response in PostgreSQL (text-only, no visual spec)
        const [savedMsg] = await db
          .insert(messages)
          .values({
            conversationId: activeConvId,
            role: "assistant",
            content: finalFullText,
            evidence: retrieved.evidence,
            meta: buildMessageMeta({
              evidence: retrieved.evidence,
              latencyMs: Date.now() - t0,
            }),
            visualSpec: null,
          })
          .returning();

        // Fire-and-forget derived pass. Studio chats never have a widget key.
        try {
          await chatEnrichQueue.add("chat-enrich", {
            companyId,
            conversationId: activeConvId,
            widgetKeyId: null,
            engine: "text",
          } satisfies ConversationEnrichJobData);
        } catch (enrichErr: any) {
          logger.error(`[CHAT API] enrich enqueue failed: ${enrichErr?.message ?? enrichErr}`);
        }

        // Stage 3: Done
        yield {
          event: "done",
          data: {
            conversationId: activeConvId,
            messageId: savedMsg.id,
            evidenceCount: retrieved.evidence.length,
            hasVisual: false,
          },
        };
      } catch (err: any) {
        logger.error(`[CHAT API] Stream failed: ${err.message}`);
        void recordError({
          source: "chat",
          message: err?.message ?? String(err),
          stack: err?.stack,
          // Runtime rule: ids + stage only — never the visitor's message,
          // prompt, transcript, or retrieval excerpt.
          context: {
            conversationId: activeConvId ?? null,
            companyId,
            stage: "chat-stream",
          },
          companyId,
        });
        yield { event: "error", data: { message: err.message } };
      }
    },
    {
      body: t.Object({
        message: t.String({ minLength: 1 }),
        conversationId: t.Optional(t.String()),
      }),
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Stream Brand-Adaptive Chat Response (SSE)",
        description: "Performs hybrid retrieval and streams real-time text-only tokens.",
      },
    }
  )

  // 2. List Conversations for a Company
  .get(
    "/api/companies/:id/conversations",
    async (ctx) => {
      const company = await requireCompany(ctx);

      const convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.companyId, company.id))
        .orderBy(desc(conversations.createdAt));

      return { conversations: convs };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "List conversations for company",
        description: "Returns all saved chat sessions for the company.",
      },
    }
  )

  // 3. Get Messages in a Conversation
  .get(
    "/api/conversations/:id/messages",
    async (ctx) => {
      const { params, set } = ctx;
      const user = requireUser(ctx);

      // Derived policy: conversation -> company -> owner.
      const owned = await resolveOwnedConversation(user.id, params.id);
      if (!owned) {
        set.status = 404;
        return { error: "Conversation not found" };
      }

      const msgList = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, owned.conversation.id))
        .orderBy(messages.createdAt);

      return {
        conversation: owned.conversation,
        messages: msgList,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Get conversation messages",
        description: "Returns message history for a session.",
      },
    }
  );
