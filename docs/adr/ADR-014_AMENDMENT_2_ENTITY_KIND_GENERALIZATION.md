# ADR-014 — Amendment 2: Activity Spine entity-kind generalization (AIA → AIA + Closeout)

**Status:** Accepted
**Date:** 2026-05-17
**Parent ADR:** ADR-014 — WO Postgres Write-Path Authorization
**Prior amendment:** ADR-014 Amendment 1 (canonical Postgres Activity Spine emission helper, BAN-309)
**Linear:** BAN-309 (Pass 3a.2) + BAN-311 (Pass 3b.2); architectural follow-up file post-merge

## Context

BAN-309 PR 1 introduced the canonical Postgres Activity Spine emission helper
at `lib/activity-spine/emit.ts` (ADR-014 Amendment 1). The helper exposed:

- A `ActivitySpineAiaEntityKind` string union — AIA-scoped, 12 members
  (engagement, pay_application, sov_version, schedule_of_values,
  tm_authorization, tm_ticket, lien_waiver, retainage_holding,
  handoff_validation, test_project_reset, notarization_session,
  cash_receipt).
- An input interface with `entity_type` / `entity_id` (the field_events
  scope columns) plus `aia_entity_kind` / `aia_entity_id` (the AIA entity
  being acted on, stored in metadata).
- A BAN-309 D8 protection: emit.ts is "consume-only" — downstream trunks
  may not amend the helper's signature or contract.

When BAN-311 (Closeout) shipped, its emissions could not fit the AIA-only
union. The workaround across all 17 Closeout routes:

- `aia_entity_kind: 'engagement'` on every Closeout emission (every Closeout
  row FKs to an engagement, so this was faithful to "what scope is this in"
  but lossy about "what is this row").
- `aia_entity_id: <engagement_id>` — same engagement-stamping.
- `metadata.closeout_entity_kind`: the real Closeout kind
  (`'punch_list_item' | 'warranty' | 'engagement' | …`).
- `metadata.closeout_entity_id`: the real Closeout row UUID.

The workaround compounded structurally: every future emission trunk
(Service expansion, Field expansion) would inherit the same shadow-tagging
unless the foundation was fixed. Consumers had to know to read
`metadata.closeout_entity_*` instead of the canonical `metadata.aia_entity_*`
keys for Closeout emits, and the canonical key carried no real information
beyond "this is an engagement scope."

Stop-report D8 (BAN-309) committed to revisiting the protection scope
before Closeout's third PR landed. This amendment is that revisit.

## Decision

ADR-014 Amendment 2 supersedes BAN-309 D8 emit.ts protection **strictly in
the scope** of:

1. Renaming the entity-kind union and extending it additively to include
   Closeout kinds.
2. Renaming the helper's input fields so the metadata keys are
   trunk-agnostic.
3. Removing the `metadata.closeout_entity_*` workaround from new emits.

All other BAN-309 D8 contracts remain in effect: atomic-tx semantics,
validator integrity, no `field_events` INSERT bypassing the helper, no
`event_type` CHECK amendments.

### Type rename + union extension (19 members, additive)

`ActivitySpineAiaEntityKind` → `ActivitySpineEntityKind`.

AIA (12, **byte-identical** to Amendment 1 — preserved verbatim):

```text
engagement
pay_application
sov_version
schedule_of_values
tm_authorization
tm_ticket
lien_waiver
retainage_holding
handoff_validation
test_project_reset
notarization_session
cash_receipt
```

Closeout (7 new; `engagement` is reused from the AIA set for
`project_lifecycle` emissions — no duplicate entry):

```text
punch_list_item
warranty
notice_of_completion
deliverable_document
unified_job_packet
substantial_completion_cert
gold_dataset_entry
```

### Input-field rename

The Amendment 1 input interface conflated "scope of the field_events row"
with "entity being acted on" by using the same `entity_type` / `entity_id`
names as the field_events columns themselves while shadowing the AIA entity
identity into `aia_entity_*`. Amendment 2 makes the split explicit:

| Amendment 1                 | Amendment 2          | Maps to                                  |
| --------------------------- | -------------------- | ---------------------------------------- |
| `entity_type`               | `scope_entity_type`  | `field_events.entity_type` column        |
| `entity_id`                 | `scope_entity_id`    | `field_events.entity_id` column          |
| `aia_entity_kind`           | `entity_kind`        | `field_events.metadata.entity_kind`      |
| `aia_entity_id`             | `entity_id`          | `field_events.metadata.entity_id`        |

The metadata keys written by the helper are now `entity_kind` /
`entity_id` (the prior `aia_entity_kind` / `aia_entity_id` metadata keys
are retired for **new** emits — historical rows on staging still carry the
old keys; see "Consequences" below).

### Closeout call-site cleanup

All 17 Closeout routes have been migrated from the workaround to canonical
emit calls:

| Route file                                                                         | Before (Amendment 1 workaround)                                                                                    | After (Amendment 2 canonical)                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `app/api/closeout/punch-list-items/[id]/transition/route.ts` (PUNCH_LIST_CLEARED)  | `aia_entity_kind: 'engagement'`, `metadata.closeout_entity_kind: 'engagement'`                                     | `entity_kind: 'engagement'`, `entity_id: engagementId`                                   |
| `app/api/closeout/engagements/[id]/reconciliation/accept/route.ts` (JOB_COST_RECONCILED) | same workaround                                                                                                | `entity_kind: 'engagement'`, `entity_id: engagementId`                                   |
| `app/api/closeout/notices-of-completion/route.ts` (NOTICE_OF_COMPLETION_FILED)     | same workaround                                                                                                    | `entity_kind: 'notice_of_completion'`, `entity_id: noc_id`                               |
| `app/api/closeout/deliverable-documents/route.ts` (DELIVERABLE_PRODUCED)           | same workaround                                                                                                    | `entity_kind: 'deliverable_document'`, `entity_id: deliverable_id`                       |
| `app/api/closeout/unified-job-packets/route.ts` (DELIVERABLE_PRODUCED)             | same workaround                                                                                                    | `entity_kind: 'unified_job_packet'`, `entity_id: packet_id`                              |
| `app/api/closeout/substantial-completion-certs/route.ts` (DELIVERABLE_PRODUCED + PROJECT_STATE_CHANGED co-fire) | same workaround                                                                                                    | DELIVERABLE_PRODUCED → `entity_kind: 'substantial_completion_cert'`, `entity_id: cert_id`; PROJECT_STATE_CHANGED → `entity_kind: 'engagement'` |
| `lib/closeout/execute-state-transition.ts` (executor: PATTERN B for punch_list_item / warranty; PROJECT_STATE_CHANGED for project_lifecycle) | same workaround                                                                                                    | Per-entity real `entity_kind` (`punch_list_item`, `warranty`, `engagement`) with the real row pkValue as `entity_id` |
| `lib/closeout/gold-dataset.ts` (GOLD_DATASET_ENTRY_WRITTEN)                        | same workaround                                                                                                    | `entity_kind: 'gold_dataset_entry'`; `entity_id` = `goldEntryId` (PRODUCTION) or fallback to `engagementId` (TEST_BLOCKED, no row written per §16.4) |

AIA routes are pure field-name renames (`aia_entity_kind` → `entity_kind`,
`aia_entity_id` → `entity_id`, `entity_type` → `scope_entity_type`,
`entity_id` → `scope_entity_id`) — no behavior change.

## Consequences

### Workaround retired

Closeout no longer pays the Amendment 1 shadow-tagging tax. New Closeout
emissions carry canonical `entity_kind` / `entity_id` directly. Consumer
queries do not need to know about the Closeout-specific `metadata.closeout_entity_*`
fallback any more — those fields are not written by new emits.

### Additive extension model for future trunks

Service expansion, Field expansion, and any future trunks can extend
`ActivitySpineEntityKind` additively with their own entity kinds rather
than introducing a per-trunk shadow stash. The pattern is:

1. Add the kind(s) to the `ActivitySpineEntityKind` union.
2. Pass them in `entity_kind` / `entity_id` from each call site.
3. Done — no metadata workaround, no helper amendment.

### Historical data on staging — transition window

`field_events` rows written on staging by BAN-312 / 313 / 316 / 317
smokes (between Amendment 1 ship and Amendment 2 merge) carry the
Amendment 1 shape:

- `metadata.aia_entity_kind` ∈ {`engagement`, …} — for Closeout rows
  this is always `'engagement'`
- `metadata.aia_entity_id` — for Closeout rows this is the engagement_id
- `metadata.closeout_entity_kind` — the real Closeout kind
- `metadata.closeout_entity_id` — the real Closeout row UUID

These rows are **not migrated**. Any consumer that spans both the
Amendment 1 staging window and post-Amendment-2 emits must handle both
metadata shapes during the historical-data transition window. Pure
production Postgres writes are still 503-guarded until
`BANYAN_FF_POSTGRES_WRITE=true`, so the production write path will only
ever carry the Amendment 2 shape.

### What stays unchanged

- `field_events` schema (column set, the 34-value `event_type` CHECK,
  `coreEntityTypeEnum`).
- `db/migrations/0000-0016` (frozen).
- `engagements` core schema.
- `lib/events.ts:emitMCEvent` (Sheets path).
- All AIA route logic (only field-names renamed; no behavior change).
- All FA code, UI files, and non-emission routes.
- Atomic-tx contract (`emit` + entity write commit/rollback together).
- Validator integrity (`write_target` on `GOLD_DATASET_ENTRY_WRITTEN`,
  Pattern B `from_state` / `to_state` requirements).
- Guard stack (`passAiaApiGate`, `passAiaReadGate`,
  `blockWOStagingPostgresReadOnlyMutation`, `isPostgresWriteEnabled`).
  These retain the AIA prefix purely for diff blast-radius reasons; an
  optional follow-up may drop the prefix once a dedicated rename packet is
  authorized.

### Supersession scope (narrow)

Amendment 2 supersedes BAN-309 D8 emit.ts protection **only** in the named
scope of (a) the union rename + 7-member additive extension and (b) the
input field-name rename. All other BAN-309 D8 contracts (atomic-tx,
validator integrity, no field_events INSERT bypass, no `event_type` CHECK
amendments) remain binding on downstream trunks.
