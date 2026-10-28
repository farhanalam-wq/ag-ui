/**
 * The Signals draft contract's pure surface, without a model call.
 *
 * The parser is the honesty gate on the wire: a model reply that does not
 * match the agreed JSON shape is rejected, and an "answerable" draft must
 * carry both a question and an answer. buildFaqJsonLd is pinned so the public
 * artifact stays exactly the schema.org FAQPage and nothing internal rides
 * along.
 *
 * Run: bun test packages/shared/src/signals-draft.test.ts
 */
import { describe, expect, test } from "bun:test";
import { buildFaqJsonLd, parseDraftJson } from "./signals-draft";

describe("parseDraftJson", () => {
  test("parses the agreed shape, tolerating prose around the JSON", () => {
    const parsed = parseDraftJson('Here it is:\n{"question":"Q?","answer":"A.","answerable":true}');
    expect(parsed).toEqual({ question: "Q?", answer: "A.", answerable: true });
  });

  test("an answerable draft requires both question and answer", () => {
    expect(parseDraftJson('{"question":"Q?","answer":"","answerable":true}')).toBe(null);
    expect(parseDraftJson('{"question":"","answer":"A.","answerable":true}')).toBe(null);
  });

  test("answerable=false is a valid outcome and needs no answer text", () => {
    const parsed = parseDraftJson('{"question":"Q?","answer":"","answerable":false}');
    expect(parsed).toEqual({ question: "Q?", answer: "", answerable: false });
  });

  test("junk is rejected, never guessed", () => {
    expect(parseDraftJson("no json here")).toBe(null);
    expect(parseDraftJson("{broken")).toBe(null);
    expect(parseDraftJson('{"wrong":"shape"}')).toBe(null);
    expect(parseDraftJson('{"question":42,"answer":"A","answerable":true}')).toBe(null);
  });
});

describe("buildFaqJsonLd", () => {
  test("is exactly a one-question FAQPage", () => {
    const jsonld = buildFaqJsonLd("Do you self-host?", "Yes, on your own Kubernetes.");
    expect(jsonld).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Do you self-host?",
          acceptedAnswer: { "@type": "Answer", text: "Yes, on your own Kubernetes." },
        },
      ],
    });
  });
});
