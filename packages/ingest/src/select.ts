export function parseSelection(input: string, total: number): number[] {
  const s = input.trim().toLowerCase();
  if (s === "all" || s === "a") return Array.from({ length: total }, (_, i) => i);
  if (/^\d+$/.test(s)) {
    const n = Math.min(total, Math.max(1, parseInt(s, 10)));
    return Array.from({ length: n }, (_, i) => i); // top N by rank
  }
  // ranges: "1-20,35,40-45"
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = Math.max(1, parseInt(m[1], 10));
      let b = Math.min(total, parseInt(m[2], 10));
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) out.add(i - 1);
    } else if (/^\d+$/.test(p)) {
      const n = parseInt(p, 10);
      if (n >= 1 && n <= total) out.add(n - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}
