/**
 * The quality report's arithmetic, without a database.
 *
 * The report itself is SQL (a windowed percentile and a jsonb array count);
 * what is worth pinning here is the part that must never divide by zero, and
 * the definition of "answers without a source" — `answers - grounded`, never a
 * second count that could drift from the first.
 *
 * Run: bun test packages/analytics/src/quality.test.ts
 */
import { describe, expect, test } from "bun:test";
import { qualityTotals } from "./quality";

describe("qualityTotals", () => {
  test("no answers is a real zero, not NaN", () => {
    const t = qualityTotals(0, 0, 0, 0);
    expect(t.answers).toBe(0);
    expect(t.groundedAnswerRate).toBe(0);
    expect(t.answersWithoutEvidence).toBe(0);
    expect(Number.isNaN(t.groundedAnswerRate)).toBe(false);
  });

  test("rate is one decimal and the ungrounded count is the remainder", () => {
    const t = qualityTotals(200, 130, 1.2, 3.4);
    expect(t.groundedAnswerRate).toBe(65);
    expect(t.answersWithoutEvidence).toBe(70);
    expect(t.answerTimeP50Sec).toBe(1.2);
    expect(t.answerTimeP95Sec).toBe(3.4);
  });

  test("rounds a repeating rate without drifting the count", () => {
    const t = qualityTotals(3, 1, 0, 0);
    expect(t.groundedAnswerRate).toBe(33.3);
    expect(t.answersWithoutEvidence).toBe(2);
  });

  test("never reports a negative remainder", () => {
    // Grounded cannot exceed answers, but a malformed aggregate must not make
    // the card read "-1 answers without a source".
    const t = qualityTotals(10, 11, 0, 0);
    expect(t.answersWithoutEvidence).toBe(0);
  });
});
