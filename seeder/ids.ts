/**
 * Deterministic identifiers and randomness for the demo seeder.
 *
 * Every id is derived from `SEED_NAMESPACE`, so a rerun (and a `--reset`)
 * produces the same rows. Analytics events use a small local PRNG seeded per
 * company/day instead of Faker: the volume is in the millions and call-order
 * stability matters more than realistic word lists there.
 */

import { createHash } from "node:crypto";
import { faker } from "@faker-js/faker";

export const SEED_NAMESPACE = process.env.SEED_NAMESPACE || "ag-ui-demo-v1";

faker.seed(42);

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Stable uuid v4-shaped id from a namespace + key parts. */
export function uuidFor(...parts: Array<string | number>): string {
  const digest = createHash("sha256")
    .update([SEED_NAMESPACE, ...parts].join(":"), "utf8")
    .digest();

  // RFC 4122 version/variant bits so Postgres accepts it as a normal uuid.
  digest[6] = (digest[6]! & 0x0f) | 0x40;
  digest[8] = (digest[8]! & 0x3f) | 0x80;

  const hex = digest.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** Deterministic 32-bit seed for a string. */
export function seedFor(input: string): number {
  return parseInt(sha256(input).slice(0, 8), 16);
}

/** Mulberry32: tiny, fast, stable PRNG for generated volumes. */
export function rngFor(input: string): () => number {
  let a = seedFor(input) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)]!;
}

/** Weighted pick over parallel arrays. Weights do not need to sum to 1. */
export function weighted<T>(
  rng: () => number,
  values: readonly T[],
  weights: readonly number[]
): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < values.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return values[i]!;
  }
  return values[values.length - 1]!;
}
