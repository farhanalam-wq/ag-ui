/**
 * The instrumentation contract.
 *
 * M-01/M-02 were the same bug twice: the server supported an event type the
 * client never sent, so a whole surface showed a permanent zero and nobody
 * noticed. This test is the tripwire — it reads the shipped snippet and
 * asserts that every event it can send is a type the collector accepts.
 *
 * It is deliberately a static scan: the snippet is plain ES5 served from
 * `public/`, not part of the TypeScript graph, so nothing else would catch a
 * typo in `send("voice_edn")`.
 *
 * Run: bun test packages/analytics/src/instrumentation.test.ts
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { TRACK_EVENT_TYPES, type TrackEventType } from "./events";

const snippet = readFileSync(
  new URL("../../../apps/web/public/embed.js", import.meta.url),
  "utf8"
);

function known(type: string): type is TrackEventType {
  return (TRACK_EVENT_TYPES as readonly string[]).includes(type);
}

describe("embed.js instrumentation contract", () => {
  test("every literal send() type is one the collector accepts", () => {
    const types = [...snippet.matchAll(/send\("([a-z_]+)"/g)].map((m) => m[1]!);
    // If this fails, the regex missed the snippet's shape — fix the test
    // before trusting it to say anything about the snippet.
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) expect({ type, known: known(type) }).toEqual({ type, known: true });
  });

  test("the iframe event allowlist contains only known types", () => {
    const block = snippet.match(/var AGENT_EVENTS = \[([^\]]+)\]/);
    expect(block).not.toBeNull();
    const listed = [...block![1]!.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
    expect(listed.length).toBeGreaterThan(0);
    for (const type of listed) expect(known(type)).toBe(true);
  });

  test("the parent trusts only its own iframe as the event source", () => {
    // The source check is the security boundary for the whole bridge: the
    // message must come from our frame, not from any page that can post.
    expect(snippet).toContain("ev.source !== frame.contentWindow");
  });

  test("the snippet never forwards a quoted string from the iframe into meta", () => {
    // Counts only (O-3): the bridge rebuilds voice meta from numbers. A
    // `d.text` / `d.transcript` reaching the payload would be a regression.
    expect(snippet).not.toMatch(/transcript|d\.text/);
  });
});
