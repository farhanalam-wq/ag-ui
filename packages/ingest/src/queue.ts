/**
 * Bounded in-memory FIFO queue with backpressure.
 * When queue length reaches maxSize (default 200), push() blocks until consumers drain items.
 * When empty, shift() blocks until producers push items or close() is called.
 */
export class AsyncBoundedQueue<T> {
  private queue: T[] = [];
  private closed = false;
  private readonly maxSize: number;
  private waitingPush: (() => void)[] = [];
  private waitingShift: ((item: T | null) => void)[] = [];

  constructor(maxSize = 200) {
    this.maxSize = Math.max(1, maxSize);
  }

  async push(item: T): Promise<void> {
    if (this.closed) throw new Error("Cannot push to closed queue");
    while (this.queue.length >= this.maxSize && !this.closed) {
      await new Promise<void>((resolve) => this.waitingPush.push(resolve));
    }
    if (this.closed) throw new Error("Cannot push to closed queue");

    if (this.waitingShift.length > 0) {
      const resolver = this.waitingShift.shift()!;
      resolver(item);
    } else {
      this.queue.push(item);
    }
  }

  async shift(): Promise<T | null> {
    if (this.queue.length > 0) {
      const item = this.queue.shift()!;
      if (this.waitingPush.length > 0) {
        const resolver = this.waitingPush.shift()!;
        resolver();
      }
      return item;
    }
    if (this.closed) return null;
    return new Promise<T | null>((resolve) => this.waitingShift.push(resolve));
  }

  close(): void {
    this.closed = true;
    while (this.waitingShift.length > 0) {
      const resolver = this.waitingShift.shift()!;
      resolver(null);
    }
    while (this.waitingPush.length > 0) {
      const resolver = this.waitingPush.shift()!;
      resolver();
    }
  }

  get size(): number {
    return this.queue.length;
  }
}


/** Bounded parallel map. Returns results in input order; fn may throw (captured per-item). */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onDone?: (done: number, total: number) => void
): Promise<{ ok: R[]; failed: { index: number; error: string }[] }> {
  const ok: R[] = [];
  const failed: { index: number; error: string }[] = [];
  let cursor = 0;
  let done = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          const r = await fn(items[i], i);
          if (r !== undefined) ok.push(r);
        } catch (err: any) {
          failed.push({ index: i, error: err?.message ?? String(err) });
        } finally {
          done++;
          onDone?.(done, items.length);
        }
      }
    }
  );
  await Promise.all(workers);
  return { ok, failed };
}
