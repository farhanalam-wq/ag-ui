import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  db,
  companies,
  companySnapshots,
  documents,
  chunks,
  facts,
  eq,
  desc,
  retrieveCompanyContext,
  closeRedisConnection,
  invalidateCompanyContextCache,
} from "./packages/database/src/index";
import {
  streamChatCompletionGenerator,
  buildOpenUISystemPrompt,
} from "./packages/shared/src/index";
import { runIngestPipeline } from "./ingest-cli";

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

async function main() {
  const rl = readline.createInterface({ input, output });

  divider("=");
  console.log("       AG-UI (COMPANY AI) INTERACTIVE TERMINAL INTELLIGENCE CLI");
  console.log("              In-Process Ingestion + Qdrant Vector Intelligence");
  divider("=");

  let targetInput = process.argv[2];

  if (!targetInput) {
    targetInput = await rl.question(
      "\nEnter company website URL or domain (e.g. https://resend.com or https://www.ambujacement.com):\n> "
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

  const cleanDomain = targetInput
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");

  console.log(`\nChecking database for existing records for '${cleanDomain}'...`);

  let [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.domain, cleanDomain))
    .limit(1);

  let shouldIngest = false;

  if (company) {
    const [latestSnap] = await db
      .select()
      .from(companySnapshots)
      .where(eq(companySnapshots.companyId, company.id))
      .orderBy(desc(companySnapshots.version))
      .limit(1);

    if (latestSnap?.status === "READY") {
      console.log(`\n[FOUND] Company ${company.name} (${company.domain}) is already indexed!`);
      console.log(`Snapshot #${latestSnap.version} (Status: READY, Documents: ${latestSnap.pageCount})`);

      const choice = await rl.question(
        "\nOptions:\n  [1] Query existing knowledge base (Instant)\n  [2] Re-ingest / re-crawl fresh pages\nSelect [1/2, default: 1] > "
      );

      if (choice.trim() === "2") {
        shouldIngest = true;
      }
    } else {
      console.log(`\n[INCOMPLETE] Latest snapshot status is '${latestSnap?.status || "UNKNOWN"}'. Ingestion needed.`);
      shouldIngest = true;
    }
  } else {
    console.log(`\n[NOT INDEXED] '${cleanDomain}' is not yet in the knowledge base.`);
    shouldIngest = true;
  }

  if (shouldIngest) {
    console.log(`\nStarting real-time page discovery & ingestion pipeline for: ${targetInput}...`);
    try {
      const ingestResult = await runIngestPipeline(targetInput);
      [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.domain, cleanDomain))
        .limit(1);

      if (!company) {
        throw new Error("Company record missing after ingestion.");
      }

      console.log(`\n[SUCCESS] Pipeline completed in ${(ingestResult.timings.totalMs / 1000).toFixed(1)}s!`);
      console.log(`  Discovery: ${(ingestResult.timings.discoveryMs / 1000).toFixed(1)}s`);
      console.log(`  Crawl:     ${((ingestResult.timings.crawlMs || 0) / 1000).toFixed(1)}s`);
      console.log(`  Database:  ${((ingestResult.timings.dbMs || 0) / 1000).toFixed(1)}s`);
    } catch (err: any) {
      console.error(`\n[INGESTION ERROR]: ${err.message}`);
      rl.close();
      await closeRedisConnection();
      process.exit(1);
    }
  }

  // Fetch facts count and chunks count
  const companyFacts = await db
    .select()
    .from(facts)
    .innerJoin(companySnapshots, eq(facts.snapshotId, companySnapshots.id))
    .where(eq(companySnapshots.companyId, company.id));

  const [snap] = await db
    .select()
    .from(companySnapshots)
    .where(eq(companySnapshots.companyId, company.id))
    .orderBy(desc(companySnapshots.version))
    .limit(1);

  const docRows = snap
    ? await db.select().from(documents).where(eq(documents.snapshotId, snap.id))
    : [];

  const chunksCount = snap?.pageCount ? snap.pageCount * 4 : docRows.length * 4;

  console.log("\n" + "+".repeat(60));
  console.log(`COMPANY PROFILE:  ${company.name.toUpperCase()} (${company.domain})`);
  console.log(`Target URL:       ${company.url}`);
  console.log(`Knowledge Base:   ${docRows.length} documents | ~${chunksCount} Qdrant vectors (1536-dim) | ${companyFacts.length} deterministic facts`);
  console.log("+".repeat(60));

  console.log("\nYou can now ask any question about this company.");
  console.log("Commands: 'benchmark' (speed test) | 'facts' (view facts) | 'exit' or 'quit'\n");

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

    if (trimmed.toLowerCase() === "facts") {
      console.log(`\n--- DETERMINISTIC FACTS FOR ${company.name.toUpperCase()} ---`);
      if (companyFacts.length === 0) {
        console.log("No facts extracted.");
      } else {
        companyFacts.forEach((f, i) => {
          console.log(`[${i + 1}] ${f.facts.predicate.padEnd(20)}: ${f.facts.value}`);
        });
      }
      continue;
    }

    if (trimmed.toLowerCase() === "benchmark") {
      console.log(`\nRunning latency benchmark on '${company.domain}'...`);
      await invalidateCompanyContextCache(company.id);
      const testQuery = "What are the main products, services, and pricing?";

      const t0 = performance.now();
      const cold = await retrieveCompanyContext(company.id, testQuery);
      const coldMs = (performance.now() - t0).toFixed(1);

      const t1 = performance.now();
      const hot = await retrieveCompanyContext(company.id, testQuery);
      const hotMs = (performance.now() - t1).toFixed(1);

      const speedup = (parseFloat(coldMs) / Math.max(0.1, parseFloat(hotMs))).toFixed(1);
      console.log(`  -> Cold Retrieval: ${coldMs} ms (Fresh Embedding + Qdrant Top-20 + PG Hydration + MMR Top-6)`);
      console.log(`  -> Hot Retrieval:  ${hotMs} ms (Redis qctx:v1 cache hit)`);
      console.log(`  -> Speedup:        ${speedup}x faster\n`);
      continue;
    }

    console.log("\n" + "-".repeat(60));
    console.log(`Querying ${company.name} AI...`);

    try {
      // 1. In-process hybrid retrieval with latency measurement
      const tRetrieval0 = performance.now();
      const retrieved = await retrieveCompanyContext(company.id, trimmed);
      const retrievalMs = (performance.now() - tRetrieval0).toFixed(1);

      const isCacheHit = parseFloat(retrievalMs) < 25;
      console.log(
        `[RETRIEVAL] ${retrievalMs}ms (${isCacheHit ? "REDIS CACHE HIT ⚡" : "COLD RETRIEVAL"}) | ${retrieved.chunks.length} MMR chunks | ${retrieved.evidence.length} evidence sources`
      );

      // 2. Build system prompt grounded strictly in retrieved context
      const openuiPrompt = buildOpenUISystemPrompt({
        companyName: retrieved.company.name,
        brandPrimary: (retrieved.company as any)?.brandColor || "#3b82f6",
      });

      const systemPrompt = `You are the official multimodal AI representative for ${retrieved.company.name} (${retrieved.company.domain}).
Your role is to deliver concise, authoritative, and brand-aligned responses grounded in company documentation.

GUIDELINES:
1. Ground your answers strictly in the provided company facts and documentation excerpts below. Do not guess or fabricate information.
2. Always provide a comprehensive and helpful textual response. Whenever the user asks about products, pricing, features, statistics, or metrics, accompany your written response with an interactive visual component block.
3. Keep answers clear, technical, and executive-ready.
4. CRITICAL RULE: NEVER USE EMOJIS ANYWHERE IN YOUR RESPONSES. Strictly use plain text and clean markdown formatting.

${openuiPrompt}

${retrieved.compiledPromptContext}`;

      console.log("\n[STREAMING ANSWER]:\n");

      const tLlm0 = performance.now();
      let fullAnswerText = "";
      let capturedVisual: any = null;

      // 3. Direct in-process LLM stream generator
      for await (const event of streamChatCompletionGenerator([
        { role: "system", content: systemPrompt },
        { role: "user", content: trimmed },
      ])) {
        if (event.type === "delta") {
          process.stdout.write(event.text);
          fullAnswerText += event.text;
        } else if (event.type === "visual") {
          capturedVisual = event.spec;
        }
      }

      const llmMs = (performance.now() - tLlm0).toFixed(1);
      const totalQueryMs = (performance.now() - tRetrieval0).toFixed(1);

      console.log("\n");

      // 4. Print cited evidence & sources
      if (retrieved.evidence && retrieved.evidence.length > 0) {
        divider("-");
        console.log(`[CITED EVIDENCE & SOURCES (${retrieved.evidence.length} sources)]`);
        divider("-");
        retrieved.evidence.slice(0, 5).forEach((ev, idx) => {
          const scorePercent = (ev.score * 100).toFixed(1);
          console.log(`[${idx + 1}] [${ev.type.toUpperCase()}] ${ev.pageTitle} (Relevance: ${scorePercent}%)`);
          console.log(`    URL:     ${ev.url}`);
          console.log(`    Excerpt: ${ev.snippet.slice(0, 140).replace(/\n/g, " ")}...`);
        });
      }

      // 5. Render visual component if triggered
      if (capturedVisual) {
        renderVisualAscii(capturedVisual);
      }

      divider("=");
      console.log(
        `[QUERY TIMING] Total: ${(parseFloat(totalQueryMs) / 1000).toFixed(2)}s | Retrieval: ${retrievalMs}ms | LLM Synthesis: ${(parseFloat(llmMs) / 1000).toFixed(2)}s`
      );
      divider("=");
    } catch (err: any) {
      console.error(`\n[ERROR] Query failed: ${err.message}`);
    }
  }

  rl.close();
  await closeRedisConnection();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[FATAL CLI ERROR]", err);
  await closeRedisConnection();
  process.exit(1);
});
