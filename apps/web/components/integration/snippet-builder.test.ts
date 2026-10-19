import { describe, expect, test } from "bun:test";
import { buildSnippet } from "./snippet-builder";

describe("buildSnippet", () => {
  test("ends with defer as last attribute", () => {
    const s = buildSnippet({
      webOrigin: "http://localhost:3000",
      raw: "agw_test",
      apiBase: "http://localhost:3001/",
      companyName: "Acme",
    });
    expect(s.endsWith(" defer></script>")).toBe(true);
    expect(s).toContain('data-title="Acme Help"');
    expect(s).toContain("data-api-base=\"http://localhost:3001\"");
  });

  test("adds position only when bottom-left", () => {    const def = buildSnippet({
      webOrigin: "https://x.com",
      raw: "agw_a",
      apiBase: "https://api.x.com",
      companyName: "X",
    });
    expect(def).not.toContain("data-position");
    const left = buildSnippet({
      webOrigin: "https://x.com",
      raw: "agw_a",
      apiBase: "https://api.x.com",
      companyName: "X",
      position: "bottom-left",
    });
    expect(left).toContain('data-position="bottom-left"');
    expect(left.endsWith(" defer></script>")).toBe(true);
  });

  test("adds data-track only when opted in", () => {
    const off = buildSnippet({
      webOrigin: "https://x.com",
      raw: "agw_a",
      apiBase: "https://api.x.com",
      companyName: "X",
    });
    expect(off).not.toContain("data-track");
    const on = buildSnippet({
      webOrigin: "https://x.com",
      raw: "agw_a",
      apiBase: "https://api.x.com",
      companyName: "X",
      track: true,
    });
    expect(on).toContain('data-track="on"');
    expect(on.endsWith(" defer></script>")).toBe(true);
  });
});
