# ADR-013 — Pass 3b: Closeout v1.1 Entity Schema (BAN-304)

**Status:** Ratified by Sean, 2026-05-17 HST
**Linear:** BAN-304
**Base SHA:** 2a14b495632aa2914fdbb5a798dec68f5ed02636 (main)
**Source specs:**
- Closeout Trunk v1.1 — Drive `1g3jnpaqVhan-nNqaUadoPNVyPcLIB68P` (BAN-291 G1 ACCEPTED 2026-05-17)
- Test Project Architecture v1.0 — Drive `1zY9FyBdovEvTg8fHK6t7IO1sV_4dZKK_` (BAN-292 G1 ACCEPTED) — §10.2 cross-trunk compliance

**References:** ADR-011 + Amendments 1 & 2 (BAN-293 Activity Spine event contract — protected, NOT modified); ADR-012 (Pass 3a TPA + AIA precedent).

## Decision

BanyanOS adds the Closeout v1.1 schema foundation: **10 new tables + 10 native PostgreSQL ENUM types**. The Activity Spine event contract is NOT modified — every Closeout-emitted event maps to the existing canonical 34 values per BAN-293, with the spec's `PROJECT_LIFECYCLE_STATE_CHANGED` canonised as the existing `PROJECT_STATE_CHANGED` Pattern B value (D5).

All ten entity tables inherit test-vs-production status from `engagements.is_test_project` via the FK to `engagements` (TPA §10.2 inheritance, mirrors ADR-012 D2). One documented exception denormalises the flag: `gold_dataset_entries.test_project` (D2 carve-out — explained below). No app code emits to these tables in this pass (D4 — deferred to Pass 3b.2 combined cutover wave).

## D1–D6 Ratification Table

| Decision | Ratified outcome |
|---|---|
| **D1** Structure | 10 fully additive tables per Closeout v1.1 §19.1. NO modifications to existing tables (`engagements`, `field_events`, AIA Pass 3a tables, etc.). |
| **D2** Test-project inheritance | Children inherit `is_test_project` via FK to `engagements` (TPA §10.2). No per-row `test_data` on parent entities. Exception: `gold_dataset_entries.test_project` denormalises the flag because gold-dataset consumers (ML, benchmarks) need it without a JOIN; app layer keeps the two flags consistent. |
| **D3** Partial production-default indexes | `gold_dataset_entries_production_default_idx WHERE test_project = false` — only table in this pass carrying the denormalised flag. Other tables get standard composite indexes on `(tenant_id, engagement_id, …)`; production-default filtering happens at query time via JOIN to `engagements_production_default_idx`. |
| **D4** Activity Spine emission code | NO emission code added this pass. Schema-only foundation. Emission paths deferred to Pass 3b.2 combined cutover. |
| **D5** Spec event-name conflict | Closeout v1.1 spec uses `PROJECT_LIFECYCLE_STATE_CHANGED` in three places. Canonical name per BAN-293 Pattern B is `PROJECT_STATE_CHANGED`. **USE `PROJECT_STATE_CHANGED`.** Spec amendment filed as BAN-305 separately. |
| **D6** Migration 0015 CHECK update | NOT NEEDED. 7 of 8 Closeout-derived events are already in the BAN-293 canonical 34. `PROJECT_LIFECYCLE_STATE_CHANGED` → `PROJECT_STATE_CHANGED` per D5. No new `event_type` values introduced; migration 0012 CHECK constraint unchanged. |

## Schema additions

### 10 native enum types (Migration 0015)

Migration 0015 introduces ten Postgres `CREATE TYPE` enums in an isolated file. This is a **deliberate divergence from the 0012-0014 text + CHECK pattern**; see "Pattern divergence rationale" below.

| Enum type | Values |
|---|---|
| `project_lifecycle_state` | `IN_CLOSEOUT`, `SUBSTANTIALLY_COMPLETE`, `FINAL_COMPLETE`, `ARCHIVED` |
| `punch_list_item_source` | `FIELD_ISSUE`, `SUBSTANTIAL_WALKTHROUGH`, `GC_TRANSMITTAL`, `OWNER_WALKTHROUGH`, `ARCHITECT_WALKTHROUGH`, `INTERNAL_QA` |
| `punch_list_item_category` | `GLASS`, `FRAMING`, `HARDWARE`, `SEALANT`, `FINISH`, `CLEANING`, `DOCUMENTATION`, `OTHER` |
| `punch_list_responsible_party` | `KULA`, `OTHER_TRADE`, `GC`, `DISPUTED` |
| `punch_list_item_status` | `NEW`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `SIGNED_OFF`, `DISPUTED`, `DEFERRED_TO_WARRANTY` |
| `warranty_status` | `ACTIVE`, `EXPIRED`, `PARTIALLY_EXPIRED` |
| `warranty_claim_inbound_source` | `EMAIL`, `PHONE`, `PORTAL`, `FIELD_DISCOVERY` |
| `warranty_claim_triage_result` | `KULA_RESPONSIBLE`, `MANUFACTURER_RESPONSIBLE`, `OTHER_TRADE_RESPONSIBLE`, `OUT_OF_WARRANTY`, `DISPUTED` |
| `warranty_claim_resolution` | `COMPLETED`, `REFERRED`, `WRITTEN_OFF`, `UNRESOLVED` |
| `deliverable_type` | `AS_BUILT_DRAWING`, `OM_MANUAL_COMPONENT`, `OM_MANUAL_COMPLETE`, `UNIFIED_JOB_PACKET`, `OTHER` |

Idempotency: each `CREATE TYPE` is wrapped in a `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` block so reruns are safe (Postgres `CREATE TYPE` does not natively support `IF NOT EXISTS`).

### 10 entity tables (Migration 0016)

In FK-dependency order:

| # | Table | Spec § | Key columns | FK parents |
|---|---|---|---|---|
| 1 | `project_lifecycle_states` | §16.2 | `state` (enum), `entered_at`, `exited_at`, `reopen_reason`, `reopen_by` | `engagements` (cascade) |
| 2 | `punch_list_items` | §6.2 | `item_number`, `source`, `category`, `responsible_party`, `status`, evidence JSONB columns | `engagements` |
| 3 | `substantial_completion_certs` | §7 | `walkthrough_date`, `attendees`, `per_system_completion`, signoff evidence | `engagements` |
| 4 | `warranties` | §8.1 | `start_date`, `scope_warranties`, `status` (enum) | `engagements` |
| 5 | `warranty_claims` | §8.6 | inbound metadata, `triage_result`, `service_wo_id` (text — Sheets per ADR-026), `back_charge_id` (placeholder uuid), `resolution` | `engagements`, `warranties` (cascade) |
| 6 | `notices_of_completion` | §11.3 | `filed_date`, `recording_number`, `lien_deadline_days int default 45`, `lien_deadline_date` | `engagements` |
| 7 | `deliverable_documents` | §9.3 | `deliverable_type` (enum), `drive_file_id`, `version`, `required_for_state` (enum, nullable) | `engagements` |
| 8 | `unified_job_packets` | §13 | `template_version`, `drive_file_id`, `sections_included` JSONB | `engagements` |
| 9 | `gold_dataset_entries` | §12 | 7 JSONB data columns, `test_project bool` (D2 exception) | `engagements` |
| 10 | `project_search_indexes` | §5 | `index_payload text`, `last_indexed_at`, `index_version` | `engagements` (cascade) |

All ten carry the standard infra columns: `tenant_id` (FK `tenants`), `engagement_id` (FK `engagements`), `created_at`, `updated_at`, `created_by` (FK `users`), `updated_by` (FK `users`).

### Notable schema-level decisions

- **`punch_list_items.responsible_party` includes `KULA`.** The Closeout v1.1 spec authoritatively names KULA as a responsible-party value because it is the canonical "our company" enum value in this domain. This is a schema-level domain enum, not a hardcoded production identifier in code logic — `AGENTS.md`'s "no hardcoded production logic" rule targets app-layer references, not spec-locked domain enum values. Logged for future reflection.
- **`warranty_claims.service_wo_id` is `text`, not `uuid REFERENCES`.** Per ADR-026, service work orders remain in Google Sheets in production; there is no Postgres FK target. App layer validates the `SRV-` prefix on write.
- **`warranty_claims.back_charge_id` is a placeholder `uuid` with no `REFERENCES`.** The parent "Budget module" table will be authored in a later Trunk; the column is nullable so historical rows are unaffected when the FK is added.
- **`deliverable_documents.required_for_state` reuses the `project_lifecycle_state` enum** (e.g. an O&M manual may be `required_for_state = 'SUBSTANTIALLY_COMPLETE'`). A partial index excludes rows where the value is NULL.
- **`project_lifecycle_states` carries a `reopen_pair_check` CHECK** ensuring `reopen_reason` and `reopen_by` are both present or both absent. Spec §16.2 calls out the audit requirement.

## Pattern divergence rationale — text + CHECK vs native enum

Migrations 0012 (BAN-293 Activity Spine), 0013 (TPA), and 0014 (AIA v1.1) all use `text` columns with `CHECK (col IN (...))` constraints rather than `CREATE TYPE ... AS ENUM`. The BAN-293 0012 header explicitly states the choice: *"field_events.event_type is text in Drizzle, so enforce the ratified 33-value contract with an isolated CHECK constraint instead of ALTER TYPE."*

Pass 3b deliberately adopts native Postgres enums for Closeout. Rationale per BAN-304 dispatch:

1. **Closeout enum sets are small (3-8 values), domain-stable, and unlikely to churn.** The 34-value Activity Spine list grew during BAN-293 work; an enum would have made every addition a separate migration. Closeout's lifecycle states, punch-list categories, warranty triage outcomes are spec-locked and not expected to expand often.
2. **Native enums give Drizzle stronger TypeScript types.** App code reading `punch_list_items.status` will get a union type with the seven literal values, not `string`. CHECK constraints produce `string` in Drizzle.
3. **Native enum reuse across columns.** `deliverable_documents.required_for_state` reuses `project_lifecycle_state` directly. With a CHECK pattern we'd duplicate the value list in two CHECK clauses.
4. **The BAN-293 isolation lesson still applies in spirit.** ALTER TYPE ADD VALUE cannot run in the same transaction as DDL that consumes the type — so future Closeout enum extensions will live in their own isolated migrations, just as BAN-293's event-type evolution does.

The cost of this divergence is two migration patterns coexisting in one repo. ADR-013 documents the choice so future passes can decide explicitly which pattern to apply per scope.

## Activity Spine event mapping (D6 confirmation)

Closeout v1.1 references 8 event types. All map to the BAN-293 canonical 34 — no `field_events_event_type_ban293_check` change needed.

| Closeout reference | Canonical (BAN-293) | Pattern |
|---|---|---|
| `PUNCH_LIST_CLEARED` | `PUNCH_LIST_CLEARED` | A — discrete action |
| `NOTICE_OF_COMPLETION_FILED` | `NOTICE_OF_COMPLETION_FILED` | A |
| `GOLD_DATASET_ENTRY_WRITTEN` | `GOLD_DATASET_ENTRY_WRITTEN` | A |
| `DELIVERABLE_PRODUCED` | `DELIVERABLE_PRODUCED` | A |
| `PUNCH_LIST_ITEM_STATE_CHANGED` | `PUNCH_LIST_ITEM_STATE_CHANGED` | B — state machine |
| `WARRANTY_STATE_CHANGED` | `WARRANTY_STATE_CHANGED` | B |
| `BACK_CHARGE_APPLIED_CROSS_PROJECT` | `BACK_CHARGE_APPLIED_CROSS_PROJECT` | A |
| `PROJECT_LIFECYCLE_STATE_CHANGED` (spec) | **`PROJECT_STATE_CHANGED`** (canon) | B — D5 rename |

Spec amendment for D5 filed as BAN-305 (not in this PR).

## Protected surfaces (not modified)

- `db/migrations/0000`–`0014` — frozen.
- `engagements` table schema — not modified (Pass 3a's three TPA columns remain authoritative).
- `field_events` table schema and `field_events_event_type_ban293_check` constraint — not modified (BAN-293 contract is the canon).
- All API routes, FA and MC capture/render code — schema-only this pass per D4.
- `docs/investigations/*` BAN-307 outputs — read-only reference.

## STOP-condition assessment

| STOP condition | Triggered? | Notes |
|---|---|---|
| engagements schema drift vs migrations 0013/0014 | **No** — `engagements` reads at 2a14b495 match the post-0013/0014 expected shape (verified via `db/schema.ts` lines 569-612). |
| Spec column conflicts with existing engagements columns | **No** — Closeout v1.1 §19.1 introduces only new tables; no engagement column additions. |
| Service trunk `SRV-` kID reference ambiguous | **No (handled)** — `warranty_claims.service_wo_id` is `text`, not a Postgres FK, per ADR-026. App-layer validation. |
| Migration 0014 patterns differ from BAN-302 documentation | **No** — 0014 review confirms the patterns described in ADR-012. |
| Test fixture data would require touching `field_events` or `engagements` rows | **No** — tests are schema-shape only (SQL-text assertions); no fixture rows written to protected tables. |
| Any `event_type` beyond the 34 needed | **No** — D5/D6 confirm no additions; existing `PROJECT_STATE_CHANGED` covers the spec's lifecycle event. |

## Lifecycle

1. ADR-013 authored alongside migrations 0015 + 0016 in PR `claude/ban-pass3b-closeout-v11-entity-schema` (this PR).
2. Tests in `__tests__/closeout-pass3b-*.test.ts` — schema-shape + idempotency assertions (target ≥30 across ≥4 suites).
3. Sean PR audit + squash-merge.
4. Pass 3b.2 (later dispatch) — wire emission code, app routes, and FA/MC consumers.
