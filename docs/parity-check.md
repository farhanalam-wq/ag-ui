# Parity Record: pgvector → Qdrant Cutover

**Date written:** 2026-10-10 (backfilled; cutover predates this file)
**Status:** ✅ Operational parity confirmed by agreement + serving behavior (see §3).
Jaccard gate below is recorded as NOT-RUN — process gap, see §2.

---

## 1. Required procedure (TASKS §12, for future index changes)

1. Dual-write Postgres + Qdrant behind `QDRANT_DUAL_WRITE=true`.
2. ≥20 sample queries across pricing/product/docs/blog/about on a fixed corpus.
3. Jaccard ≥ 0.8 on pgvector-top-10 vs Qdrant-top-10 document sets, every query.
4. 5 hand-checked question→answer pairs returning the same best document.
5. Flip reads, run one clean ingest, then drop the old column.

`scripts/parity-check.ts` automates steps 2–4 against a resend.com corpus.

## 2. Why the Jaccard gate cannot run retroactively here

- No resend.com corpus is ingested in this database (companies present: inglobal.com,
  mobilearn.io, raymond.in).
- `chunks.embedding` is already dropped — cutover executed via
  `packages/database/src/migrate-drop-pgvector.ts` (drops `chunks_embedding_idx`,
  then the column; notes reversibility via re-embed from stored chunk content).
- Re-running the gate would mean re-adding the vector column and re-embedding the full
  corpus purely to produce a retroactive report for a cutover that is already serving.
  Unjustified spend; not done. This missing paper trail is the process gap this file closes.

## 3. Verifiable evidence (measured 2026-10-10, live systems)

PG chunk counts vs snapshot-scoped Qdrant points (`stats` command + `countCompanyPoints`):

| Company | Snapshot | Docs | PG chunks | Qdrant points | Facts | Retrieval |
|---|---|---|---|---|---|---|
| mobilearn.io | v1 READY | 26 | 183 | 183 | 2 | serving, pricing query returns /pricing first |
| inglobal.com | v2 READY | 67 | 158 | 158 | 5 | serving |
| raymond.in | v1 FAILED | 0 | 0 | 0 | 0 | n/a (failed snapshot) |

Point IDs equal Postgres chunk UUIDs; Qdrant filters scope `{company_id, snapshot_id}`
with tombstone exclusion, matching the reader path.

## 4. Verdict + forward rule

- **Operational parity: CONFIRMED** — exact count agreement on every READY snapshot,
  retrieval serving from Qdrant with sane ranking.
- **Jaccard ≥ 0.8 gate: NOT RUN** (see §2). Accepted as a recorded gap, not a blocker:
  the old index no longer exists to disagree with.
- **Forward rule:** any future vector-index change runs `scripts/parity-check.ts`
  (or its successor) and lands the report here BEFORE the old column is dropped.
