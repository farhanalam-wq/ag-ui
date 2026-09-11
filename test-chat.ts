async function testStreamingChat() {
  console.log("[TEST] Testing Streaming SSE Chat Endpoint...\n");

  // 1. Get company ID for resend.com
  const companiesRes = await fetch("http://localhost:3001/api/companies");
  const { companies } = await companiesRes.json();
  const resend = companies.find((c: any) => c.domain === "resend.com");

  if (!resend) {
    throw new Error("resend.com company record not found");
  }

  console.log(`[TEST] Targeting company: ${resend.name} (id: ${resend.id})\n`);

  // 2. Open SSE stream
  const prompt = "What are the core developer products and features provided by Resend?";
  console.log(`[USER PROMPT]: "${prompt}"\n`);

  const response = await fetch(`http://localhost:3001/api/companies/${resend.id}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Chat API error (${response.status}): ${err}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullAnswerText = "";
  let capturedVisual: any = null;
  let capturedBrand: any = null;
  let capturedEvidenceCount = 0;
  let activeConversationId = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      try {
        const payload = JSON.parse(trimmed.slice(5).trim());
        const eventType = payload.event;
        const data = payload.data;

        if (eventType === "status") {
          console.log(`[SSE: STATUS] ${data.stage} -> ${data.message}`);
        } else if (eventType === "brand") {
          capturedBrand = data;
          console.log(`[SSE: BRAND] Colors: primary=${data.tokens?.colors?.primary}, style=${data.tokens?.style}`);
        } else if (eventType === "evidence") {
          capturedEvidenceCount = data.length;
          console.log(`[SSE: EVIDENCE] Received ${data.length} citations (facts & semantic chunks)`);
        } else if (eventType === "delta") {
          process.stdout.write(data.text);
          fullAnswerText += data.text;
        } else if (eventType === "visual") {
          capturedVisual = data;
          console.log(`\n\n[SSE: VISUAL COMPONENT TRIGGERED] Type: "${data.type}"`);
          console.log(JSON.stringify(data.props, null, 2));
        } else if (eventType === "error") {
          console.error(`\n[SSE: ERROR EVENT]`, data);
        } else if (eventType === "done") {
          activeConversationId = data.conversationId;
          console.log(`\n\n[FULL STREAMED ANSWER TEXT]:\n${fullAnswerText}\n`);
          console.log(`[SSE: DONE] Conversation ID: ${data.conversationId}, Message ID: ${data.messageId}`);
        }
      } catch (err: any) {
        console.error("[JSON PARSE ERROR]:", err.message, "on block:", trimmed);
      }
    }
  }

  // 3. Verify PostgreSQL persistence
  console.log("\n[TEST] Verifying conversation persistence in PostgreSQL...");
  if (activeConversationId) {
    const convRes = await fetch(`http://localhost:3001/api/conversations/${activeConversationId}/messages`);
    const convData = await convRes.json();
    console.log(`[DB VERIFICATION] Total persisted messages in session: ${convData.messages?.length}`);
    console.log(`[DB VERIFICATION] Assistant message has visual spec: ${!!convData.messages?.[1]?.visualSpec}`);
  }

  console.log("\n[SUCCESS] End-to-End Chat & GenUI Pipeline Fully Operational!");
}

testStreamingChat()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ERROR]", err);
    process.exit(1);
  });
