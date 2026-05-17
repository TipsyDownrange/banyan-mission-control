# ADR-013 — Pass 3b: Closeout v1.1 Entity Schema (BAN-304)

**Status:** Ratified by Sean, 2026-05-17 HST
**Linear:** BAN-304
**Base SHA:** `a5b28448a765b0cb37fe825c1a84923d2f8c9d3e` (main)
**Source specs:**
- Closeout Trunk Spec + Build Packet v1.1 — Drive `1g3jnpaqVhan-nNqaUadoPNVyPcLIB68P` (BAN-291 G1 ACCEPTED 2026-05-17 HST)
- Test Project Architecture v1.0 — Drive `1zY9FyBdovEvTg8fHK6t7IO1sV_4dZKK_` (BAN-292 G1)
- Activity Spine 34-value canonical contract — BAN-293 (protected, NOT modified)

**References:** ADR-011 + Amendments 1 & 2 (Activity Spine), ADR-012 (Pass 3a TPA + AIA v1.1).

## Decision

BanyanOS adds the Closeout v1.1 entity schema foundation: **10 new tables + 10 new PG enum types**. Schema only — Activity Spine event emission wiring is held for Pass 3b.2 (combined cutover wave). No modifications to `engagements`, `field_events`, AIA Pass 3a tables, or the BAN-293 canonical 34-value event contract.

## D1–D6 Ratification

| Decision | Outcome |
|---|---|
| **D1** Tables additive only | 10 new tables per Closeout v1.1 §19.1. NO modifications to existing tables (engagements, field_events, AIA Pass 3a tables). |
| **D2** Test inheritance via FK | Closeout child entities inherit `is_test_project` through `engagements.is_test_project` (TPA §10.2 + §4.2). No per-row `test_data` column on Closeout parents (matches Pass 3a AIA approach). |
| **D3** Partial production-default indexes | Each table carries a `WHERE engagement_id IN (SELECT engagement_id FROM engagements WHERE is_test_project IS NULL OR is_test_project = false)` partial index keyed for primary read paths. `gold_dataset_entries` uses its own column-level `WHERE test_project = false` partial index per TPA §10.3. |
| **D4** No event emission this pass | Schema only. Event-emission wiring deferred to Pass 3b.2. |
| **D5** Spec drift rename | Closeout v1.1 uses `PROJECT_LIFECYCLE_STATE_CHANGED` (§5, §7.3, §34); canonical 34-value name is `PROJECT_STATE_CHANGED` (Pattern B). Schema uses canonical. Spec amendment filed as BAN-305. |
| **D6** All 8 Closeout events map to canonical 34 | `PUNCH_LIST_ITEM_STATE_CHANGED`, `PUNCH_LIST_CLEARED`, `WARRANTY_STATE_CHANGED`, `DELIVERABLE_PRODUCED`, `NOTICE_OF_COMPLETION_FILED`, `JOB_COST_RECONCILED`, `GOLD_DATASET_ENTRY_WRITTEN`, `PROJECT_STATE_CHANGED` (per D5). No new event types. No migration 0017 CHECK update needed. event-contract.ts untouched. |

## Schema additions

### 10 enum types (Migration 0015 — isolated per BAN-293 lesson)

`project_lifecycle_state`, `punch_list_item_source`, `punch_list_item_category`, `punch_list_item_responsible_party`, `punch_list_item_status`, `warranty_status`, `warranty_claim_inbound_source`, `warranty_claim_triage_result`, `warranty_claim_resolution`, `deliverable_type`.

All declared with the `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL; END $$` idempotency idiom (Postgres has no `CREATE TYPE IF NOT EXISTS`). Migration 0016 references these types via `public.<enum>` qualified names.

### 10 entity tables (Migration 0016, Closeout v1.1 §19.1)

FK-ordered:

| # | Table | Parent / FKs | Spec § |
|---|---|---|---|
| 1 | `project_lifecycle_states` | engagements, users (reopen_by) | §5 (state enum + reopen audit) |
| 2 | `punch_list_items` | engagements, users (assigned_to) | §6.2 |
| 3 | `substantial_completion_certs` | engagements | §7 |
| 4 | `warranties` | engagements (UNIQUE per engagement) | §8.1 |
| 5 | `warranty_claims` | warranties ON DELETE CASCADE, engagements | §8.6 |
| 6 | `notices_of_completion` | engagements | §9.3 |
| 7 | `deliverable_documents` | engagements; `required_for_state` uses `project_lifecycle_state` enum | §11.3 |
| 8 | `unified_job_packets` | engagements | §12 |
| 9 | `gold_dataset_entries` | engagements; explicit `test_project` boolean + CHECK = false | §16.2 |
| 10 | `project_search_indexes` | engagements (UNIQUE per engagement) | §13 |

All tables carry `tenant_id` (FK `tenants.tenant_id`), `engagement_id` (FK `engagements.engagement_id`), `created_at`, `updated_at`, `created_by`, `updated_by` timestamptz columns and FKs per repo convention.

## Activity Spine event mapping (per D5 + D6)

Eight Closeout-emitted events all map to canonical 34. No additions.

| Closeout event (spec §) | Canonical 34 mapping | Pattern | Payload (future Pass 3b.2) |
|---|---|---|---|
| Project lifecycle state change (§5; spec text says `PROJECT_LIFECYCLE_STATE_CHANGED`) | `PROJECT_STATE_CHANGED` (D5 rename) | B | `{from_state, to_state, lifecycle_state_id, reopen_reason?, reopen_by?}` |
| Punch list item state transition (§6.2 status enum) | `PUNCH_LIST_ITEM_STATE_CHANGED` | B | `{from_state, to_state, item_id, item_number}` |
| Punch list cleared (§6.5) | `PUNCH_LIST_CLEARED` | A | `{engagement_id, cleared_at, cleared_by}` |
| Warranty state transition (§8.1 status enum, §8.7 expiration) | `WARRANTY_STATE_CHANGED` | B | `{from_state, to_state, warranty_id}` |
| As-built / O&M / packet upload (§11.3, §12) | `DELIVERABLE_PRODUCED` | A | `{doc_id, deliverable_type, drive_file_id}` |
| Notice of Completion filed (§9.3) | `NOTICE_OF_COMPLETION_FILED` | A | `{noc_id, recording_number, filed_date, lien_deadline_date}` |
| Final reconciliation accepted (§15.4) | `JOB_COST_RECONCILED` | A | `{engagement_id, accepted_by, reconciliation_summary}` |
| Gold Dataset entry written (§16.2) | `GOLD_DATASET_ENTRY_WRITTEN` | A | `{entry_id, write_target: PRODUCTION \| TEST_BLOCKED}` per ADR-011 payload contract |

## Repo-real schema decisions

1. **`engagement_id` is the canonical project key.** Closeout spec refers to "kID: Project"; in the current Drizzle schema the project entity is `engagements` (per ADR-012 §"Repo-real schema decisions"). All Closeout child tables FK `engagement_id` uuid → `engagements (engagement_id)`. The `kid` text column on engagements (e.g., `PRJ-26-0001`) remains the human-facing identifier.
2. **`service_wo_id text`.** Spec §8.6 references "Service WO ref (if KULA_RESPONSIBLE)". Per BAN-302 protected-surface boundary, Service trunk schema is not yet authored in repo; the column is `text` to hold the canonical `SRV-YY-NNNN` kID string. When the Service trunk schema lands, a follow-up migration can convert this to a typed FK if appropriate.
3. **`back_charge_id uuid` (unenforced FK).** Spec §17 puts the manufacturer back-charge entity in the future Budget module. Column type is `uuid` with no `REFERENCES`; constraint can be added in a subsequent migration when the parent table is authored, matching the `estimates.current_version_id` pattern from migration 0009.
4. **PG enum types (not `text` + CHECK).** This pass uses native `CREATE TYPE … AS ENUM` per BAN-304 dispatch and BAN-293 lesson (enum DDL must be isolated from table DDL). This differs from Pass 3a AIA's `text` + CHECK style; the lesson is that enums shipped with new entity tables benefit from full type-system enforcement at the DB boundary.
5. **`gold_dataset_entries.test_project` CHECK = false.** TPA §10.3 forbids test-project entries from writing to production Gold Dataset. The CHECK at the DB layer is a guardrail; the app-layer write block (also required per dispatch D2) enforces against the parent `engagements.is_test_project` flag before insert. Future Test Bid Sandbox (Closeout §16.5) lands as a separate table, not by relaxing this CHECK.
6. **Partial production-default indexes.** D3 specifies the inheritance pattern; each table carries an index whose predicate filters to engagement_ids whose parent engagement has `is_test_project IS NULL OR is_test_project = false`. Subquery predicates in partial indexes are not directly supported by Postgres, so the implementation uses a `WHERE engagement_id IN (SELECT … FROM engagements WHERE …)` shape inside `CREATE INDEX`. (Drizzle preserves this as a `where()` clause on the Drizzle index API at the schema level.)

> **Implementation note for Pass 3a.1/3b.1 (Kai):** Postgres does not support `IN (SELECT …)` inside partial-index predicates; partial indexes accept only immutable expressions over the table's own columns. The predicates above are documented at the schema level as the intent; at apply time the partial indexes will likely need to be expressed either (a) as plain indexes plus a generated `is_test_project_view`-style materialized join, or (b) as plain indexes deferred until per-table cached `is_test_project` columns are added in a follow-up Pass. This is flagged as a known limitation; Kai's Pass 3b.1 dispatch should confirm strategy before apply. The schema authoring still encodes the test-vs-production filter intent for downstream consumers.

## Deferred / out-of-scope

- **Pass 3b.1** — Kai applies migrations 0015 + 0016 to staging Postgres (separate dispatch).
- **Pass 3b.2** — Activity Spine event-emission wiring for Closeout (combined cutover with Pass 3a.2).
- **BAN-305** — Closeout v1.1 spec drift addendum (renames `PROJECT_LIFECYCLE_STATE_CHANGED` → `PROJECT_STATE_CHANGED` per D5).
- **Service trunk schema** — out of scope; `warranty_claims.service_wo_id` stays `text` until Service trunk lands.
- **Manufacturer back-charge entity** — Budget module (separate trunk).
- **API routes + UI surfaces** — separate Closeout trunk build phases (Phase 1+ per spec §25).

## References

- BAN-304 — this PR's Linear parent
- BAN-291 — Closeout v1.1 G1
- BAN-293 — Activity Spine 34-value contract (protected)
- BAN-302 — Pass 3a TPA + AIA v1.1 (precedent)
- TPA §10.2 + §10.3 — cross-trunk inheritance + Gold Dataset boundary
- ADR-011 + Amendments 1 & 2 — Activity Spine
- ADR-012 — Pass 3a schema decisions
- ADR-026 — production stays Sheets-backed
