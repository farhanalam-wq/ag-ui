export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChatOptions {
  model?: string;
  temperature?: number;
  apiKey?: string;
  onDelta?: (delta: string) => void;
}

export interface StreamChatResult {
  fullText: string;
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; fullText: string };

/**
 * Text-only streaming chat completion generator (no visual/tool calls).
 */
export async function* streamChatCompletionGenerator(
  messages: ChatMessage[],
  options?: { model?: string; temperature?: number; apiKey?: string }
): AsyncGenerator<StreamEvent, { fullText: string }> {
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
      } catch {}
    }
  }

  yield { type: "done", fullText };
  return { fullText };
}

/**
 * Standard callback-based stream completion wrapper (text-only).
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  options?: StreamChatOptions
): Promise<StreamChatResult> {
  let fullText = "";

  for await (const event of streamChatCompletionGenerator(messages, options)) {
    if (event.type === "delta") {
      fullText += event.text;
      if (options?.onDelta) options.onDelta(event.text);
    } else if (event.type === "done") {
      fullText = event.fullText;
    }
  }

  return { fullText };
}
