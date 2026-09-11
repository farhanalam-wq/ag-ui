import { logger } from "./logger";
import type { VisualSpec } from "@ag-ui/contracts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChatOptions {
  model?: string;
  temperature?: number;
  apiKey?: string;
  onDelta?: (delta: string) => void;
  onVisualSpec?: (visualSpec: VisualSpec) => void;
}

export interface StreamChatResult {
  fullText: string;
  visualSpec?: VisualSpec;
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "visual"; spec: VisualSpec }
  | { type: "done"; fullText: string; visualSpec?: VisualSpec };

const VISUAL_TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "render_visual_component",
    description:
      "Renders a rich Brand-Adaptive Generative UI component when the user asks for pricing, statistics/metrics, product overviews, roadmap/timelines, feature comparisons, or physical office locations.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["stats", "pricing", "timeline", "products", "comparison", "map"],
          description: "The category of visual component to display.",
        },
        props: {
          type: "object",
          properties: {
            // Pricing props
            plans: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  price: { type: "string" },
                  period: { type: "string" },
                  features: { type: "array", items: { type: "string" } },
                  highlighted: { type: "boolean" },
                },
                required: ["name", "price", "features"],
              },
            },
            // Stats props
            title: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  value: { type: "string" },
                  change: { type: "string" },
                },
                required: ["label", "value"],
              },
            },
            // Timeline props
            events: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                },
                required: ["date", "title", "description"],
              },
            },
            // Products props
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  tag: { type: "string" },
                  link: { type: "string" },
                },
                required: ["name", "description"],
              },
            },
            // Comparison props
            headers: { type: "array", items: { type: "string" } },
            rows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  feature: { type: "string" },
                  values: { type: "array" },
                },
                required: ["feature", "values"],
              },
            },
            // Map props
            center: {
              type: "object",
              properties: {
                lat: { type: "number" },
                lng: { type: "number" },
              },
            },
            markers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  address: { type: "string" },
                  lat: { type: "number" },
                  lng: { type: "number" },
                },
                required: ["label", "address", "lat", "lng"],
              },
            },
          },
        },
      },
      required: ["type", "props"],
    },
  },
};

/**
 * Asynchronous generator yielding streaming tokens and visual spec events with index-aware multi-tool accumulation.
 */
export async function* streamChatCompletionGenerator(
  messages: ChatMessage[],
  options?: { model?: string; temperature?: number; apiKey?: string }
): AsyncGenerator<StreamEvent, { fullText: string; visualSpec?: VisualSpec }> {
  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
  const model = options?.model || "gpt-4o-mini";
  const temperature = options?.temperature ?? 0.3;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for LLM chat completion");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    // @ts-ignore
    tls: { rejectUnauthorized: false },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: true,
      tools: [VISUAL_TOOL_DEFINITION],
      tool_choice: "auto",
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errorBody}`);
  }

  if (!res.body) {
    throw new Error("Empty response body received from OpenAI stream");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let fullText = "";
  const toolCallsByIndex: Record<number, { name: string; args: string }> = {};
  let isToolCalling = false;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr === "[DONE]") break;

      try {
        const parsed = JSON.parse(jsonStr);
        const choice = parsed.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;

        if (delta?.content) {
          fullText += delta.content;
          yield { type: "delta", text: delta.content };
        }

        if (delta?.tool_calls && delta.tool_calls.length > 0) {
          isToolCalling = true;
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsByIndex[idx]) {
              toolCallsByIndex[idx] = { name: "", args: "" };
            }
            if (tc.function?.name) {
              toolCallsByIndex[idx].name = tc.function.name;
            }
            if (tc.function?.arguments) {
              toolCallsByIndex[idx].args += tc.function.arguments;
            }
          }
        }
      } catch {}
    }
  }

  // Handle trailing buffer line if any
  if (buffer.trim() && buffer.trim().startsWith("data:")) {
    const jsonStr = buffer.trim().slice(5).trim();
    if (jsonStr !== "[DONE]") {
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) {
          fullText += delta.content;
          yield { type: "delta", text: delta.content };
        }
        if (delta?.tool_calls && delta.tool_calls.length > 0) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsByIndex[idx]) toolCallsByIndex[idx] = { name: "", args: "" };
            if (tc.function?.arguments) toolCallsByIndex[idx].args += tc.function.arguments;
          }
        }
      } catch {}
    }
  }

  let primaryVisualSpec: VisualSpec | undefined = undefined;

  // Process all accumulated tool calls individually
  if (isToolCalling) {
    const sortedIndices = Object.keys(toolCallsByIndex)
      .map(Number)
      .sort((a, b) => a - b);

    for (const idx of sortedIndices) {
      const call = toolCallsByIndex[idx];
      if (call.args) {
        try {
          const parsedArgs = JSON.parse(call.args);
          if (parsedArgs.type && parsedArgs.props) {
            const spec = parsedArgs as VisualSpec;
            if (!primaryVisualSpec) {
              primaryVisualSpec = spec;
            }
            yield { type: "visual", spec };
            logger.info(`[LLM] Emitted GenUI visual spec [${spec.type}] from tool call #${idx}`);
          }
        } catch (err: any) {
          logger.warn(`[LLM] Failed to parse tool call arguments for index ${idx}: ${err.message}`);
        }
      }
    }
  }

  // Fallback: Check if model emitted visual spec as an inline markdown JSON code block
  if (!primaryVisualSpec && fullText.includes('"type"')) {
    const jsonBlockMatch = fullText.match(
      /```(?:json)?\s*(\{\s*"type"\s*:\s*"(?:stats|pricing|timeline|products|comparison|map)"[\s\S]*?\})\s*```/
    );
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      try {
        const parsed = JSON.parse(jsonBlockMatch[1]);
        if (parsed.type && parsed.props) {
          primaryVisualSpec = parsed as VisualSpec;
          yield { type: "visual", spec: primaryVisualSpec };
          logger.info(`[LLM] Extracted GenUI visual spec from markdown block: type="${primaryVisualSpec.type}"`);
        }
      } catch {}
    }
  }

  // If model called tool without streaming text delta, provide executive summary intro
  if (!fullText.trim() && primaryVisualSpec) {
    fullText = `Here is the interactive ${primaryVisualSpec.type} overview based on official company documentation:`;
    yield { type: "delta", text: fullText };
  }

  yield { type: "done", fullText, visualSpec: primaryVisualSpec };
  return { fullText, visualSpec: primaryVisualSpec };
}

/**
 * Standard callback-based stream completion wrapper.
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  options?: StreamChatOptions
): Promise<StreamChatResult> {
  let fullText = "";
  let visualSpec: VisualSpec | undefined = undefined;

  for await (const event of streamChatCompletionGenerator(messages, options)) {
    if (event.type === "delta") {
      fullText += event.text;
      if (options?.onDelta) options.onDelta(event.text);
    } else if (event.type === "visual") {
      visualSpec = event.spec;
      if (options?.onVisualSpec) options.onVisualSpec(event.spec);
    } else if (event.type === "done") {
      fullText = event.fullText;
      visualSpec = event.visualSpec;
    }
  }

  return { fullText, visualSpec };
}
