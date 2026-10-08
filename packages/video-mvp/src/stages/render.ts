// Real render via Remotion CLI (pinned 4.0.340 for zod@3 compat).
// Silent: --muted (no audio track). Props passed inline (--props JSON).
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const TOOLCHAIN = "/tmp/opencode/toolchain";
const NODE_BIN = `${TOOLCHAIN}/node-v20.19.0-linux-x64/bin`;
const FFMPEG_BIN = `${TOOLCHAIN}/ffmpeg-7.0.2-amd64-static`;

export async function runRender(
  runDir: string,
  timeline: any,
  theme: any,
  plan: any,
): Promise<{ outMp4: string; rendered: boolean; log?: string }> {
  await mkdir(runDir, { recursive: true });
  const props = JSON.stringify({ plan, theme, timeline });
  await writeFile(join(runDir, "render-props.json"), JSON.stringify({ plan, theme, timeline }, null, 2));
  const outMp4 = join(runDir, "out.mp4");
  const root = resolve(process.cwd(), "packages/video-mvp");
  const proc = Bun.spawn(
    [`${root}/node_modules/.bin/remotion`, "render", `${root}/remotion/index.ts`, "Video", outMp4, "--props", props, "--muted", "--overwrite"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PATH: `${NODE_BIN}:${FFMPEG_BIN}:${process.env.PATH}` },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const log = (stdout + "\n" + stderr).slice(-3000);
  if (exitCode !== 0) {
    await writeFile(join(runDir, "render-error.log"), log);
    throw new Error(`[render] remotion exit ${exitCode}: ${log.slice(-500)}`);
  }
  return { outMp4, rendered: true, log };
}
