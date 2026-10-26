/**
 * Operator CLI owner parsing (docs/auth-tenancy.md §5.6).
 *
 * Pure argument parsing only: owner resolution itself is a database lookup and
 * is covered by the manual CLI smoke checks.
 */
import { describe, expect, test } from "bun:test";
import { firstPositional, parseOwnerArg, positionalArgs } from "./cli-owner";

function argv(...args: string[]): string[] {
  return ["bun", "cli.ts", ...args];
}

describe("parseOwnerArg", () => {
  test("reads a space-separated owner", () => {
    expect(parseOwnerArg(argv("resend.com", "--owner", "demo@ag-ui.local"))).toBe(
      "demo@ag-ui.local"
    );
  });

  test("reads an inline owner", () => {
    expect(parseOwnerArg(argv("--owner=demo@ag-ui.local", "resend.com"))).toBe(
      "demo@ag-ui.local"
    );
  });

  test("a missing value is not an owner", () => {
    expect(parseOwnerArg(argv("resend.com"))).toBeNull();
    expect(parseOwnerArg(argv("--owner", "--all"))).toBeNull();
    expect(parseOwnerArg(argv("--owner="))).toBeNull();
  });
});

describe("positional arguments", () => {
  test("skips the --owner value in either form", () => {
    expect(positionalArgs(argv("--owner", "demo@ag-ui.local", "resend.com"))).toEqual([
      "resend.com",
    ]);
    expect(positionalArgs(argv("resend.com", "--owner=demo@ag-ui.local"))).toEqual([
      "resend.com",
    ]);
  });

  test("keeps a question after the domain", () => {
    expect(
      positionalArgs(argv("--owner", "demo@ag-ui.local", "resend.com", "pricing?"))
    ).toEqual(["resend.com", "pricing?"]);
  });

  test("firstPositional returns null when only flags are present", () => {
    expect(firstPositional(argv("--owner", "demo@ag-ui.local"))).toBeNull();
  });
});
