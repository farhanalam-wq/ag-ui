import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const API_BASE = process.env.API_URL || "http://localhost:3001";

interface Company {
  id: string;
  name: string;
  domain: string;
  url: string;
  latestSnapshot?: {
    id: string;
    version: number;
    status: string;
    documentCount: number;
    createdAt: string;
  };
  brand?: {
    logoUrl: string | null;
    tokens: any;
  };
}

interface Evidence {
  sourceId: string;
  url: string;
  pageTitle: string;
  snippet: string;
  type: "fact" | "chunk";
  score: number;
}

function divider(char = "=", len = 70) {
  console.log(char.repeat(len));
}

function renderVisualAscii(spec: any) {
  divider("-");
  console.log(`[VISUAL COMPONENT RENDER: ${spec.type.toUpperCase()}]`);
  divider("-");

  const props = spec.props || {};

  if (spec.type === "products" && Array.isArray(props.products)) {
    for (const p of props.products) {
      console.log(`+-------------------------------------------------------------+`);
      console.log(`| [PRODUCT] ${p.name.padEnd(50)}|`);
      if (p.tag) {
        console.log(`| Tag: ${p.tag.padEnd(55)}|`);
      }
      console.log(`| Description: ${p.description.slice(0, 46).padEnd(46)}|`);
      if (p.description.length > 46) {
        console.log(`|              ${p.description.slice(46, 92).padEnd(46)}|`);
      }
      console.log(`+-------------------------------------------------------------+`);
    }
  } else if (spec.type === "pricing" && Array.isArray(props.plans)) {
    for (const plan of props.plans) {
      console.log(`+-------------------------------------------------------------+`);
      console.log(`| [TIER] ${plan.name} - ${plan.price}${plan.period ? ` / ${plan.period}` : ""}`);
      if (plan.highlighted) console.log(`| (RECOMMENDED TIER)`);
      if (Array.isArray(plan.features)) {
        console.log(`| Features:`);
        for (const f of plan.features) {
          console.log(`|   * ${f}`);
        }
      }
      console.log(`+-------------------------------------------------------------+`);
    }
  } else if (spec.type === "stats" && Array.isArray(props.items)) {
    if (props.title) console.log(`Title: ${props.title}`);
    for (const item of props.items) {
      console.log(`* ${item.label}: ${item.value} ${item.change ? `(${item.change})` : ""}`);
    }
  } else if (spec.type === "map") {
    if (props.center) {
      console.log(`Map Center: Lat ${props.center.lat}, Lng ${props.center.lng}`);
    }
    if (Array.isArray(props.markers)) {
      console.log(`Locations / Pins:`);
      for (const m of props.markers) {
        console.log(`  * [${m.label}] ${m.address} (Coordinates: ${m.lat}, ${m.lng})`);
      }
    }
  } else if (spec.type === "timeline" && Array.isArray(props.events)) {
    for (const ev of props.events) {
      console.log(`[${ev.date}] ${ev.title}: ${ev.description}`);
    }
  } else if (spec.type === "comparison" && Array.isArray(props.rows)) {
    console.log(`Comparison Matrix:`);
    if (Array.isArray(props.headers)) {
      console.log(`Headers: ${props.headers.join(" | ")}`);
    }
    for (const r of props.rows) {
      console.log(`* ${r.feature}: ${Array.isArray(r.values) ? r.values.join(" vs ") : r.values}`);
    }
  } else {
    console.log(`Raw Props:`, JSON.stringify(props, null, 2));
  }

  console.log("\n[RAW JSON CONTRACT DUMP]:");
  console.log(JSON.stringify(spec, null, 2));
  divider("-");
}

async function findExistingCompany(targetInput: string): Promise<Company | null> {
  try {
    const res = await fetch(`${API_BASE}/api/companies`);
    if (!res.ok) return null;
    const data = await res.json();
    const companies: Company[] = data.companies || [];

    const cleanInput = targetInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

    return (
      companies.find((c) => {
        const cDomain = c.domain.toLowerCase();
        const cUrl = c.url.toLowerCase();
        return (
          cDomain === cleanInput ||
          cUrl.includes(cleanInput) ||
          cleanInput.includes(cDomain) ||
          c.name.toLowerCase() === cleanInput
        );
      }) || null
    );
  } catch {
    return null;
  }
}

async function pollCompanyUntilReady(companyId: string): Promise<Company> {
  console.log(`\nPolling indexing status for company ${companyId}...`);
  let lastStatus = "";

  while (true) {
    const res = await fetch(`${API_BASE}/api/companies/${companyId}`);
    if (!res.ok) {
      throw new Error(`Failed to check company status: HTTP ${res.status}`);
    }
    const data = await res.json();
    const latestSnapshot = data.latestSnapshot || data.company?.latestSnapshot;
    const currentStatus = latestSnapshot?.status || "UNKNOWN";

    if (currentStatus !== lastStatus) {
      console.log(`[PIPELINE STATUS] -> ${currentStatus}`);
      lastStatus = currentStatus;
    }

    if (currentStatus === "READY") {
      return {
        ...data.company,
        latestSnapshot,
        brand: data.brand || null,
      };
    }

    if (currentStatus === "FAILED") {
      throw new Error("Crawling & indexing pipeline failed for this company");
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function triggerIngestion(targetUrl: string): Promise<Company> {
  console.log(`\n[INGESTION] Initiating indexing job for: ${targetUrl}`);
  const res = await fetch(`${API_BASE}/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ingestion request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const companyId = data.companyId || data.company?.id;
  const version = data.version || data.snapshot?.version || 1;
  console.log(`[INGESTION] Company registered with ID: ${companyId}`);
  console.log(`[INGESTION] Snapshot #${version} queued in Redis BullMQ.`);

  return pollCompanyUntilReady(companyId);
}

async function main() {
  const rl = readline.createInterface({ input, output });

  divider("=");
  console.log("       AG-UI (COMPANY AI) INTERACTIVE TERMINAL INTELLIGENCE CLI");
  console.log("              Hybrid Retrieval + Brand-Adaptive GenUI");
  divider("=");

  let targetInput = process.argv[2];

  if (!targetInput) {
    targetInput = await rl.question(
      "\nEnter company website URL or domain (e.g. https://resend.com or https://stripe.com):\n> "
    );
  }

  targetInput = targetInput.trim();
  if (!targetInput) {
    console.log("No URL entered. Exiting.");
    rl.close();
    process.exit(0);
  }

  if (!targetInput.startsWith("http://") && !targetInput.startsWith("https://")) {
    targetInput = `https://${targetInput}`;
  }

  console.log(`\nChecking database for existing indexed records for: ${targetInput}...`);
  let company = await findExistingCompany(targetInput);

  if (company && company.latestSnapshot?.status === "READY") {
    console.log(`[CACHE HIT] Found existing indexed company: ${company.name} (${company.domain})`);
    console.log(`[CACHE HIT] Snapshot version: ${company.latestSnapshot.version} is READY.`);
    console.log(`[CACHE HIT] Skipping crawl & re-index. Querying existing vector knowledge base.`);
  } else if (company && company.latestSnapshot?.status !== "READY") {
    console.log(`[IN PROGRESS] Found company in status: ${company.latestSnapshot?.status}. Awaiting completion...`);
    company = await pollCompanyUntilReady(company.id);
  } else {
    console.log(`[CACHE MISS] Company not in index. Starting real-time ingestion & indexing pipeline...`);
    company = await triggerIngestion(targetInput);
  }

  // Fetch facts & chunks statistics
  let factsCount = 0;
  let chunksCount = 0;

  try {
    const [factsRes, chunksRes] = await Promise.all([
      fetch(`${API_BASE}/api/companies/${company.id}/facts`),
      fetch(`${API_BASE}/api/companies/${company.id}/chunks`),
    ]);
    if (factsRes.ok) {
      const fData = await factsRes.json();
      factsCount = fData.totalFacts || fData.facts?.length || 0;
    }
    if (chunksRes.ok) {
      const cData = await chunksRes.json();
      chunksCount = cData.totalChunks || 0;
    }
  } catch {}

  console.log("\n" + "+".repeat(60));
  console.log(`COMPANY PROFILE:  ${company.name.toUpperCase()} (${company.domain})`);
  console.log(`Target URL:       ${company.url}`);
  console.log(`Brand Theme:      Primary: ${company.brand?.tokens?.colors?.primary || "#2563eb"} | Style: ${company.brand?.tokens?.style || "modern"}`);
  console.log(`Knowledge Base:   ${chunksCount} Qdrant vector chunks (1536-dim) | ${factsCount} deterministic facts`);
  console.log("+".repeat(60));

  console.log("\nYou can now ask any question about this company.");
  console.log("Type 'exit' or 'quit' at any time to leave.\n");

  let activeConversationId: string | undefined = undefined;

  while (true) {
    let query = "";
    try {
      query = await rl.question("\n[Ask a question] > ");
    } catch (err: any) {
      if (err.code === "ERR_USE_AFTER_CLOSE" || err.message?.includes("closed")) {
        break;
      }
      throw err;
    }
    const trimmed = query.trim();

    if (!trimmed || trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
      console.log("\nGoodbye!");
      break;
    }

    console.log("\n" + "-".repeat(60));
    console.log(`Querying ${company.name} AI...`);

    try {
      const response = await fetch(`${API_BASE}/api/companies/${company.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId: activeConversationId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[ERROR] HTTP ${response.status}: ${errText}`);
        continue;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        console.error("[ERROR] No streaming body available");
        continue;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let capturedVisual: any = null;
      let capturedEvidence: Evidence[] = [];
      let fullAnswerText = "";

      console.log("\n[STREAMING ANSWER]:\n");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const blockTrimmed = block.trim();
          if (!blockTrimmed || !blockTrimmed.startsWith("data:")) continue;

          try {
            const payload = JSON.parse(blockTrimmed.slice(5).trim());
            const eventType = payload.event;
            const data = payload.data;

            if (eventType === "status") {
              // Optionally show status
            } else if (eventType === "brand") {
              // Brand received
            } else if (eventType === "evidence") {
              capturedEvidence = data || [];
            } else if (eventType === "delta") {
              process.stdout.write(data.text);
              fullAnswerText += data.text;
            } else if (eventType === "visual") {
              capturedVisual = data;
            } else if (eventType === "done") {
              activeConversationId = data.conversationId;
            } else if (eventType === "error") {
              console.error(`\n[STREAM ERROR]: ${data.message}`);
            }
          } catch {}
        }
      }

      console.log("\n");

      // Print evidence citations
      if (capturedEvidence.length > 0) {
        divider("-");
        console.log(`[CITED EVIDENCE & SOURCES (${capturedEvidence.length} sources)]`);
        divider("-");
        capturedEvidence.forEach((ev, idx) => {
          const scorePercent = (ev.score * 100).toFixed(1);
          console.log(`[${idx + 1}] [${ev.type.toUpperCase()}] ${ev.pageTitle} (Relevance: ${scorePercent}%)`);
          console.log(`    URL:     ${ev.url}`);
          console.log(`    Excerpt: ${ev.snippet.slice(0, 160)}...`);
        });
      }

      // Print visual component dump if triggered
      if (capturedVisual) {
        renderVisualAscii(capturedVisual);
      } else {
        console.log("\n(No visual component triggered for this query. Ask about products, pricing, stats, or maps to trigger GenUI)");
      }

      divider("=");
    } catch (err: any) {
      console.error(`\n[FATAL ERROR] Chat request failed: ${err.message}`);
    }
  }

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("[FATAL CLI ERROR]", err);
  process.exit(1);
});
