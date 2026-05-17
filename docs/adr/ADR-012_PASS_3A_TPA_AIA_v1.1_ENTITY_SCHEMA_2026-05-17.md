# ADR-012 — Pass 3a: TPA + AIA v1.1 Entity Schema (BAN-302)

**Status:** Ratified by Sean, 2026-05-17 HST
**Linear:** BAN-302
**Base SHA:** 3c595bb1057bfc4b36882985d4ca106eebe989c1 (main)
**Source specs:**
- Test Project Architecture v1.0 — Drive `1zY9FyBdovEvTg8fHK6t7IO1sV_4dZKK_` (BAN-292 G1 ACCEPTED)
- AIA Billing + SOV Trunk Spec v1.1 — Drive `1gnXlGY5Hgb-psJHIj4pX5Karhetkh9ya` (BAN-290 G1 ACCEPTED)

**Reference:** ADR-011 + Amendments 1 & 2 (BAN-293 Activity Spine event contract — protected, not modified by this ADR).

## Decision

BanyanOS adds the Test Project Architecture (TPA) and AIA Billing v1.1 schema foundation: **3 columns on the existing `engagements` table + 16 new tables (1 TPA audit + 15 AIA conceptual entities per AIA §14.1)**. The Activity Spine event contract is NOT modified — all TPA and AIA event semantics map to the existing canonical 34 values from BAN-293.

## D1–D5 Ratification Table

| Decision | Ratified outcome |
|---|---|
| **D1** TPA structure | Flag on existing `engagements` table per TPA §3.1 + §11 (NOT separate test-entity hierarchy). |
| **D2** engagements column additions | Authorized: `is_test_project boolean NOT NULL DEFAULT false`, `test_project_created_by uuid` (FK users), `test_project_purpose text`. CHECK: `is_test_project = false OR test_project_created_by IS NOT NULL`. |
| **D3** TPA create/delete events | Collapse to existing `TEST_PROJECT_STATE_CHANGED` Pattern B (from_state/to_state encodes lifecycle). No new event types. NO modifications to event-contract.ts. |
| **D4** AIA event mapping | Every AIA-emitted event from AIA §14.3 maps to one of canonical 34. No additions. (See §"Activity Spine event mapping" below.) |
| **D5** Linear issue | BAN-302 created with locked scope, acceptance criteria, and dispatch authorization. |

## Schema additions

### TPA — engagements table additions (Migration 0013)

| Column | Type | Notes |
|---|---|---|
| `is_test_project` | `boolean NOT NULL DEFAULT false` | Single canonical flag; child entities inherit per TPA §4.2. |
| `test_project_created_by` | `uuid` FK `users.user_id` | Required-if-true via CHECK constraint. |
| `test_project_purpose` | `text` | Optional free-text description. |

Plus:
- `engagements_test_project_created_by_required_check` — `(is_test_project = false) OR (test_project_created_by IS NOT NULL)`, added NOT VALID then VALIDATED so existing rows (all `is_test_project = false` by default) pass.
- Partial production-default index `engagements_production_default_idx` on `(tenant_id, status) WHERE is_test_project = false` — matches the BAN-293 pattern from `field_events`.

### TPA — `test_project_resets` table (Migration 0013, TPA §6.5 + §11.2)

Audit log for reset operations. One row per reset; `child_records_deleted` jsonb captures per-entity delete counts. FK to `engagements (engagement_id) ON DELETE CASCADE` so a hard-deleted test project (TPA §8.1 `test_project.delete`) cleans up its own audit log.

### AIA v1.1 — 15 tables (Migration 0014, AIA §14.1)

Created in FK-dependency order:

| # | Table | Parent / FKs | Spec §  |
|---|---|---|---|
| 1 | `sov_versions` | engagements | §4 (state machine) |
| 2 | `schedule_of_values` | sov_versions ON DELETE CASCADE | §4 (line items) |
| 3 | `billing_format_config` | engagements (UNIQUE per engagement) | §5.2 |
| 4 | `deposit_terms` | engagements (UNIQUE per engagement) | §6.4 |
| 5 | `tm_authorizations` | engagements, schedule_of_values | §11.2 |
| 6 | `pay_applications` | engagements, sov_versions | §7 |
| 7 | `pay_app_line_items` | pay_applications ON DELETE CASCADE, schedule_of_values, tm_authorizations | §7.2 (G703 lines) |
| 8 | `pay_app_states` | pay_applications ON DELETE CASCADE | §7 (state history) |
| 9 | `notarization_sessions` | engagements, pay_applications | §8 (Proof RON) |
| 10 | `lien_waivers` | engagements, pay_applications, notarization_sessions | §10 |
| 11 | `cash_receipts` | engagements, pay_applications | §9 |
| 12 | `retainage_holdings` | engagements, pay_applications ON DELETE CASCADE, pay_app_line_items ON DELETE CASCADE | §9.3 |
| 13 | `handoff_validations` | engagements, sov_versions | §13 |
| 14 | `tm_tickets` | tm_authorizations ON DELETE CASCADE, engagements, pay_applications | §11.3 |
| 15 | `textura_submissions` | engagements, pay_applications ON DELETE CASCADE | §7.10 |

All 15 tables carry `tenant_id` FK `tenants(tenant_id)` (matches `engagements` multi-tenant pattern) and `created_at` / `updated_at` timestamptz defaults. State-machine columns enforce CHECK constraints with the spec's enumerated values, added NOT VALID then VALIDATED.

### Test-vs-production inheritance

Per TPA §4.2 + AIA §14.2: every AIA child entity inherits test-vs-production status from its parent `engagements.is_test_project` flag. NO per-entity `test_data` column on the 15 AIA tables. The only `test_data` column in the codebase remains on `field_events` (BAN-293) because Activity Spine queries are cross-project and need explicit row-level filtering. AIA queries always join through engagements, so `WHERE engagements.is_test_project = false` is the canonical filter.

## Activity Spine event mapping (per D4)

Every AIA-emitted event from AIA §14.3 maps to one of the canonical 34 values from BAN-293. No additions.

| AIA event (spec §14.3) | Canonical 34 mapping | Pattern | Payload contract |
|---|---|---|---|
| SOV state transition | `SOV_STATE_CHANGED` | Pattern B | `{from_state, to_state, sov_version_id, source_kind, manager_override_by?}` |
| SOV content mutation (CO/TM driven) | `SOV_MODIFIED` | Pattern A | `{sov_version_id, source_ref_id, source_ref_type}` |
| Pay app state transition | `PAY_APP_STATE_CHANGED` | Pattern B | `{from_state, to_state, pay_app_id}` |
| Notarization complete | `PAY_APP_NOTARIZED` | Pattern A | `{pay_app_id, session_id, notary_name}` |
| Retainage released | `RETAINAGE_RELEASED` | Pattern A | `{holding_id, released_pay_app_id, amount_held}` |
| Lien waiver state transition | `LIEN_WAIVER_STATE_CHANGED` | Pattern B | `{from_state, to_state, waiver_id, waiver_type}` |
| Handoff outcome | `HANDOFF_PROCESSED` | Pattern A | `{validation_id, mode, exceptions?}` |
| T&M Authorization state transition | `TM_AUTHORIZATION_STATE_CHANGED` | Pattern B | `{from_state, to_state, tm_auth_id}` |
| T&M Ticket state transition | `TM_TICKET_STATE_CHANGED` | Pattern B | `{from_state, to_state, ticket_id}` |
| T&M Authorization → CO conversion | `TM_AUTHORIZATION_CONVERTED_TO_CO` | Pattern A | `{tm_auth_id, converted_to_co_ref}` |

### TPA event mapping (per D3)

| TPA spec §9.4 wording | Canonical 34 mapping | Pattern | Payload |
|---|---|---|---|
| `TEST_PROJECT_CREATED` | `TEST_PROJECT_STATE_CHANGED` | Pattern B | `{from_state: null, to_state: 'active', engagement_id, created_by}` |
| `TEST_PROJECT_RESET` | `TEST_PROJECT_RESET` (already Pattern A in canonical 34) | Pattern A | `{reset_id, engagement_id, reset_by, child_records_deleted}` |
| `TEST_PROJECT_DELETED` | `TEST_PROJECT_STATE_CHANGED` | Pattern B | `{from_state: 'active', to_state: 'deleted', engagement_id, deleted_by}` |

TPA spec §9.4 names `TEST_PROJECT_CREATED` and `TEST_PROJECT_DELETED` as discrete events. Per D3 ratification (Option 1), these collapse into the existing Pattern B `TEST_PROJECT_STATE_CHANGED` event by using `from_state` / `to_state` to encode the lifecycle. The spec text itself is filed as a documentation-drift follow-up (BAN-303 spec drift, separate dispatch).

## Repo-real schema decisions

1. **`engagements` is the project entity.** The current Drizzle schema names the project entity `engagements` (not `projects`). TPA `kID` references resolve to `engagements.engagement_id` (uuid PK) — the canonical key. AIA child tables use `engagement_id` FK.
2. **CHECK constraints added `NOT VALID` then `VALIDATE`.** Matches the BAN-293 / Migration 0012 pattern: avoid full-table locks during constraint validation on production-size tables. Validation completes inside the same migration since these tables are empty pre-apply.
3. **`schedule_of_values` is the line-item table** (per AIA §14.1 row 1 wording: "SOV line items (locked + drafts)"), with `sov_versions` as the header. Each line FKs its `sov_version_id` ON DELETE CASCADE so dropping a retired version cleans up its lines.
4. **Numeric precision** = `numeric(14,2)` for dollar amounts (12 digits left of decimal, 2 right — handles AIA contracts up to $999 billion). `numeric(5,2)` for percentages and rates with cents. `numeric(10,2)` for per-hour rates and per-session costs.
5. **Idempotent migrations.** `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` before each `ADD CONSTRAINT`. Safe to re-apply.

## Deferred / out-of-scope

- **Closeout v1.1 entities** — BAN-291 pending Sean G1; will land as Pass 3b.
- **WORK_ORDER_STATE_CHANGED Pattern B event** — Service trunk re-author packet (Wave 3+); will also normalize the 505 legacy `wo_completion` rows.
- **TPA spec §9.4 documentation drift** — needs addendum noting CREATED/DELETED collapse to TEST_PROJECT_STATE_CHANGED Pattern B post-BAN-293. Filed as BAN-303 (Kai lane).
- **Migration application to staging Postgres** — Pass 3a.1 Kai dispatch, separate.
- **API routes + UI surfaces for TPA and AIA** — separate trunk build phases.
- **QBO write-back** — explicitly out per AIA §9.4.

## References

- BAN-302 — this PR's Linear parent (locked scope, acceptance criteria)
- BAN-293 — Activity Spine event contract (foundation; protected)
- BAN-292 — TPA spec G1 ratification
- BAN-290 — AIA v1.1 spec G1 ratification
- BAN-291 — Closeout v1.1 G1 (pending; Pass 3b)
- ADR-026 — production stays Sheets-backed until explicit cutover
- ADR-011 + Amendments 1 & 2 — Activity Spine event contract
