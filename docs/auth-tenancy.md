# Auth + Tenancy — Canonical Implementation Plan (v2)

> **Status:** approved, implementation starts on `feat/auth-tenancy` (2026-10-23).
> **Authority:** this file is the sole source of truth for authentication, sessions, tenancy,
> ownership, embed authorization, and demo-data seeding. It supersedes every auth/tenancy
> statement in `docs/operations-error-activity.md`, `docs/operations-error-sink.md`,
> `TASKS.md` §18, inline code comments, and the previous v1 draft of this file.
> If code and this document disagree, stop and update this document first.
>
> **Verified against:** `ef80553` on branch `feat/auth-tenancy`, 2026-10-23.
> Drizzle ledger: 12 entries, `0000`–`0011` (latest `0011_conversations_path`).
> Schema: 20 `pgTable` definitions, 24 public relations (the extra four are `page_views`
> monthly partitions). Next.js `16.4.2`, Bun `1.4.2`, Elysia `1.2.25`, 57 live API routes,
> 27 Next page routes.
>
> **Clean-slate note:** on 2026-10-23 the development database was wiped before this plan
> started: all 24 public relations at 0 rows, Qdrant `company_chunks` recreated at 0 points,
> scoped Redis namespaces cleared, and `drizzle.__drizzle_migrations` left intact at 12.
> There is no legacy company to backfill. This is why `companies.owner_id` can be
> `NOT NULL` in the first ownership migration and why there is no bootstrap-owner step.
>
> **Read order if short on time:** §2 contract → §5 tenancy → §6 invariants → §9 route
> policy → §15 rollout → §16 non-goals. Everything else is implementation detail.
>
> **Change control:** any behavior change to auth/tenancy must update this file, the route
> policy manifest, and its tests in the same change. Other docs must link here instead of
> restating auth rules. If a line in another doc or a code comment conflicts, this file wins.

---

## 1. Outcome and scope

### 1.1 What ships

- Email + password registration and login.
- Google login (OAuth 2.0 Authorization Code + PKCE).
- One user can own zero or many companies.
- Every company keeps its entire existing data set: snapshots, documents, chunks, facts,
  brand, stylesheets, crawl jobs, uploads, conversations, messages, widget keys, allowed
  origins, theme overrides, errors, and analytics.
- Every dashboard read and write is scoped to the signed-in user's companies.
- Every public embed request is scoped to the opaque widget key, which resolves to exactly
  one company. The client never supplies a company id on a public route.
- The existing allowed-origin allowlist becomes mandatory (deny-by-default) and covers
  config, track, chat, and voice-by-widget-key.
- A deterministic demo seeder (`seeder/`) creates one user and three fully populated
  companies, with analytics volume large enough to judge the product at scale.

### 1.2 What does not ship

RBAC, roles, teams, seats, invitations, shared ownership, email verification, password
reset, MFA, magic links, refresh tokens, "log out all devices" UI, billing, per-owner
quotas beyond rate limits, SSO/SAML, OAuth providers other than Google, an audit-log table,
an operator/global tenant view, and a full CSP/security-header pass. See §16.

### 1.3 Definition of done

A new user can register or sign in with Google, create three companies, see only their own
companies, paste an embed snippet on an allowlisted origin, watch that company's analytics
grow, and never see a row, count, cache entry, or error belonging to another user. Two
users with the same company domain remain completely separate.

---

## 2. Product contract

```
                    ┌──────────────────────────────┐
                    │ user (email+password|google) │
                    └──────────────┬───────────────┘
                                   │ owns 0..N
                    ┌──────────────▼───────────────┐
                    │ company                      │
                    │  owner_id (NOT NULL)         │
                    │  domain unique per owner     │
                    └──────┬───────────────┬───────┘
                           │               │
             ┌─────────────▼─────┐   ┌─────▼──────────────────────┐
             │ widget key(s)     │   │ knowledge / brand / crawl  │
             │ allowed origins   │   │ conversations / uploads    │
             └─────────┬─────────┘   └─────┬──────────────────────┘
                       │                   │
                 public embed        analytics / operations
                       │                   │
                       └─────────► dashboard ◄──────────┘
                              (authenticated)
```

The flow the product promises:

1. A visitor lands on `/`, then goes to `/login` or `/register`.
2. After authentication, the user sees their own companies (zero on first login).
3. With zero companies, `/onboarding` asks for a URL and starts the first crawl.
4. The user selects one company. Every page below `/overview` reads that company only.
5. The company's embed keys and allowed origins live under Integration.
6. The embed posts events with the widget key. The server resolves the key to exactly one
   company and writes analytics under that company.
7. The dashboard reads analytics back through the session → ownership → company path.
8. Switching companies switches every number; nothing is shared except the user identity.

### 2.1 Multi-company rules

- A user may own any number of companies.
- A company has exactly one owner for this pass. There is no transfer, invite, or co-owner.
- The same domain may be owned by two different users. Their crawls, vectors, analytics,
  conversations, and caches are separate even when the URL is identical.
- Deleting a user cascades to their companies and all company-owned rows. `error_events`
  survives with `company_id = NULL` (SET NULL), by design.

---

## 3. Identity and credentials

### 3.1 `users`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `email` | text | required; stored trimmed and lowercased; unique on `lower(email)` |
| `password_hash` | text | nullable; Argon2id; NULL for Google-only accounts |
| `google_sub` | text | nullable; unique when present; Google's stable subject id |
| `name` | text | nullable; from Google profile or the email local-part |
| `avatar_url` | text | nullable; from Google profile |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` |

Email is normalized at the boundary (trim, lowercase) and never trusted from a token
without verification.

### 3.2 Passwords

- Argon2id via `Bun.password.hash(password, { algorithm: "argon2id", memoryCost: 19456, timeCost: 2 })`.
- Verify with `Bun.password.verify`.
- Minimum 12 characters, maximum 128. No composition rules, no forced rotation.
- Unknown-email login still runs a dummy verify against a fixed hash so the response time
  does not reveal account existence.
- One generic message for every credential failure: `Invalid email or password.`
- Passwords are never logged, returned, or placed in error context.

### 3.3 Registration

`POST /api/auth/register` with `{ email, password, name? }`.

- Normalize email; reject if it already exists (generic response; see accepted risk §16.2).
- Hash the password, insert the user, create a session, set the cookie.
- Return `201` with `{ user }` and no token in the body.
- Rate limit: 5 registrations per hour per IP.
- Registration is self-serve; there is no invite gate in this pass.

### 3.4 Email + password login

`POST /api/auth/login` with `{ email, password }`.

- Normalize email, load the user, verify the hash (or the dummy hash).
- On success: create a session, set the cookie, return `200 { user }`.
- On failure: `401 { error: "Invalid email or password." }`.
- Rate limit: 10 attempts per 15 minutes per IP and 5 per 15 minutes per email.
- A successful login does not reveal whether the email exists anywhere else.

### 3.5 Google login

Routes:

- `GET /api/auth/google/start` → `302` to Google.
- `GET /api/auth/google/callback` → exchange, verify, upsert, session, redirect.

Flow:

1. Generate a 32-byte random `state`, a PKCE `code_verifier`, and a `nonce`.
2. Store `oauth:{state} = { verifier, nonce, createdAt }` in Redis with a 10-minute TTL.
   The browser receives only the `state` in a short-lived httpOnly cookie.
3. Redirect to `https://accounts.google.com/o/oauth2/v2/auth` with
   `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`,
   `state`, `nonce`, `code_challenge`, `code_challenge_method=S256`, `prompt=select_account`.
4. On callback: compare the cookie `state` to the query `state`, consume the Redis entry
   (one-time use), exchange the code at Google's token endpoint with the verifier, and
   verify the `id_token` with `jose` against Google's JWKS.
5. Require `iss`, `aud`, `exp`, `nonce`, and `email_verified === true`.
6. Resolve the user:
   - `google_sub` match → sign in.
   - else verified email match with no `google_sub` → link the Google identity to that user.
   - else create a new user with `password_hash = NULL`.
7. Create a session, set the cookie, redirect to `${APP_URL}/overview`. If the user owns
   zero companies, redirect to `${APP_URL}/onboarding`.

Rules:

- An unverified Google email never links to an existing account and never creates a
  privileged match. It is rejected.
- A Google account whose verified email matches a user that already has a different
  `google_sub` is a conflict; do not overwrite.
- Google login requires Redis for the one-time state. If Redis is unavailable, Google login
  fails closed with a clear error; email/password login still works.
- The client secret and id_token are never sent to the browser.
- Add `jose` to `apps/api` for JWKS verification.

### 3.6 Account linking in this pass

- Google → existing email/password account by verified email is allowed once.
- Email/password → Google is implicit on the next Google login.
- Setting a password on a Google-only account, unlinking, and changing email are out of
  scope.

---

## 4. Sessions and cookies

### 4.1 Why opaque sessions, not JWT

The v1 plan used a stateless HS256 JWT with no revocation. This pass uses an opaque random
token stored as a SHA-256 hash in `auth_sessions`. Reasons:

- Logout can invalidate the session immediately.
- A stolen token can be revoked without rotating a global signing secret.
- No stale owner/role claims; ownership is resolved from the database on every request.
- No signing secret to leak, rotate, or misconfigure.
- The cost is one indexed lookup per authenticated request, which is cheaper than the
  queries every dashboard route already runs.

### 4.2 `auth_sessions`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK `users(id)` ON DELETE CASCADE, indexed |
| `token_hash` | text | SHA-256 of the raw token, unique |
| `created_at` | timestamptz | default `now()` |
| `expires_at` | timestamptz | `now() + SESSION_TTL_HOURS` (default 168h / 7 days) |
| `revoked_at` | timestamptz | nullable; non-null means invalid |
| `last_seen_at` | timestamptz | updated at most once per hour |
| `ip` | text | request IP at creation |
| `user_agent` | text | truncated to 300 chars |

There is already an analytics table named `sessions`; the auth table is deliberately
`auth_sessions`.

### 4.3 Token lifecycle

- Raw token: 32 random bytes, base64url. Never stored.
- Cookie value: the raw token. Database stores only `sha256(token)`.
- Session lookup: hash the cookie value, select where `token_hash = $1`, `revoked_at IS NULL`,
  `expires_at > now()`, join `users`.
- Login always creates a new session and a new token. No fixation.
- Logout: set `revoked_at = now()` for the current session and clear the cookie.
- Expired/revoked sessions are rejected with `401` and the cookie is cleared.
- A background cleanup may delete rows older than `expires_at + 30 days`; not required for
  correctness.

### 4.4 Cookie attributes

| Environment | Name | Domain | Secure | SameSite | HttpOnly | Path | Max-Age |
|---|---|---|---|---|---|---|---|
| local dev | `ag_session` | none (host-only) | false | Lax | true | `/` | 7d |
| prod, same origin | `__Host-ag_session` | none | true | Lax | true | `/` | 7d |
| prod, sibling subdomains | `__Secure-ag_session` | `COOKIE_DOMAIN` (e.g. `.example.com`) | true | Lax | true | `/` | 7d |

Rules:

- `__Host-` requires no `Domain` and `Path=/`; use it when web and API share an origin.
- `__Secure-` is required when `Domain` is set. `SameSite=Lax` still protects cross-site
  POSTs; the Origin/CSRF check in §10.4 is the second layer.
- If web and API are sibling subdomains and `COOKIE_DOMAIN` is empty, the web server cannot
  read the cookie for the `proxy.ts` presence check. Either set `COOKIE_DOMAIN` or deploy
  same-origin. This is a deployment requirement, not optional.
- The cookie is never readable from JavaScript. Tokens never appear in URLs, logs, or
  response bodies.

### 4.5 Session validation

Every authenticated request:

1. Read the cookie.
2. Hash it.
3. Load the session + user in one query.
4. Reject if missing, revoked, or expired.
5. Attach `{ userId, user }` to the request context.
6. Authorization then resolves company ownership separately (§5).

The session is never trusted to carry an owner id, role, or company list.

---

## 5. Tenancy and authorization

### 5.1 Ownership model

- `companies.owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`.
- `companies.domain` is no longer globally unique.
- `UNIQUE (owner_id, domain)`.
- `INDEX (owner_id)`.
- All company-owned tables inherit tenancy through `company_id`; there is no second owner
  column anywhere.

`crawl_jobs.owner` is dead and is dropped. `widget_key_domains.created_by` becomes a real
`uuid` FK to `users(id)` ON DELETE SET NULL.

### 5.2 The single resolver

```ts
// packages/database/src/tenancy.ts
export async function resolveOwnedCompany(userId: string, companyId: string) {
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.ownerId, userId)))
    .limit(1);
  return row ?? null;
}
```

Every company-scoped route calls this (directly or through the auth plugin macro). No route
queries `companies` by id alone on a tenant path. No route queries by domain alone.

### 5.3 Error semantics

| Condition | Status | Body |
|---|---|---|
| No session / invalid session | `401` | `{ error: "Authentication required" }` |
| Company id missing or owned by someone else | `404` | `{ error: "Company not found" }` |
| Conversation id missing or owned by someone else | `404` | `{ error: "Conversation not found" }` |
| Widget key missing/revoked on a public route | `404` / `410` | existing public copy |
| Origin not allowlisted | `403` | `{ error: "This key is not allowed on this site" }` |
| Malformed company id | `422` | `{ error: "companyId must be a UUID" }` |
| Rate limit | `429` | `{ error, retryAfterSec }` + `Retry-After` |

A foreign id and a nonexistent id must be indistinguishable: same status, same body, same
timing shape. There is no `403` for tenant data and no admin bypass.

### 5.4 Default deny

A route policy manifest lists every route exactly once:

```ts
type RoutePolicy =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "company"; id: "path" | "query" | "body" | "derived" }
  // The only dual-policy route: widgetKey is public, companyId is owned.
  | { kind: "voice-token" };
```

The manifest is the source for:

- the auth plugin's global `resolve` guard (and its explicit route macros),
- the `proxy.ts` dashboard matcher,
- the doc's route table,
- a test that enumerates `app.routes` and fails if any live route has no policy.

The plugin reads the manifest for every request, so an undeclared route fails closed
with `500 Route policy missing` instead of running unguarded. A new route cannot ship
without declaring one of the policies. This is the backstop against a future endpoint
forgetting tenancy.

### 5.5 Ownership resolution by surface

| Surface | How the company is resolved |
|---|---|
| `/api/companies/:id/**` | path `:id` → `resolveOwnedCompany(userId, id)` |
| `/api/brand/:companyId/**` | path `:companyId` |
| `/api/analytics/*` | query `companyId` |
| `/api/operations/*` | query `companyId` |
| `/api/conversations/:id/messages` | conversation → `companyId` → ownership |
| `/api/crawler/jobs/:id` and cancel | job → `companyId` → ownership |
| `/api/crawler/status/:domain` | `(ownerId, domain)` lookup, never global |
| `/api/crawler/ingest`, `POST /api/companies` | owner from session; find-or-create `(ownerId, domain)` |
| `/api/embed/keys*` | body/query `companyId`, or key → `companyId` |
| `/api/voice/token` with `companyId` | path/body company → ownership |
| `/api/voice/token` with `widgetKey` | key → `companyId`; public, origin-gated |
| `/api/embed/:key/*` | key → `companyId`; public, origin-gated |

### 5.6 Operator CLIs are not a bypass

`cli.ts`, `ingest-cli.ts`, `scripts/parity-check.ts`, and `scripts/benchmark-retrieval.ts`
run with the database role directly. They must require an explicit `--owner <email|id>` and
resolve it to a real user. They must not create a company without an owner, and they must
not look up a company by domain alone. A missing owner is a hard error.

---

## 6. Threat model and no-leak invariants

### 6.1 Threats and controls

| # | Threat | Control | Proof |
|---|---|---|---|
| T1 | IDOR: user A reads company B by guessing its uuid | `resolveOwnedCompany` on every tenant route; 404 for foreign ids | cross-tenant matrix |
| T2 | Conversation hijack: embed or dashboard passes another tenant's `conversationId` | load conversation, require `conversation.companyId === resolved companyId`; otherwise 404/start new | embed chat tests |
| T3 | Embed key leak / hotlink | origin allowlist deny-by-default on config, track, chat, voice-by-key | origin matrix |
| T4 | Origin bypass via missing `Origin` | fall back to `Referer`; if neither matches, reject; never fail open | missing-origin tests |
| T5 | Analytics cache bleed | every cache key embeds `companyId` + version | cache unit tests + cross-tenant reads |
| T6 | Global domain collision | unique `(owner_id, domain)`; find-or-create scoped by owner | two-owner same-domain test |
| T7 | Cross-tenant visitor correlation | `visitor_hash = sha256(day|companyId|ip|ua)` | identity unit test |
| T8 | Crawl idempotency collision | key includes `ownerId|companyId|selection`; unique `(company_id, idempotency_key)` | ingest test |
| T9 | Session theft via XSS | httpOnly cookie, no token in JS/URL/logs | cookie assertions |
| T10 | CSRF | SameSite=Lax + Origin/Referer allowlist on unsafe dashboard methods | CSRF tests |
| T11 | Login CSRF | same Origin check on auth POSTs | auth tests |
| T12 | Email enumeration | generic login failure; dummy verify for unknown emails | timing/response tests |
| T13 | Google account takeover via unverified email | require `email_verified`, unique `google_sub`, no unverified linking | OAuth callback tests |
| T14 | Public voice token abuse | origin gate on widget-key path; auth + ownership on company path | voice tests |
| T15 | Widget admin abuse | keys/domains require session + company ownership; `created_by` = user id | admin route tests |
| T16 | Operations cross-tenant read | `companyId` ownership check; `companyId = NULL` errors hidden from tenants | operations tests |
| T17 | Operator CLI cross-tenant write | required `--owner`; no global domain lookup | CLI smoke |
| T18 | Retrieval bleed | Qdrant filter `company_id`; `qctx` key includes company + snapshot | existing tests + new assertion |
| T19 | Redis bleed | HLL, analytics cache, allowlist, rate limits all keyed by company/key | key-prefix tests |
| T20 | Shared-browser company leak | company store cleared on logout/401; persisted selection scoped to user id | frontend test |

### 6.2 Invariants (non-negotiable)

1. `companies.owner_id` is the only ownership source. No owner/role in the session token.
2. Every route declares `public`, `authenticated`, or `company`; CI fails on an undeclared route.
3. Foreign and nonexistent tenant resources return the same 404.
4. No tenant path queries `companies` by id or domain alone.
5. Every tenant query carries `company_id`.
6. Every cache key carries `companyId` (or `keyId` for allowlists) and a schema version.
7. Every queue job carries `companyId`; workers re-resolve, never trust an owner payload.
8. Public embed ids (`company_id`, `widget_key_id`) are always server-derived.
9. Public origins are deny-by-default; no public response carries credentials.
10. Pseudonymous analytics identifiers are salted per company.
11. Session cookies are httpOnly, Secure in production, SameSite=Lax, rotated on login,
    revoked on logout, never logged.
12. Two users × two companies × every company route is a test, not a convention.

---

## 7. Embed isolation and allowed origins

### 7.1 Key model

- A widget key is an opaque secret (`wk_...`), stored only as a SHA-256 hash.
- `widget_keys.company_id` binds a key to exactly one company.
- A company may have up to 20 keys (`MAX_KEYS_PER_COMPANY`).
- A key may have up to 50 allowed origins (`MAX_DOMAINS_PER_KEY`).
- Key creation, listing, revocation, and domain management require a session and ownership
  of the key's company.
- `widget_key_domains.created_by` is the session user id; `created_ip` is the request IP.
- The public response never contains the company id, owner id, or raw key.

### 7.2 Server-derived identity

`POST /api/embed/:key/track`:

- Resolve key hash → active key.
- Set `company_id = key.companyId` and `widget_key_id = key.id` server-side, overwriting any
  client-supplied value.
- Validate the event with the existing collector.
- Enqueue with the server-derived ids.

`POST /api/embed/:key/chat` and `GET /api/embed/:key/config`:

- Resolve key → company.
- When a `conversationId` is supplied, load it and require
  `conversation.companyId === key.companyId`; otherwise 404 and do not append messages.
- The company's latest READY snapshot is the only knowledge source.

### 7.3 Origin allowlist: deny-by-default

Current behavior (verified): zero rules returns `{ allowed: true, mode: "open" }`
(`packages/database/src/widget-key-domains.ts`). This is the hole.

New behavior:

- Zero origins → **deny** on config, chat, and voice-by-key.
- `track` with zero origins → `403`; the beacon is dropped. Pages must not stall, so the
  embed client already ignores failures.
- Localhost is exempt only when `NODE_ENV !== "production"`: a key may work on
  `http://localhost:<port>` and `http://127.0.0.1:<port>` without an explicit rule.
- Add an origin → checked against `Origin`, falling back to `Referer`.
- Path include/exclude rules keep working as they do today.
- The Redis allowlist cache stays keyed by `keyId`; invalidation on add/remove remains.
- The UI copy "Open — works anywhere" is removed. The replacement is "No origins yet —
  this key is disabled until you add one."

Because the database was wiped, there are no legacy zero-origin keys to migrate. New keys
start disabled until the first origin is added.

### 7.4 Voice

- `POST /api/voice/token` with `widgetKey`: public, origin-gated exactly like config/chat.
- `POST /api/voice/token` with `companyId`: authenticated + `resolveOwnedCompany`.
- Exactly one of the two is required; both or neither is `422`.
- `POST /api/voice/tool/query`: server-to-server bearer `VOICE_TOOL_SECRET`, no session,
  no browser CORS. It resolves company by the signed job/room context, not by client input.

### 7.5 Analytics isolation

- Raw `page_views` carry `company_id` and `widget_key_id` (server-derived).
- `sessions`, `metrics_daily`, `metrics_hourly` are company-scoped.
- HLL keys: `ahll:{companyId}:{day}`.
- Analytics cache keys: `ana:...:{companyId}:...`.
- Reads: 11 company-scoped report routes plus the global `cache-stats` diagnostic.
- Reports aggregate at **company** level. `widget_key_id` is retained for a future per-key
  breakdown; it is not exposed as a filter in this pass. A company belongs to one user, so
  company scope is user scope.
- `cache-stats` requires a session and returns cache counters only, never tenant rows.

### 7.6 Embed rate limits

Existing limits stay, all keyed by key + IP or key + day:

- `EMBED_RATE_PER_MIN`, `EMBED_RATE_PER_DAY` for config/chat.
- `TRACK_RATE_PER_MIN`, `TRACK_RATE_PER_DAY`, `TRACK_QUOTA_PER_DAY` for track.
- 429 with `Retry-After`; quota returns 202 without storing.

---

## 8. Schema and migrations

### 8.1 `0012_users_auth_sessions.sql`

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  google_sub text,
  name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));
CREATE UNIQUE INDEX users_google_sub_unique ON users (google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  ip text,
  user_agent text
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_expires_idx ON auth_sessions (expires_at);
```

### 8.2 `0013_company_ownership.sql`

```sql
ALTER TABLE companies DROP CONSTRAINT companies_domain_unique;
ALTER TABLE crawl_jobs DROP CONSTRAINT crawl_jobs_idempotency_key_unique;

ALTER TABLE widget_key_domains
  ALTER COLUMN created_by SET DATA TYPE uuid USING created_by::uuid;

-- No backfill: the development database was wiped before this migration.
ALTER TABLE companies ADD COLUMN owner_id uuid NOT NULL;
ALTER TABLE companies
  ADD CONSTRAINT companies_owner_id_users_id_fk
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE widget_key_domains
  ADD CONSTRAINT widget_key_domains_created_by_users_id_fk
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Deleting a user cascades users -> companies -> widget_keys -> widget_key_domains,
-- while widget_key_domains.created_by is SET NULL. Without deferral the SET NULL
-- update re-checks key_id after the parent key is already cascade-deleted and fails.
ALTER TABLE widget_key_domains
  DROP CONSTRAINT widget_key_domains_key_id_widget_keys_id_fk;
ALTER TABLE widget_key_domains
  ADD CONSTRAINT widget_key_domains_key_id_widget_keys_id_fk
  FOREIGN KEY (key_id) REFERENCES widget_keys(id)
  ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX companies_owner_domain_unique ON companies (owner_id, domain);
CREATE INDEX companies_owner_idx ON companies (owner_id);

ALTER TABLE crawl_jobs DROP COLUMN owner;
ALTER TABLE crawl_jobs
  ADD CONSTRAINT crawl_jobs_company_idempotency_unique UNIQUE (company_id, idempotency_key);
```

No `0014` and no bootstrap script. If a future deployment has existing companies, it must
add its own backfill step before applying the `NOT NULL`; this branch does not.

The deferred `key_id` FK is deliberate. Drizzle 0.39 cannot express deferrability, so the
Drizzle schema and snapshot describe the normal cascade; the hand-written migration adds the
deferral. Do not "fix" it away in a later generate — the behavioral test in §14.3 depends on
deleting a user who created a domain on their own key.

### 8.3 Drizzle schema updates

- Add `users`, `authSessions` to `packages/database/src/schema.ts`.
- Add `ownerId` to `companies` (`uuid NOT NULL`, FK to `users` on delete cascade).
- Remove `owner` from `crawlJobs`; scope idempotency uniqueness to `(companyId, idempotencyKey)`.
- Change `widgetKeyDomains.createdBy` to `uuid` with an FK to `users` on delete set null.
- Keep `pageViews` as the read definition over the hand-maintained partitioned table.
- Until A4 passes the session owner at every insert site, `companies.ownerId` carries a
  temporary runtime guard: omitting it throws instead of writing an ownerless company. The
  database column is `NOT NULL` regardless. A4 removes the guard.

### 8.4 Table ownership map

| Table | Scope | How |
|---|---|---|
| `users`, `auth_sessions` | user | direct |
| `companies` | owner | `owner_id` |
| `company_snapshots`, `brands`, `documents`, `facts`, `crawl_jobs`, `conversations` | company | `company_id` / `snapshot_id` |
| `chunks`, `messages`, `batch_files` | company via parent | join to document/conversation/batch |
| `enrichment_batches`, `brand_stylesheets`, `widget_keys`, `widget_theme_overrides` | company | `company_id` |
| `widget_key_domains` | company via key | `key_id` → `widget_keys.company_id` |
| `page_views`, `sessions`, `metrics_daily`, `metrics_hourly` | company | `company_id` |
| `error_events` | company or global | `company_id` nullable; tenants see only their own |

---

## 9. Route inventory and policy

57 live routes at `ef80553`, plus 6 planned auth routes = **63**. Every route has exactly
one policy. The manifest test in §14.1 is authoritative; this table is the human view.

### 9.1 Public (no session)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | API identity/health payload |
| GET | `/health` | liveness |
| GET | `/swagger`, `/swagger/json` | development only; disabled in production |
| GET | `/api/embed/:key/config` | key + origin gate |
| POST | `/api/embed/:key/track` | key + origin gate; always 202/403, never 500 on shed |
| POST | `/api/embed/:key/chat` | key + origin gate; SSE |
| POST | `/api/voice/token` | **only** when `widgetKey` is supplied; key + origin gate |
| POST | `/api/voice/tool/query` | `VOICE_TOOL_SECRET` bearer; not browser-callable |
| POST | `/api/auth/register` | self-serve; 201 + cookie |
| POST | `/api/auth/login` | 200 + cookie |
| POST | `/api/auth/logout` | public so an expired cookie can still be cleared |
| GET | `/api/auth/google/start` | 302 to Google |
| GET | `/api/auth/google/callback` | 302 to `/overview` or `/onboarding` |

### 9.2 Authenticated (session, no company)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/auth/me` | `{ user }` or 401 |
| GET | `/api/companies/` | filtered by `owner_id` |
| POST | `/api/companies/` | ingest/create; owner from session |
| POST | `/api/crawler/discover` | URL discovery; no tenant rows |
| POST | `/api/crawler/discover-sitemap` | sitemap discovery; no tenant rows |
| POST | `/api/crawler/ingest` | owner from session; find-or-create `(owner, domain)` |
| GET | `/api/analytics/cache-stats` | cache counters only |

### 9.3 Company-scoped (401 + 404)

| Method | Path | Id source |
|---|---|---|
| GET | `/api/companies/:id` | path |
| GET | `/api/companies/:id/chunks` | path |
| GET | `/api/companies/:id/conversations` | path |
| GET | `/api/companies/:id/documents` | path |
| GET | `/api/companies/:id/facts` | path |
| GET | `/api/companies/:id/uploads/` | path |
| GET | `/api/companies/:id/versions` | path |
| GET | `/api/companies/:id/widget-theme` | path |
| PUT | `/api/companies/:id/widget-theme` | path |
| DELETE | `/api/companies/:id/widget-theme` | path |
| POST | `/api/companies/:id/chat` | path |
| POST | `/api/companies/:id/uploads/` | path |
| POST | `/api/companies/:id/uploads/:batchId/confirm` | path + batch check |
| POST | `/api/companies/:id/uploads/documents/delete` | path |
| POST | `/api/companies/:id/uploads/rollback` | path |
| DELETE | `/api/companies/:id/uploads/:batchId` | path + batch check |
| GET | `/api/brand/:companyId/latest` | path |
| GET | `/api/brand/:companyId/history` | path |
| POST | `/api/brand/retry` | body `companyId` |
| GET | `/api/conversations/:id/messages` | conversation → company |
| GET | `/api/crawler/jobs/:id` | job → company |
| POST | `/api/crawler/jobs/:id/cancel` | job → company |
| GET | `/api/crawler/status/:domain` | `(owner_id, domain)` |
| GET | `/api/analytics/acquisition` | query |
| GET | `/api/analytics/audience` | query |
| GET | `/api/analytics/content` | query |
| GET | `/api/analytics/conversions` | query |
| GET | `/api/analytics/overview` | query |
| GET | `/api/analytics/realtime` | query |
| GET | `/api/analytics/website` | query |
| GET | `/api/analytics/agent/overview` | query |
| GET | `/api/analytics/agent/quality` | query |
| GET | `/api/analytics/agent/questions` | query |
| GET | `/api/analytics/agent/voice` | query |
| GET | `/api/operations/errors` | query |
| GET | `/api/operations/activity` | query |
| GET | `/api/embed/keys` | query `companyId` |
| POST | `/api/embed/keys` | body `companyId` |
| POST | `/api/embed/keys/:keyId/revoke` | key → company |
| GET | `/api/embed/keys/:keyId/domains` | key → company |
| POST | `/api/embed/keys/:keyId/domains` | key → company |
| DELETE | `/api/embed/domains/:id` | domain → key → company |
| POST | `/api/voice/token` | **only** when `companyId` is supplied |

`POST /api/voice/token` is the only dual-policy route. The policy is chosen by which field
is present; both or neither is `422`.

### 9.4 Error contract

- `401` for no/invalid session.
- `404` for missing or foreign tenant resources.
- `422` for malformed ids and invalid bodies (Elysia validation).
- `429` for rate limits with `Retry-After`.
- `500` only for unexpected failures; recorded by the error sink.
- Expected 4xx are not written to `error_events`.

---

## 10. Backend enforcement

### 10.1 Auth plugin

One Elysia plugin (`apps/api/src/auth/plugin.ts`) provides:

- a global `resolve` hook that reads `route-policy.ts` and enforces the declared
  policy before any handler runs (undeclared routes fail closed),
- `resolveSession(request)` → `{ userId, user } | null`.
- `requireUser(ctx)` → 401 if absent.
- `requireCompany(ctx, policy)` → `resolveOwnedCompany`; 404 if null.
- macros: `{ auth: true }`, `{ company: "path" | "query" | "body" | "derived" }`.

Route handlers never read cookies directly and never query `companies` for ownership.
The plugin is registered with `.as("global")`; without that Elysia scopes its hooks to
the plugin itself and the parent routes run unguarded.

### 10.2 Tenancy helper

One module (`packages/database/src/tenancy.ts`) with:

- `resolveOwnedCompany(userId, companyId)`.
- `resolveOwnedConversation(userId, conversationId)`.
- `resolveOwnedCrawlJob(userId, jobId)`.
- `resolveOwnedWidgetKey(userId, keyId)`.
- `companyIdForWidgetKey(keyId)` for admin routes.

These are the only functions allowed to resolve ownership. Route files may not hand-roll
`eq(companies.ownerId, ...)`.

### 10.3 CORS

Two explicit policies, never the default `origin: true` + `credentials: true`:

| Surface | Allowed origin | Credentials | Vary |
|---|---|---|---|
| Dashboard + auth | exact `APP_URL` | `true` | `Origin` |
| Public embed (`/api/embed/*`, voice-by-key) | reflect request `Origin` | `false` | `Origin` |
| Voice tool | none (server-to-server) | n/a | n/a |
| Static Next assets | own origin | n/a | n/a |

Implementation rule: because `@elysiajs/cors` applies `credentials` globally, do not mount
one global instance for both surfaces. Use a small explicit CORS handler with a per-route
policy, or two correctly scoped instances. Preflight tests must assert:

- a public request never receives `Access-Control-Allow-Credentials: true`,
- a dashboard request only receives the exact `APP_URL`,
- a foreign origin receives no allow-origin header,
- `OPTIONS` is handled once, not duplicated.

### 10.4 CSRF

- `SameSite=Lax` on the session cookie.
- Every unsafe dashboard/auth request (`POST`/`PUT`/`PATCH`/`DELETE`) must carry an
  `Origin` (or `Referer`) that matches `APP_URL`; missing or foreign is `403`.
- `Sec-Fetch-Site`, when present, must be `same-origin` or `same-site`.
- Public embed routes are exempt because they carry no cookies; they rely on the key +
  origin gate.
- `POST /api/voice/tool/query` is exempt; it uses a bearer secret.

### 10.5 Rate limits

| Route | Limit |
|---|---|
| `POST /api/auth/register` | 5/hour/IP |
| `POST /api/auth/login` | 10/15min/IP and 5/15min/email |
| `GET /api/auth/google/start` | 20/15min/IP |
| `GET /api/auth/google/callback` | 20/15min/IP |
| Existing analytics reads | unchanged (`ANALYTICS_READ_*`) |
| Existing embed/track | unchanged |

Auth limits are Redis-backed. If Redis is unavailable, log loudly and fall back to a
conservative in-process counter; do not take the whole product down. Argon2 cost and generic
errors remain the second line of defence.

### 10.6 Logging and redaction

Never log: passwords, password hashes, raw session tokens, cookie headers, `Authorization`,
Google authorization codes, code verifiers, id_tokens, or client secrets.

Auth failures log `{ event, emailHash, ip, reason }`; successes log `{ event, userId }`.
The existing `recordError` sink receives unexpected 5xx only. `context` must not contain
secrets or visitor content.

### 10.7 Configuration

Required:

- `APP_URL` — web origin, used for CORS, CSRF, and redirects.
- `DATABASE_URL`, `REDIS_*`, `QDRANT_*`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REDIRECT_URI=${API_URL}/api/auth/google/callback`.
- `COOKIE_DOMAIN` — only when web/API are sibling subdomains.
- `SESSION_TTL_HOURS` (default 168).
- `VOICE_TOOL_SECRET` (existing).

Obsolete and removed from `.env.example`: `SECRET_KEY`, `CLIENT_SESSION_HOURS`,
`ADMIN_DOMAIN`, `NEXTJS_CALLBACK_URL`. Opaque sessions need no signing secret.

`validateEnv` (already in `packages/shared/src/env.ts`, currently unused) is called at API
startup in production and fails fast on a missing required value.

---

## 11. Frontend contract

### 11.1 Route map

| Route | Visibility | Content |
|---|---|---|
| `/` | public | landing page (replaces the current dashboard) |
| `/login` | public | email/password + Google |
| `/register` | public | email/password + Google |
| `/onboarding` | authenticated | first company when the user owns zero |
| `/overview` | authenticated | the current `/` dashboard, moved here |
| `/agents`, `/analytics/*`, `/experience/*`, `/integration/*`, `/intelligence/*`, `/knowledge/*`, `/operations/*`, `/playground`, `/settings/*`, `/visitors/*` | authenticated | unchanged URLs |
| `/embed/[key]` | public | unchanged |

Only `/` changes URL. The other 26 page routes keep their paths. `app/overview-charts.tsx`
stays where it is; the new overview page imports it as `../overview-charts`, and the
conversions page keeps `../../overview-charts`.

### 11.2 No physical route-group move

The v1 plan proposed moving every dashboard page into a `(dashboard)` group. This pass does
not. Every dashboard page already renders through `StudioShell`; the session guard goes
there, and `proxy.ts` handles the cheap redirect. This avoids 26 file moves for zero URL
benefit. The API remains the authorization authority.

### 11.3 `proxy.ts`

- Next 16 `apps/web/proxy.ts` (the renamed middleware).
- Reads only the presence of the session cookie; it does not verify it.
- Redirects unauthenticated dashboard paths to `/login?next=<path>`.
- Redirects a signed-in user away from `/login` and `/register` to `/overview`.
- Never redirects `/`, `/embed/*`, static assets, or the auth callback.
- A false positive is corrected by `/api/auth/me`; a false negative is caught by the API.

### 11.4 `SessionProvider`

- Client context fetching `GET /api/auth/me` with credentials.
- Exposes `{ user, loading, refresh, logout }`.
- `StudioShell` renders a skeleton while loading, redirects to `/login` on 401, and to
  `/onboarding` when `/api/companies` returns an empty list.
- `nav-user` uses the real user; the hardcoded `DEFAULT_USER` and the fake
  "Enterprise Admin" role are removed. The "Team" nav item is removed until RBAC exists.

### 11.5 API client

- One `request<T>()` primitive with `credentials: "include"`, JSON parsing, `ApiError`,
  and a single 401 handler.
- `analyticsRequest()` and the 36 raw `fetch` calls fold into it.
- `voice-client.ts` uses the same credentialed primitive.
- Embed calls use a separate `publicRequest` with `credentials: "omit"`.
- SSE uses a `streamRequest` with credentials and `Accept: text/event-stream`.
- `snippet-builder.ts` removes the `window.location.origin.replace(":3000", ":3001")`
  fallback. The API base is `NEXT_PUBLIC_API_URL`; when empty, the snippet assumes a
  same-origin deployment behind the web proxy.

### 11.6 Company store

- `ensureCompanies()` calls `GET /api/companies` (server-filtered by owner).
- On logout or any 401: reset `companies`, `selectedId`, and in-flight state.
- Persisted selection stores `{ userId, selectedId }`; if `userId` does not match the current
  session, discard it. A shared browser never restores another user's company.
- The switcher shows only the signed-in user's companies.

### 11.7 Login, register, onboarding

- `/login` and `/register` are centered cards with email, password, submit, and a Google
  button. No dashboard shell.
- `/onboarding` asks for a URL, calls `POST /api/companies`, polls
  `GET /api/crawler/status/:domain` (owner-scoped), and routes to `/overview` on READY.
- A user with zero companies who navigates to `/overview` is redirected to `/onboarding`.

---

## 12. Cross-cutting pipelines

### 12.1 Ingest and crawl

- `POST /api/companies` and `POST /api/crawler/ingest` take `ownerId` from the session.
- Find-or-create a company by `(ownerId, domain)`.
- Pass `ownerId` into `packages/ingest/src/pipeline.ts` and `populate.ts`.
- Selection and idempotency include the owner and company:
  `sha256(ownerId | companyId | selection)`, unique `(company_id, idempotency_key)`.
- `crawler/status/:domain` resolves `(ownerId, domain)`.
- Workers receive `{ companyId, snapshotId }`; they never receive or trust an owner id.

### 12.2 Retrieval

- Qdrant points already carry `company_id`; every search filters by it.
- `qctx:{companyId}:{snapshotId}:{hash}:{limit}` remains company-scoped.
- `qemb`/`emb` are content-addressed shared caches of vectors only; they never return
  tenant rows. Documented as an accepted, non-identifying share.

### 12.3 Analytics

- Collector: server-derived `company_id` and `widget_key_id`.
- Visitor hash: `sha256(day | companyId | ip | ua)`.
- HLL: `ahll:{companyId}:{day}`.
- Rollups: company-scoped; no schema change.
- Reports: 11 company-scoped reads + `cache-stats`.
- Cache: every analytics key includes `companyId`.

### 12.4 Voice

- Widget-key path: public + origin gate.
- Company path: session + ownership.
- Tool query: bearer secret, no browser CORS.

### 12.5 Uploads, brand, conversations

- All company-path routes use `resolveOwnedCompany`.
- Upload batch confirm/rollback/delete verify `batch.companyId === params.id`.
- `GET /api/conversations/:id/messages` resolves the conversation's company then ownership.
- Embed chat verifies a supplied conversation belongs to the key's company.

### 12.6 Operations

- Errors/activity require `companyId` and ownership.
- `companyId = NULL` (global) errors are never returned to a tenant.
- No operator/global view in this pass.

---

## 13. Operator tooling, data reset, and the demo seeder

### 13.1 Deleted scripts

The following were removed on 2026-10-23 and are not part of the tree:

- `scripts/clear-db.ts` — its wipe was incomplete (omitted `page_views`, `sessions`,
  `metrics_*`, `error_events`, `widget_theme_overrides`) and it is superseded by the
  one-off full wipe plus the seeder's `--reset`.
- `scripts/seed-analytics-fixtures.ts` — superseded by `seeder/`.

Root scripts `fixtures:analytics` and `fixtures:analytics:clear` were removed with them.

### 13.2 Full wipe (one-off, already performed)

For the record, the clean-slate procedure is:

1. `TRUNCATE` every public table with `RESTART IDENTITY CASCADE`, including partitions.
   Leave `drizzle.__drizzle_migrations` intact.
2. Delete and recreate the Qdrant `company_chunks` collection (1536, Cosine) with payload
   indexes for `company_id`, `snapshot_id`, `document_id`, `category`, `chunk_index`.
3. Delete the app Redis namespaces: `adedupe:*`, `ahll:*`, `allowlist:*`, `ana:*`,
   `emb:v1:*`, `qemb:v1:*`, `qctx:v1:*`, `rl:*`, `tquota:*`, `upload:*`, `voice:*`,
   `frontier:*`, `bull:*`. Never `FLUSHALL` unless the Redis instance is dedicated.
4. Verify every table at 0, Qdrant at 0, and the namespaces empty.

### 13.3 Demo seeder

**Location:** `seeder/` at the repo root (`index.ts`, plus small modules for events,
content, and rollups). Root scripts:

```json
"seed": "bun seeder/index.ts",
"seed:reset": "bun seeder/index.ts --reset"
```

**Dependency:** `@faker-js/faker` as a root devDependency, seeded deterministically
(`faker.seed(42)`) so reruns produce the same data.

**Identity:** one user, `demo@ag-ui.local`, with an Argon2id hash created through the same
`Bun.password` path as real registration. The password is printed once at the end.

**Companies:** exactly three, with fixed UUIDs derived from a namespace. Each is fully
populated across every table that exists at the time of seeding:

| Area | Volume per company |
|---|---|
| Snapshots | 4–5 versions (v1–v4 READY; one FAILED for UI states) |
| Documents | 100–150 across the latest two snapshots |
| Chunks | 4–8 per document (~600–1,200) |
| Facts | 40–60 |
| Crawl jobs | 3–5 completed with realistic counts |
| Enrichment | 2 batches with manifests and `batch_files` |
| Brand | `brands` tokens, `brand_stylesheets` (DTCG, tailwind, designMd, WCAG), `widget_theme_overrides` |
| Widget keys | 2 keys, 2–3 allowed origins each, include/exclude paths |
| Conversations | 1,200–1,500 over 90 days, 3–6 messages each |
| Messages | ~5,000–7,000 per company, with `evidence` arrays and occasional `visualSpec` |
| Errors | 30–50 per company plus a few global rows |

**Analytics volume (default, the "fat numbers" target):**

| Metric | Target |
|---|---|
| Window | 90 days, ending yesterday |
| Page views | ~1.3M total (~432k/company) |
| Sessions | ~540k total (~180k/company) |
| Chat opens | ~65k |
| Chat messages | ~140k |
| Chat closes | ~55k |
| Voice start/end | ~8k each |
| Conversions | ~13.5k with realistic revenue |
| `metrics_daily` | 90 rows (one per day) |
| `metrics_hourly` | ~2,160 rows (90 days × 24) |

Distributions are weighted: weekday/weekend curves, traffic sources, landing pages,
device/browser/OS mix, ~8% bots, timezone offsets, chat funnels, and conversion attribution.
The point is to judge the product at scale, not to produce uniform noise.

**Correctness:**

- Create the monthly `page_views` partitions for the whole seed window first, exactly like
  the worker (`CREATE TABLE IF NOT EXISTS page_views_YYYYMM PARTITION OF ...` plus indexes).
- Insert raw `page_views` via `COPY` in batches (not 1.3M individual inserts).
- Then call the real `upsertSessions`, `buildDailyRollup`, `buildHourlyRollup`, and
  `rebuildDailyHll` so every tab agrees with every other tab.
- Use the real event types (`pageview`, `chat_open`, `chat_message`, `chat_close`,
  `conversion`, `scroll`, `download`, `click`, `heartbeat`, `voice_start`, `voice_end`) and
  the real `meta` shapes (`durationSec`, `turns`).

**Safety and lifecycle:**

- Refuse to run when `NODE_ENV === "production"`.
- Refuse when `DATABASE_URL` does not point at localhost/127.0.0.1.
- `--reset` deletes the demo user (cascade removes all three companies and every child row,
  including analytics) and reseeds. Without `--reset`, an existing demo user is a hard error.
- Print a summary table: table name → row count, plus the login credentials.
- Qdrant is left empty by default. Random vectors would make retrieval meaningless; a future
  `--qdrant` flag can insert demo vectors for UI work that needs points.

**Scope:** the seeder creates exactly one user and three companies as requested. Cross-tenant
**tests** create their own second user; the seeder is for demo/review, not authorization
proof.

---

## 14. Testing strategy

### 14.1 Route manifest

`apps/api/src/route-policy.test.ts`:

- Enumerate `app.routes` from the live Elysia app.
- Assert every route has a policy in the manifest, with no duplicate or stale entries.
- Assert every route pattern resolves to its own manifest entry.
- Assert every `company` route references an ownership resolver.
- Assert anonymous requests to protected routes get 401 and public routes stay public
  (this is what catches a plugin that was accidentally left non-global).
- Fail on a new route with no policy.

### 14.2 Cross-tenant matrix

Two users, two companies, two widget keys. For every company-scoped route:

| Caller | Target | Expected |
|---|---|---|
| anonymous | any | 401 |
| user A | company A | 200 |
| user A | company B | 404 |
| user B | company A | 404 |
| user A | foreign conversation/job/key/domain | 404 |

Also assert the payload contains zero rows from the other company (not just a 404 shell).

### 14.3 Auth tests

- Register → login → me → logout → me (401).
- Wrong password and unknown email return the same 401 body.
- Argon2 verify succeeds; stored hash is never returned.
- Session expiry and `revoked_at` are enforced.
- Cookie flags: httpOnly, SameSite=Lax, Secure in production.
- Google: state mismatch, missing state, reused state, bad nonce, `email_verified=false`,
  linking by verified email, and `google_sub` conflict.
- Deleting a user cascades to their companies and all company-owned rows. A
  `widget_key_domains` row that the user created on another tenant's key survives with
  `created_by = NULL` (requires the deferred `key_id` FK from §8.2).

### 14.4 Embed and origin tests

- Zero origins → config 403, chat 403, track 403.
- Allowlisted origin → 200; wrong origin → 403; missing Origin but matching Referer → 200.
- Localhost works only outside production.
- Voice-by-key is gated exactly like config.
- Track overwrites a client-supplied `company_id`/`widget_key_id`.
- Embed chat rejects a foreign `conversationId`.

### 14.5 Seeder smoke

- Run against the test database.
- Assert the user exists, three companies are owned, and page views/sessions/metrics are
  above the documented thresholds.
- Run `--reset` and assert the counts return to the same values (deterministic).

### 14.6 Database harness

`packages/database/src/index.ts` reads `DATABASE_URL` at import time. The API test setup must
set `TEST_DATABASE_URL` and map it to `DATABASE_URL` **before** the first import, and must
refuse to run if the URL is not a test database. Add a `test` script to `apps/api/package.json`
so `turbo run test` includes it.

---

## 15. Rollout: A0–A10

| Step | Work | Files | Acceptance |
|---|---|---|---|
| **A0** | Branch, wipe, delete scripts, rewrite this doc, un-ignore it, supersede `TASKS.md` §18 | branch, `.gitignore`, `TASKS.md`, this file | clean tree; doc tracked; no `clear-db`/fixtures |
| **A1** | `users`/`auth_sessions` + ownership migrations; Drizzle types | `packages/database/drizzle/0012*`, `0013*`, `schema.ts` | `db:migrate` from empty DB; `owner_id` NOT NULL |
| **A2** | Register/login/logout/me; Argon2; Google start/callback; `jose` | `apps/api/src/auth/*`, `routes/auth.ts` | auth tests pass |
| **A3** | Auth plugin, tenancy helpers, route manifest + test | `apps/api/src/auth/plugin.ts`, `packages/database/src/tenancy.ts`, `apps/api/src/route-policy.ts` | every route has a policy |
| **A4** | Scope companies, children, chat, conversations, uploads, brand, crawler | `apps/api/src/routes/*`, `packages/ingest/src/*`, `cli.ts`, `ingest-cli.ts` | cross-tenant matrix green |
| **A5** | Embed key/domain admin auth; origin deny-by-default; voice gate | `routes/embed.ts`, `routes/voice.ts`, `widget-key-domains.ts` | origin matrix green |
| **A6** | Analytics + operations ownership; `/overview` route included | `routes/analytics.ts`, `routes/operations.ts` | 11 reads + cache-stats scoped |
| **A7** | CORS, CSRF, auth rate limits, env validation | `server.ts`, `cors.ts`, `env.ts` | preflight + CSRF tests |
| **A8** | Landing, `/overview`, login/register/onboarding, `proxy.ts`, session provider, one API client, store reset | `apps/web/**` | login → onboarding → overview works |
| **A9** | Operator CLIs `--owner`; build `seeder/`; run it | `cli.ts`, `ingest-cli.ts`, `scripts/*`, `seeder/*` | seeder produces the documented volumes |
| **A10** | Full test matrix, acceptance, docs cross-links | tests + docs | §14 green; two-user isolation proven |

A0 is this change. A1 starts only after this file is committed.

---

## 16. Non-goals and accepted risks

### 16.1 Explicit non-goals

- RBAC, roles, teams, seats, invitations, shared ownership, company transfer.
- Email verification, password reset, MFA, magic links, password change.
- Refresh tokens, "log out all devices" UI, device management.
- Per-owner quotas, billing, usage plans beyond rate limits.
- OAuth providers other than Google; SSO/SAML.
- Audit-log table; auth events in Operations.
- Operator/global tenant view for `companyId = NULL`.
- Different-registrable-domain cookie support.
- Full CSP/HSTS/security-header pass.
- Per-widget-key analytics breakdown (dimension retained, not exposed).

### 16.2 Accepted risks

- **Self-serve registration without email verification.** A typo'd or disposable email can
  create an account. The generic register response limits enumeration but cannot eliminate
  it without mail. Add verification before public launch.
- **No password reset.** A user who forgets the password cannot recover in this pass. This
  is a launch blocker for a public product.
- **No MFA.** Acceptable for the current stage; revisit before paying customers.
- **Google-only users cannot set a password.** Out of scope.
- **Shared content-addressed embedding cache.** Vectors of identical text are shared; no
  tenant rows or identifiers are returned.
- **Company-level analytics, not per-key.** Multiple keys on one company aggregate
  together. `widget_key_id` is retained for a future breakdown.

---

## 17. Change log and supersession

### v2 — 2026-10-23

- Replaced stateless HS256 JWT with opaque `auth_sessions` (revocable, no signing secret).
- Added self-serve email/password registration and Google OAuth with PKCE.
- `companies.owner_id NOT NULL`; `(owner_id, domain)` replaces global domain uniqueness.
- Dropped `crawl_jobs.owner`; made `widget_key_domains.created_by` a user FK.
- Made the embed origin allowlist deny-by-default and extended it to voice-by-key.
- Added per-company visitor hashing.
- Added the `/overview` route and the `/` landing page; no other page URLs move.
- Added the `seeder/` demo-data contract and deleted the old fixture/clear scripts.
- Recorded the 2026-10-23 clean-slate wipe; removed the bootstrap-owner step.
- Superseded `TASKS.md` §18 (which kept `crawl_jobs.owner`, accepted caller-supplied
  owners, used 403, and allowed an admin bypass).
- Corrected the v1 baseline (`dc91305`/`0008` → `ef80553`/`0011`) and the analytics route
  count (11 company reads + `cache-stats` = 12).

### v1 — historical

The previous draft (verified at `dc91305`) proposed a stateless 4-hour JWT, no revocation,
no email verification, and a `(dashboard)` route group. Its tenancy core survives; its
session, embed-origin, and frontend sections are replaced by v2.
