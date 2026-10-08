// video-cli — preindexed-only, silent, CLI-only.
// Usage: bun packages/video-mvp/src/cli.ts "How does X work?" --site mobilearn.io [--out outputs/] [--force-video] [--from <stage> --run <id>]
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { retrieveAnswer } from "./adapters/rag";
import { runPlan } from "./stages/plan";
import { runValidation } from "./stages/validate";
import { resolveTheme } from "./adapters/brand";
import { runResolve } from "./stages/resolve";
import { runRender } from "./stages/render";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "q";

async function main() {
  const t0 = Date.now();
  const question = process.argv[2];
  const site = arg("--site");
  const outBase = resolve(process.cwd(), arg("--out") || "outputs");
  const forceVideo = process.argv.includes("--force-video");
  if (!question || !site) {
    console.log('Usage: bun packages/video-mvp/src/cli.ts "<question>" --site <domain> [--out outputs/] [--force-video]');
    process.exit(1);
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${slug(question)}`;
  const runDir = join(outBase, runId);
  await mkdir(runDir, { recursive: true });
  const log: string[] = [`[video] q=${question} site=${site} run=${runId}`];

  // 1. retrieve (existing RAG, preindexed only)
  let t = Date.now();
  const answer = await retrieveAnswer(question, site);
  await writeFile(join(runDir, "answer.json"), JSON.stringify(answer, null, 2));
  log.push(`[retrieve] ${(Date.now() - t)}ms chunks=${answer.chunks.length}`);

  // 2. plan (1 structured LLM call)
  t = Date.now();
  const { plan: rawPlan, raw, usage } = await runPlan(answer, { forceVideo });
  await writeFile(join(runDir, "plan.json"), JSON.stringify(rawPlan, null, 2));
  log.push(`[plan] ${(Date.now() - t)}ms video=${rawPlan.video} tokens=${usage?.total_tokens ?? "?"}`);
  if (!rawPlan.video) {
    await writeFile(join(runDir, "run.log"), log.join("\n") + "\n");
    console.log(`[video:false] ${rawPlan.reason}\nArtifacts: ${runDir}/`);
    process.exit(0);
  }

  // 3. validate (deterministic)
  const { plan, validation } = runValidation(answer, rawPlan);
  await writeFile(join(runDir, "validation.json"), JSON.stringify(validation, null, 2));
  await writeFile(join(runDir, "plan.json"), JSON.stringify(plan, null, 2));
  if (!validation.video) {
    await writeFile(join(runDir, "run.log"), log.join("\n") + `\n[validate] dropped=${validation.dropped.length} ABORT\n` + raw.slice(0, 500));
    console.log(`[abort] grounding left ${validation.keptScenes.length} scenes. See ${runDir}/validation.json`);
    process.exit(2);
  }

  // 4. theme (DB `brands` read, bypasses LLM)
  t = Date.now();
  const theme = await resolveTheme(answer.companyId);
  await writeFile(join(runDir, "theme.json"), JSON.stringify(theme, null, 2));

  // 5. resolve durations
  const { timeline } = runResolve(plan);
  await writeFile(join(runDir, "timeline.json"), JSON.stringify(timeline, null, 2));
  log.push(`[theme+resolve] ${(Date.now() - t)}ms total=${timeline.totalSeconds.toFixed(1)}s`);

  // 6. render (Remotion, silent --muted)
  t = Date.now();
  const { outMp4, rendered } = await runRender(runDir, timeline, theme, plan);
  log.push(`[render] ${(Date.now() - t)}ms rendered=${rendered}`);
  await writeFile(join(runDir, "run.log"), log.join("\n") + `\ntotalMs=${Date.now() - t0}\n`);
  console.log(`run: ${runDir}\nscenes: ${plan.scenes.length}, timeline: ${timeline.totalSeconds.toFixed(1)}s, theme: ${theme.primary} on ${theme.background}\nmp4: ${outMp4}`);
}

main().catch((e) => {
  console.error("[FATAL]", e.message);
  process.exit(1);
});
