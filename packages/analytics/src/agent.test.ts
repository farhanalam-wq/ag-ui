/**
 * The agent report's arithmetic.
 *
 * `agentTotals` is pure on purpose: every division in it can hit zero, and a
 * report that returns NaN or "Infinity questions per session" is worse than
 * one that returns nothing. These cases pin the zero paths and the rounding.
 *
 * Run: bun test packages/analytics/src/agent.test.ts
 */
import { describe, expect, test } from "bun:test";
import { agentTotals, type AgentCounts } from "./agent";

const zero: AgentCounts = {
  opens: 0,
  openVisits: 0,
  questions: 0,
  textVisits: 0,
  voiceCalls: 0,
  voiceVisits: 0,
  agentVisits: 0,
  closes: 0,
  durationSec: 0,
  maxDurationSec: 0,
};

describe("agentTotals", () => {
  test("an empty range is all zeros, never NaN", () => {
    const t = agentTotals(zero, 0);
    for (const [key, value] of Object.entries(t)) expect({ key, value }).toEqual({ key, value: 0 });
  });

  test("rates are one decimal and stay bounded by their denominator", () => {
    const t = agentTotals(
      {
        ...zero,
        openVisits: 30,
        opens: 41, // a visit may open the panel twice; the rate uses visits
        agentVisits: 3,
        voiceVisits: 1,
        voiceCalls: 2,
      },
      300
    );
    expect(t.chatOpenRate).toBe(10);
    expect(t.textVsVoice).toBe(33.3);
    expect(t.voiceCalls).toBe(2);
  });

  test("questions per session is one decimal, over visits that asked", () => {
    const t = agentTotals({ ...zero, questions: 5, textVisits: 2, agentVisits: 2 }, 10);
    expect(t.questionsPerSession).toBe(2.5);
    expect(t.messages).toBe(5);
    expect(t.agentSessions).toBe(2);
  });

  test("panel duration averages over closed panels only", () => {
    const t = agentTotals({ ...zero, closes: 3, durationSec: 200, maxDurationSec: 120 }, 10);
    expect(t.avgOpenDurationSec).toBe(67);
    expect(t.maxOpenDurationSec).toBe(120);
  });
});
