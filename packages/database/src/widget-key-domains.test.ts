import { afterAll, describe, expect, test } from "bun:test";
import { client } from "./index";
import {
  evaluateOrigin,
  normalizeOrigin,
  originFromHeader,
  type DomainRow,
} from "./widget-key-domains";

afterAll(async () => {
  // widget-key-domains imports the shared db client; these tests never query.
  await client.end();
});

function domain(
  origin: string,
  includePaths: string[] = ["/"],
  excludePaths: string[] = []
): DomainRow {
  return {
    id: crypto.randomUUID(),
    keyId: crypto.randomUUID(),
    origin,
    includePaths,
    excludePaths,
    createdAt: new Date(0),
  };
}

describe("normalizeOrigin", () => {
  test("normalises scheme, host casing and default ports", () => {
    expect(normalizeOrigin("https://Example.com:443")).toBe(
      "https://example.com"
    );
    expect(normalizeOrigin("http://example.com:80")).toBe("http://example.com");
    expect(normalizeOrigin(" http://localhost:3000 ")).toBe(
      "http://localhost:3000"
    );
  });

  test("rejects wildcards and non-http schemes", () => {
    expect(() => normalizeOrigin("https://*.example.com")).toThrow();
    expect(() => normalizeOrigin("ftp://example.com")).toThrow();
  });
});

describe("originFromHeader", () => {
  test("extracts an origin from Origin and Referer values", () => {
    expect(originFromHeader("https://example.com")).toBe(
      "https://example.com"
    );
    expect(originFromHeader("https://example.com/docs/page?q=1")).toBe(
      "https://example.com"
    );
    expect(originFromHeader("not a url")).toBeNull();
    expect(originFromHeader(null)).toBeNull();
  });
});

describe("evaluateOrigin (deny-by-default)", () => {
  test("denies every origin when the key has no rules", () => {
    const result = evaluateOrigin([], "https://example.com", null);
    expect(result).toEqual({ allowed: false, reason: "no_origins" });
  });

  test("denies a missing Origin and Referer even with rules", () => {
    const result = evaluateOrigin([domain("https://example.com")], null, null);
    expect(result).toEqual({ allowed: false, reason: "missing_origin" });
  });

  test("allows a listed origin", () => {
    const result = evaluateOrigin(
      [domain("https://example.com")],
      "https://example.com",
      null
    );
    expect(result).toEqual({ allowed: true, mode: "listed" });
  });

  test("allows a matching Referer when Origin is absent", () => {
    const result = evaluateOrigin(
      [domain("https://example.com")],
      null,
      "https://example.com/pricing"
    );
    expect(result).toEqual({ allowed: true, mode: "listed" });
  });

  test("denies an origin that is not listed", () => {
    const result = evaluateOrigin(
      [domain("https://example.com")],
      "https://evil.example",
      null
    );
    expect(result).toEqual({ allowed: false, reason: "forbidden_origin" });
  });

  test("enforces include and exclude paths", () => {
    const rules = [domain("https://example.com", ["/docs"], ["/docs/private"])];

    expect(
      evaluateOrigin(
        rules,
        "https://example.com",
        "https://example.com/docs/start"
      )
    ).toEqual({ allowed: true, mode: "listed" });

    expect(
      evaluateOrigin(
        rules,
        "https://example.com",
        "https://example.com/pricing"
      )
    ).toEqual({ allowed: false, reason: "forbidden_path" });

    expect(
      evaluateOrigin(
        rules,
        "https://example.com",
        "https://example.com/docs/private/key"
      )
    ).toEqual({ allowed: false, reason: "forbidden_path" });

    expect(
      evaluateOrigin(
        rules,
        "https://example.com",
        "https://example.com/pricing",
        { enforcePaths: false }
      )
    ).toEqual({ allowed: true, mode: "listed" });
  });

  test("exempts localhost outside production", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      expect(
        evaluateOrigin([], "http://localhost:3000", null)
      ).toEqual({ allowed: true, mode: "localhost" });
      expect(
        evaluateOrigin([], "http://127.0.0.1:5173", null)
      ).toEqual({ allowed: true, mode: "localhost" });
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  test("does not exempt localhost in production", () => {
    const previousNode = process.env.NODE_ENV;
    const previousRuntime = process.env.RUNTIME_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(evaluateOrigin([], "http://localhost:3000", null)).toEqual({
        allowed: false,
        reason: "no_origins",
      });
      expect(
        evaluateOrigin(
          [domain("https://example.com")],
          "http://localhost:3000",
          null
        )
      ).toEqual({ allowed: false, reason: "forbidden_origin" });

      // RUNTIME_ENV=production is the deployment signal even when NODE_ENV is
      // unset, matching authConfig.isProduction.
      process.env.NODE_ENV = "test";
      process.env.RUNTIME_ENV = "production";
      expect(evaluateOrigin([], "http://localhost:3000", null)).toEqual({
        allowed: false,
        reason: "no_origins",
      });
    } finally {
      process.env.NODE_ENV = previousNode;
      process.env.RUNTIME_ENV = previousRuntime;
    }
  });
});
