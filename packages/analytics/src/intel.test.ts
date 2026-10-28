/**
 * The Intent Radar report's pure surface, without a database.
 *
 * What is worth pinning: the pairing rule (a question is answered only when
 * the *next* row is an assistant reply — no distant-reply attribution), the
 * zero cases in the totals (blindspot is answered − grounded, never a second
 * count), the null similarity when nothing reported a score, and the
 * normalization that keeps cluster keys stable across reports.
 *
 * Run: bun test packages/analytics/src/intel.test.ts
 */
import { describe, expect, test } from "bun:test";
import {
  buildClusters,
  buildCompetitors,
  normalizeClusterKey,
  pairConversation,
  radarTotals,
  readCompetitors,
  readTopSimilarity,
  type TurnRow,
} from "./intel";

function turn(
  id: string,
  cid: string,
  role: "user" | "assistant",
  content: string,
  minutes: number,
  evidence: unknown = null,
  meta: unknown = null
): TurnRow {
  return {
    id,
    cid,
    role,
    content,
    createdAt: new Date(Date.UTC(2026, 9, 10, 9, minutes)),
    evidence,
    meta,
  };
}

describe("normalizeClusterKey", () => {
  test("collapses whitespace, case and length so two wordings share a key", () => {
    expect(normalizeClusterKey("  How   is PRICING calculated? ")).toBe(
      "how is pricing calculated?"
    );
    expect(normalizeClusterKey("x".repeat(120))).toHaveLength(80);
  });
});

describe("pairConversation", () => {
  test("pairs a question with the immediately following assistant reply", () => {
    const paired = pairConversation(
      [
        turn("m1", "c1", "user", "How is pricing calculated?", 0),
        turn("m2", "c1", "assistant", "Answer", 2, [{ score: 0.9 }], {
          top_similarity: 0.82,
        }),
      ],
      false
    );
    expect(paired).toHaveLength(1);
    expect(paired[0]!.grounded).toBe(true);
    expect(paired[0]!.similarity).toBe(0.82);
    expect(paired[0]!.key).toBe("how is pricing calculated?");
  });

  test("an ungrounded reply makes the question a blindspot, similarity null", () => {
    const paired = pairConversation(
      [
        turn("m1", "c1", "user", "What is your SLA?", 0),
        turn("m2", "c1", "assistant", "No sources found", 2, null, {
          top_similarity: null,
        }),
      ],
      false
    );
    expect(paired[0]!.grounded).toBe(false);
    expect(paired[0]!.similarity).toBe(null);
  });

  test("a question followed by another user turn is unanswered, not a blindspot", () => {
    const paired = pairConversation(
      [
        turn("m1", "c1", "user", "Do you self-host?", 0),
        turn("m2", "c1", "user", "Also, pricing?", 1),
        turn("m3", "c1", "assistant", "Answer", 2, [{ score: 0.9 }], {
          top_similarity: 0.7,
        }),
      ],
      false
    );
    expect(paired[0]!.grounded).toBe(null);
    expect(paired[1]!.grounded).toBe(true);
  });

  test("detects intents with the shared vocabulary labels", () => {
    const paired = pairConversation(
      [turn("m1", "c1", "user", "How is pricing calculated?", 0)],
      false
    );
    expect(paired[0]!.intents).toEqual(["Pricing Evaluation"]);
  });

  test("an unclassifiable question is still a question", () => {
    const paired = pairConversation(
      [turn("m1", "c1", "user", "Purple elephants?", 0)],
      false
    );
    expect(paired[0]!.intents).toEqual([]);
  });

  test("assistant-only and blank user rows produce nothing", () => {
    expect(
      pairConversation(
        [
          turn("m1", "c1", "assistant", "Hello", 0),
          turn("m2", "c1", "user", "   ", 1),
        ],
        false
      )
    ).toHaveLength(0);
  });
});

describe("radarTotals", () => {
  test("blindspot is answered minus grounded, unanswered the remainder", () => {
    const t = radarTotals(100, 80, 60, 30, 10);
    expect(t.blindspotQuestions).toBe(20);
    expect(t.unansweredQuestions).toBe(20);
    expect(t.blindspotRate).toBe(25);
    expect(t.highIntentRate).toBe(30);
  });

  test("no questions is a real zero, never NaN or negative", () => {
    const t = radarTotals(0, 0, 0, 0, 0);
    expect(t.blindspotRate).toBe(0);
    expect(t.highIntentRate).toBe(0);
    expect(t.unansweredQuestions).toBe(0);
    expect(Number.isNaN(t.blindspotRate)).toBe(false);
  });

  test("a malformed aggregate cannot make the counts disagree", () => {
    const t = radarTotals(10, 12, 15, 5, 0);
    expect(t.blindspotQuestions).toBe(0);
    expect(t.unansweredQuestions).toBe(0);
  });
});

describe("buildClusters", () => {
  test("one wording, two conversations: volume, conversations and recency order", () => {
    const a = pairConversation(
      [turn("m1", "c1", "user", "Do you self-host?", 0)],
      false
    );
    const b = pairConversation(
      [turn("m9", "c2", "user", "  do you self-host?  ", 5)],
      false
    );
    const [c] = buildClusters([...a, ...b]);
    expect(c!.key).toBe("do you self-host?");
    expect(c!.volume).toBe(2);
    expect(c!.conversations).toBe(2);
    expect(c!.question).toBe("do you self-host?"); // most recent wording
    expect(c!.firstSeen).toBe(c!.lastSeen);
  });

  test("avgSimilarity is null when no reply reported a score, never zero", () => {
    const paired = pairConversation(
      [
        turn("m1", "c1", "user", "What is your SLA?", 0),
        turn("m2", "c1", "assistant", "No sources", 2, null, {}),
      ],
      false
    );
    const [c] = buildClusters(paired);
    expect(c!.avgSimilarity).toBe(null);
    expect(c!.blindspot).toBe(1);
  });

  test("ranks by volume, then blindspot", () => {
    const big = pairConversation(
      [
        turn("m1", "c1", "user", "Pricing?", 0),
        turn("m2", "c1", "assistant", "A", 1, [{ score: 0.9 }], {
          top_similarity: 0.9,
        }),
        turn("m3", "c1", "user", "pricing?", 3),
        turn("m4", "c1", "assistant", "B", 4, [{ score: 0.8 }], {
          top_similarity: 0.8,
        }),
      ],
      false
    );
    const small = pairConversation(
      [turn("m9", "c2", "user", "Do you ship to the EU?", 0)],
      false
    );
    const clusters = buildClusters([...small, ...big]);
    expect(clusters[0]!.key).toBe("pricing?");
    expect(clusters[0]!.avgSimilarity).toBe(0.85);
  });
});

describe("readCompetitors / buildCompetitors", () => {
  test("reads well-formed tags and ignores malformed ones", () => {
    expect(
      readCompetitors({ competitors: [{ name: "Intercom", quote: "like Intercom" }] })
    ).toEqual([{ name: "Intercom", quote: "like Intercom" }]);
    expect(readCompetitors({ competitors: "nope" })).toEqual([]);
    expect(readCompetitors(null)).toEqual([]);
    expect(readCompetitors({ competitors: [{ quote: "no name" }] })).toEqual([]);
  });

  test("ranks by mentions and keeps at most three verbatim quotes", () => {
    const rows: TurnRow[] = [
      turn("m1", "c1", "user", "We use Intercom today.", 0, null, {
        competitors: [
          { name: "Intercom", quote: "We use Intercom today" },
          { name: "Drift", quote: "" },
        ],
      }),
      turn("m2", "c2", "user", "Intercom is too pricey.", 0, null, {
        competitors: [{ name: "Intercom", quote: "Intercom is too pricey" }],
      }),
    ];
    const paired = pairConversation(rows, false);
    const ranked = buildCompetitors(paired, rows);
    expect(ranked[0]!.name).toBe("Intercom");
    expect(ranked[0]!.mentions).toBe(2);
    expect(ranked[0]!.quotes).toHaveLength(2);
    expect(ranked[1]!.name).toBe("Drift");
    expect(ranked[1]!.quotes).toEqual([]); // a tag without a quote still counts
  });
});

describe("readTopSimilarity", () => {
  test("accepts 0..1 numbers, rejects everything else", () => {
    expect(readTopSimilarity({ top_similarity: 0.5 })).toBe(0.5);
    expect(readTopSimilarity({ top_similarity: "0.75" })).toBe(0.75);
    expect(readTopSimilarity({ top_similarity: 1.4 })).toBe(null);
    expect(readTopSimilarity({ top_similarity: -0.1 })).toBe(null);
    expect(readTopSimilarity({})).toBe(null);
    expect(readTopSimilarity("junk")).toBe(null);
  });
});
