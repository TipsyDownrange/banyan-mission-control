# ADR-011 Amendment — Activity Spine Event Consolidation + Test Data Flag (BAN-293)

**Status:** Ratified by Sean, 2026-05-16 HST  
**Amends:** ADR-011 Activity Spine Event Contract  
**Linear:** BAN-293  
**Source specs:**
- Test Project Architecture v1.0 — Drive `1zY9FyBdovEvTg8fHK6t7IO1sV_4dZKK_`
- AIA Billing + SOV v1.1 — Drive `1gnXlGY5Hgb-psJHIj4pX5Karhetkh9ya`
- Activity Spine Event Consolidation Pass v1.0 — Drive `13kP1dwI9viQcK1Twg4w0fvC3QqjOOo3Y`

## Decision

BanyanOS adopts the ratified BAN-293 consolidated Activity Spine event set: **22 new event types** added to the **11 existing live event types**, for **33 canonical Activity Spine event types** after this amendment.

The Activity Spine event table also gains `test_data boolean NOT NULL DEFAULT false`. Per Test Project Architecture §9.1, every Activity Spine event emitted from test-project context must carry `test_data = true`; production/default queries must exclude test data unless explicitly opted in.

## Existing live event types — retained

These 11 event types remain valid and are not renamed:

```text
INSTALL_STEP
FIELD_ISSUE
DAILY_LOG
FIELD_MEASUREMENT
NOTE
TM_CAPTURE
PHOTO_ONLY
PUNCH_LIST
SITE_VISIT
TESTING
WARRANTY_CALLBACK
```

## New Pattern A — discrete action events

Pattern A events are semantically distinct actions or milestones. They are not generic state transitions.

```text
PAY_APP_NOTARIZED
RETAINAGE_RELEASED
PUNCH_LIST_CLEARED
NOTICE_OF_COMPLETION_FILED
JOB_COST_RECONCILED
GOLD_DATASET_ENTRY_WRITTEN
DELIVERABLE_PRODUCED
TM_AUTHORIZATION_CONVERTED_TO_CO
TEST_PROJECT_RESET
BACK_CHARGE_APPLIED_CROSS_PROJECT
SOV_MODIFIED
HANDOFF_PROCESSED
```

Notes:
- `SOV_MODIFIED` is content mutation, not state transition.
- `HANDOFF_PROCESSED` is a one-shot accepted/rejected/accepted-with-exceptions outcome, not a from/to transition.
- `GOLD_DATASET_ENTRY_WRITTEN` records either a production write or a blocked test-data write attempt. Payload must carry `write_target: PRODUCTION | TEST_BLOCKED`.

## New Pattern B — state-machine events

Pattern B events collapse multiple lifecycle enum values into payload-driven state transitions. Writers must provide `from_state` and `to_state`.

```text
SOV_STATE_CHANGED
PAY_APP_STATE_CHANGED
LIEN_WAIVER_STATE_CHANGED
PROJECT_STATE_CHANGED
PUNCH_LIST_ITEM_STATE_CHANGED
WARRANTY_STATE_CHANGED
TM_AUTHORIZATION_STATE_CHANGED
TM_TICKET_STATE_CHANGED
TEST_PROJECT_STATE_CHANGED
BACK_CHARGE_STATE_CHANGED
```

## Payload validation rule

Consolidation is only safe if writers validate payloads at the boundary. This amendment requires an Activity Spine payload validation registry keyed by `event_type`.

Minimum writer contract:
- Pattern B events require `from_state` and `to_state` string fields.
- `GOLD_DATASET_ENTRY_WRITTEN` requires `write_target` of `PRODUCTION` or `TEST_BLOCKED`.
- Event-specific payload schemas may become stricter as each trunk lands.

This validation is an implementation guardrail, not a replacement for the canonical event-type list.

## Surface-emission split

During transition, some existing field-side events coexist with new trunk-side lifecycle events. To avoid double-writes:

- Field App emits field-side capture events such as `PUNCH_LIST`, `WARRANTY_CALLBACK`, and `TM_CAPTURE`.
- Mission Control / trunk workflows emit trunk-side lifecycle events such as `PUNCH_LIST_ITEM_STATE_CHANGED`, `WARRANTY_STATE_CHANGED`, and `TM_TICKET_STATE_CHANGED`.
- A workflow must not emit both the field-side capture event and the trunk-side lifecycle event for the same semantic action unless a later packet explicitly defines that bridge.

## Repo-real migration decision

The current Mission Control Drizzle schema stores `field_events.event_type` as `text`, not a Postgres enum. Therefore BAN-293 migration uses:

1. an isolated `test_data` column migration; and
2. an isolated `CHECK` constraint migration for the 33 canonical event values.

This avoids pretending an `ALTER TYPE` target exists in the checked-in schema, while still enforcing the ratified event contract at the database boundary. If a future packet introduces a physical Postgres enum, it must be a separate data migration.

## Query default

Production/default Activity Spine queries must filter out test events:

```sql
WHERE test_data = false
```

Opt-in test visibility must be explicit, e.g. `include_test_data=true`.

## Migration deliverables

- `db/migrations/0011_ban293_activity_spine_test_data.sql`
- `db/migrations/0012_ban293_activity_spine_event_type_check.sql`
- `lib/activity-spine/event-contract.ts`

## Acceptance notes

This amendment intentionally does not implement AIA Billing, Closeout, Test Project APIs, PDF generation, Textura CSV, Proof RON integration, or QBO write-back. It only lands the shared Activity Spine schema contract needed by those trunks.

## Amendment 2 — Legacy Retention of wo_completion (2026-05-17 HST)

**Status:** Ratified by Sean, 2026-05-17 HST
**Trigger:** Pass 2.5 BQS §17 STOP — pre-migration verification discovered 505 existing field_events rows with event_type='wo_completion', outside the 33-value canonical list.
**Decision:** Add 'wo_completion' as 34th canonical value, classified as legacy-retained transitional. Total canonical event types = 11 existing live + 1 legacy transitional + 22 new BAN-293 = 34.
**Service trunk gap:** The consolidation pass missed WORK_ORDER_STATE_CHANGED Pattern B event for Service WO state-machine transitions. Per Codex Service trunk audit 2026-04-21 (Drive 1BvGB2oyYFxG3Z84qwPgvTESwvhATWiZM), Service WO state machine has 11 states. WORK_ORDER_STATE_CHANGED Pattern B event addition is deferred to Service trunk re-author packet (Wave 3+); that packet will also normalize existing wo_completion rows to the new pattern.
**Migration impact:** Migration 0012 updated to include 'wo_completion' in the CHECK constraint VALUES list before first application. No new migration file added — 0012 modified in place since it had not yet applied anywhere.
