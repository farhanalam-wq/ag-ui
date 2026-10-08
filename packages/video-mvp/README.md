# video-mvp (CLI-only, silent)

Preindexed-only first run. No audio, no frontend.

```
bun packages/video-mvp/src/cli.ts "How does onboarding work?" --site mobilearn.io --out outputs/
```

Stages: retrieve (existing RAG) -> plan (1 structured LLM call, DSL JSON only) -> validate (deterministic) -> theme (DB `brands` read, bypasses LLM) -> resolve (durations) -> render (Remotion, stubbed until Node 18+ + ffmpeg land).

Artifacts per run in `outputs/<timestamp>-<slug>/`: `answer.json, plan.json, validation.json, theme.json, timeline.json, out.mp4, run.log`.

Brand tokens pass via `theme.json` straight to renderer. Planner never sees colors/fonts.
No voice/narration: captions carry the explanation; `caption`/`reveals` kept for future audio compat.
