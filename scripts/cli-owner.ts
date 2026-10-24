/**
 * Operator CLI owner resolution (docs/auth-tenancy.md §5.6).
 *
 * The terminal tools run with the database role directly, which means the
 * route-level tenancy guard cannot protect them. They must therefore ask for
 * an explicit `--owner <email|id>` and resolve it to a real user before
 * touching any company row. A missing or unknown owner is a hard error, and
 * company lookups always go through `resolveOwnedCompanyByDomain` so a domain
 * alone can never select another tenant's data.
 */

import {
  db,
  eq,
  isUuid,
  resolveOwnedCompanyByDomain,
  sql,
  users,
  type CompanyRow,
} from "../packages/database/src/index";

export interface CliOwner {
  id: string;
  email: string;
  name: string | null;
}

export class CliOwnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliOwnerError";
  }
}

/** Read `--owner value` or `--owner=value`. Returns null when absent. */
export function parseOwnerArg(argv: string[] = process.argv): string | null {
  const args = argv.slice(2);

  const inline = args.find((arg) => arg.startsWith("--owner="));
  if (inline) {
    const value = inline.slice("--owner=".length).trim();
    return value || null;
  }

  const index = args.indexOf("--owner");
  if (index === -1) return null;

  const next = args[index + 1];
  if (!next || next.startsWith("--")) return null;
  return next.trim() || null;
}

/**
 * All positional arguments, skipping flags and the values of flags that take
 * one (both `--owner <email>` and `--owner=<email>`).
 */
export function positionalArgs(
  argv: string[] = process.argv,
  options: { skip?: string[] } = {}
): string[] {
  const args = argv.slice(2);
  const flagsWithValues = new Set(options.skip ?? ["--owner"]);
  const out: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) continue;
    const previous = args[i - 1];
    if (previous && flagsWithValues.has(previous)) continue;
    out.push(arg);
  }

  return out;
}

/** The first positional argument that is not the value of a flag. */
export function firstPositional(
  argv: string[] = process.argv,
  options: { skip?: string[] } = {}
): string | null {
  return positionalArgs(argv, options)[0] ?? null;
}

/** Look a user up by uuid or by case-insensitive email. */
export async function resolveOwner(raw: string): Promise<CliOwner | null> {
  const value = raw.trim();
  if (!value) return null;

  const byId = Boolean(isUuid(value));
  const [row] = byId
    ? await db.select().from(users).where(eq(users.id, value)).limit(1)
    : await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${value.toLowerCase()}`)
        .limit(1);

  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name };
}

/**
 * Resolve the required owner or throw `CliOwnerError`. Callers print the
 * message and exit non-zero; this stays testable without `process.exit`.
 */
export async function requireOwner(
  argv: string[] = process.argv
): Promise<CliOwner> {
  const raw = parseOwnerArg(argv);
  if (!raw) {
    throw new CliOwnerError(
      "--owner <email|id> is required: every company must belong to a user (docs/auth-tenancy.md §5.6)."
    );
  }

  const owner = await resolveOwner(raw);
  if (!owner) {
    throw new CliOwnerError(
      `No user found for --owner '${raw}'. Pass a real user email or id.`
    );
  }

  return owner;
}

/**
 * Owner-scoped company lookup. Never queries `companies.domain` alone.
 */
export async function findOwnedCompanyByDomain(
  ownerId: string,
  domain: string
): Promise<CompanyRow | null> {
  return resolveOwnedCompanyByDomain(ownerId, domain);
}
