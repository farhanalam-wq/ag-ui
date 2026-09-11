export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-2xl space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Bun + Next.js + Elysia + pgvector
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
          ag-ui Platform
        </h1>
        <p className="text-base sm:text-lg text-zinc-400 leading-relaxed">
          Multimodal Company Intelligence, Async BullMQ Crawlers, Hybrid Retrieval, and Brand-Adaptive Generative UI.
        </p>
        <div className="flex items-center justify-center gap-4 pt-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-left text-sm">
            <span className="text-zinc-500">API Health: </span>
            <code className="text-brand-primary">http://localhost:3001/health</code>
          </div>
        </div>
      </div>
    </main>
  );
}
