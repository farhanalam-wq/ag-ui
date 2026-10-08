import { db, companies, eq, desc, companySnapshots, retrieveCompanyContext } from "@ag-ui/database";
import { buildAnswerSystemPrompt } from "@ag-ui/shared";
import { streamChatCompletion } from "@ag-ui/shared";

export interface AnswerChunk {
  id: string;
  url: string;
  title: string;
  text: string;
}

export interface AnswerJson {
  question: string;
  domain: string;
  companyId: string;
  companyName: string;
  answer: string;
  chunks: AnswerChunk[];
}

/** Preindexed-only retrieval. Throws if company missing or snapshot not READY. */
export async function retrieveAnswer(question: string, domain: string): Promise<AnswerJson> {
  const clean = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const [company] = await db.select().from(companies).where(eq(companies.domain, clean)).limit(1);
  if (!company) throw new Error(`[retrieve] '${clean}' not indexed. Ingest first (bun ingest-cli.ts ${clean} --all --yes).`);
  const [snap] = await db
    .select()
    .from(companySnapshots)
    .where(eq(companySnapshots.companyId, company.id))
    .orderBy(desc(companySnapshots.version))
    .limit(1);
  if (!snap || snap.status !== "READY") {
    throw new Error(`[retrieve] snapshot for '${clean}' is '${snap?.status ?? "missing"}', need READY.`);
  }
  const retrieved = await retrieveCompanyContext(company.id, question);
  const systemPrompt = buildAnswerSystemPrompt({
    companyName: retrieved.company.name,
    companyDomain: retrieved.company.domain,
    compiledPromptContext: retrieved.compiledPromptContext,
  });
  const { fullText } = await streamChatCompletion([
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ]);
  return {
    question,
    domain: clean,
    companyId: company.id,
    companyName: retrieved.company.name,
    answer: fullText,
    chunks: retrieved.chunks.map((c) => ({ id: c.id, url: c.documentUrl, title: c.documentTitle, text: c.content })),
  };
}
