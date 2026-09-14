import { Elysia, t } from "elysia";
import {
  db,
  companies,
  conversations,
  messages,
  retrieveCompanyContext,
  eq,
  desc,
} from "@ag-ui/database";
import {
  streamChatCompletionGenerator,
  logger,
  buildOpenUISystemPrompt,
} from "@ag-ui/shared";
import type { VisualSpec } from "@ag-ui/contracts";

export const chatRoutes = new Elysia()
  // 1. Streaming Chat Endpoint (Native Elysia SSE Generator)
  .post(
    "/api/companies/:id/chat",
    async function* ({ params, body, set }) {
      set.headers["content-type"] = "text/event-stream";
      set.headers["cache-control"] = "no-cache";
      set.headers["connection"] = "keep-alive";
      set.headers["access-control-allow-origin"] = "*";

      const companyId = params.id;
      const { message: userQuery, conversationId } = body;

      // Verify company exists
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (!company) {
        set.status = 404;
        yield { event: "error", data: { message: "Company not found" } };
        return;
      }

      try {
        // Stage 1: Retrieval
        yield {
          event: "status",
          data: {
            stage: "retrieving",
            message: "Performing hybrid search across knowledge base...",
          },
        };

        const retrieved = await retrieveCompanyContext(companyId, userQuery);

        // Stream brand tokens so UI can theme itself immediately
        if (retrieved.brand) {
          yield { event: "brand", data: retrieved.brand };
        }

        // Stream evidence sources
        yield { event: "evidence", data: retrieved.evidence };

        // Provision or fetch conversation
        let activeConvId = conversationId;
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

        const openuiPrompt = buildOpenUISystemPrompt({
          companyName: retrieved.company.name,
          brandPrimary: (retrieved.company as any)?.brandColor || "#3b82f6",
        });

        const systemPrompt = `You are the official multimodal AI representative for ${retrieved.company.name} (${retrieved.company.domain}).
Your role is to deliver concise, authoritative, and brand-aligned responses grounded in company documentation.

GUIDELINES:
1. Ground your answers strictly in the provided company facts and documentation excerpts below. Do not guess or fabricate information.
2. Always provide a comprehensive and helpful textual response. Whenever the user asks about products, pricing, features, statistics, or metrics, ALWAYS accompany your written response with an interactive OpenUI visual component block enclosed in \`\`\`openui ... \`\`\`.
3. Follow the OpenUI Lang syntax and reference examples strictly.
4. Keep answers clear, technical, and executive-ready.
5. CRITICAL RULE: NEVER USE EMOJIS ANYWHERE IN YOUR RESPONSES. Strictly use plain text and clean markdown formatting.

${openuiPrompt}

${retrieved.compiledPromptContext}`;

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
        let finalVisualSpec: VisualSpec | undefined = undefined;

        logger.info(`[CHAT API] Invoking streamChatCompletionGenerator with ${conversationHistory.length} messages...`);

        // Stream completion via async generator
        for await (const event of streamChatCompletionGenerator([
          { role: "system", content: systemPrompt },
          ...conversationHistory,
        ])) {
          logger.info(`[CHAT API] Generator event: type=${event.type}`);
          if (event.type === "delta") {
            finalFullText += event.text;
            yield { event: "delta", data: { text: event.text } };
          } else if (event.type === "visual") {
            finalVisualSpec = event.spec;
            yield { event: "visual", data: event.spec };
          } else if (event.type === "done") {
            finalFullText = event.fullText;
            finalVisualSpec = event.visualSpec;
          }
        }

        // Check if fullText contains an OpenUI block to cache in visualSpec
        const openuiBlockMatch = /```openui\s*([\s\S]*?)\s*```/.exec(finalFullText);
        if (openuiBlockMatch && openuiBlockMatch[1]) {
          finalVisualSpec = {
            type: "custom" as any,
            props: { openui: openuiBlockMatch[1].trim() },
            openui: openuiBlockMatch[1].trim(),
          } as any;
        }

        // Persist assistant response in PostgreSQL
        const [savedMsg] = await db
          .insert(messages)
          .values({
            conversationId: activeConvId,
            role: "assistant",
            content: finalFullText,
            evidence: retrieved.evidence,
            visualSpec: finalVisualSpec || null,
          })
          .returning();

        // Stage 3: Done
        yield {
          event: "done",
          data: {
            conversationId: activeConvId,
            messageId: savedMsg.id,
            evidenceCount: retrieved.evidence.length,
            hasVisual: !!finalVisualSpec,
          },
        };
      } catch (err: any) {
        logger.error(`[CHAT API] Stream failed: ${err.message}`);
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
        description:
          "Performs hybrid retrieval, streams real-time tokens, and emits GenUI visual component specs.",
      },
    }
  )

  // 2. List Conversations for a Company
  .get(
    "/api/companies/:id/conversations",
    async ({ params }) => {
      const companyId = params.id;

      const convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.companyId, companyId))
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
    async ({ params, set }) => {
      const conversationId = params.id;

      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (!conv) {
        set.status = 404;
        return { error: "Conversation not found" };
      }

      const msgList = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);

      return {
        conversation: conv,
        messages: msgList,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Get conversation messages",
        description: "Returns message history and attached visual specs for a session.",
      },
    }
  );
