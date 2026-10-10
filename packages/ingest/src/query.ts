import {
  db,
  companies,
  companySnapshots,
  documents,
  chunks,
  facts,
  eq,
  desc,
  count,
  retrieveCompanyContext,
  countCompanyPoints,
} from "@ag-ui/database";

export interface QueryCommandOptions {
  limit?: number;
  json?: boolean;
}

/** Normalize a domain argument the same way the API status route does. */
export function normalizeDomainInput(input: string): string {
  return input
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .trim();
}

async function findCompanyOrThrow(domainInput: string) {
  const domain = normalizeDomainInput(domainInput);
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.domain, domain))
    .limit(1);
  if (!company) {
    throw new Error(`Company not found for domain '${domain}' — ingest it first.`);
  }
  return company;
}

async function latestSnapshotOrThrow(companyId: string) {
  const [snapshot] = await db
    .select()
    .from(companySnapshots)
    .where(eq(companySnapshots.companyId, companyId))
    .orderBy(desc(companySnapshots.version))
    .limit(1);
  if (!snapshot) {
    throw new Error(`No snapshots for this company — ingest it first.`);
  }
  return snapshot;
}

/**
 * Read-only: run retrieval for a question and print excerpts, scores, facts.
 * `--json` prints the raw retrieved context for piping.
 */
export async function runQueryCommand(
  domainInput: string,
  question: string,
  opts?: QueryCommandOptions
): Promise<void> {
  const company = await findCompanyOrThrow(domainInput);
  const limit = Math.min(Math.max(opts?.limit ?? 6, 1), 6);
  const retrieved = await retrieveCompanyContext(company.id, question, { chunkLimit: limit });

  if (opts?.json) {
    console.log(JSON.stringify(retrieved, null, 2));
    return;
  }

  console.log(`\n[QUERY] ${company.name} (${company.domain}) — "${question}"\n`);
  console.log(`FACTS (${retrieved.facts.length}):`);
  for (const f of retrieved.facts) {
    console.log(`  - ${f.predicate}: ${f.value}`);
  }
  console.log(`\nEXCERPTS (${retrieved.chunks.length}):`);
  retrieved.chunks.forEach((c, i) => {
    console.log(`  [${i + 1}] score=${c.similarity.toFixed(3)} ${c.documentTitle}`);
    console.log(`      ${c.documentUrl}`);
    console.log(`      ${c.content.slice(0, 200).replace(/\n+/g, " ")}`);
  });
  console.log("");
}

/** Read-only: print the latest snapshot's fact table. */
export async function runFactsCommand(domainInput: string, opts?: QueryCommandOptions): Promise<void> {
  const company = await findCompanyOrThrow(domainInput);
  const snapshot = await latestSnapshotOrThrow(company.id);
  const rows = await db
    .select({
      subject: facts.subject,
      predicate: facts.predicate,
      value: facts.value,
      confidence: facts.confidence,
    })
    .from(facts)
    .where(eq(facts.snapshotId, snapshot.id));

  if (opts?.json) {
    console.log(JSON.stringify({ company: company.domain, snapshot: snapshot.id, version: snapshot.version, facts: rows }, null, 2));
    return;
  }

  console.log(`\n[FACTS] ${company.domain} snapshot v${snapshot.version} (${rows.length} facts)\n`);
  for (const f of rows) {
    console.log(`  - ${f.predicate}: ${f.value} (conf ${f.confidence})`);
  }
  console.log("");
}

/** Read-only: print document/chunk/fact counts, snapshot status, Qdrant points. */
export async function runStatsCommand(domainInput: string): Promise<void> {
  const company = await findCompanyOrThrow(domainInput);
  const snapshot = await latestSnapshotOrThrow(company.id);

  const [docRow] = await db
    .select({ n: count() })
    .from(documents)
    .where(eq(documents.snapshotId, snapshot.id));
  const [chunkRow] = await db
    .select({ n: count() })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(eq(documents.snapshotId, snapshot.id));
  const [factRow] = await db
    .select({ n: count() })
    .from(facts)
    .where(eq(facts.snapshotId, snapshot.id));

  let qdrantPoints: number | string = "unreachable";
  try {
    qdrantPoints = await countCompanyPoints(company.id, snapshot.id);
  } catch (err: any) {
    qdrantPoints = `error: ${err.message}`;
  }

  console.log(`\n[STATS] ${company.name} (${company.domain})`);
  console.log(`  snapshot: v${snapshot.version} (${snapshot.id}) status=${snapshot.status}`);
  console.log(`  documents: ${docRow?.n ?? 0}`);
  console.log(`  chunks: ${chunkRow?.n ?? 0}`);
  console.log(`  facts: ${factRow?.n ?? 0}`);
  console.log(`  qdrant points (snapshot-scoped): ${qdrantPoints}\n`);
}
