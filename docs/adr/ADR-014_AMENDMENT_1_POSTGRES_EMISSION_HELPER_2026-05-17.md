# ADR-014 — Amendment 1: Canonical Postgres Activity Spine emission helper

**Status:** Accepted
**Date:** 2026-05-17
**Parent ADR:** ADR-014 — WO Postgres Write-Path Authorization
**Linear:** BAN-309 (Pass 3a.2)
**Resolution origin:** BAN-309 stop report D8 ruling, recorded in Linear comment 2026-05-17 ~19:15 UTC

## Context

BAN-309 Pass 3a.2 requires every new AIA / TPA write route to emit its Activity
Spine event in the **same Drizzle transaction** as the entity INSERT/UPDATE — if
the emit fails, the entity write must roll back.

The existing canonical event helper is `emitMCEvent` at `lib/events.ts`. It is:

1. **Sheets-only.** It appends to `Field_Events_V1` on the backend Sheet. Its
   Postgres `field_events` cutover is explicitly gated to Packet 005.5 by the
   inline comment at `lib/events.ts:147-148`.
2. **Best-effort / non-blocking.** It swallows errors after logging
   (`lib/events.ts:150-162`). It cannot participate in a Postgres transaction;
   a Sheets API call is not transactional with the Postgres write, and a
   swallowed error is the opposite of what Pass 3a.2 needs.

So Pass 3a.2 needs an emission path that is (a) Postgres, (b) tx-scoped, and
(c) hard-fails on emit failure. `emitMCEvent` is none of those.

## Decision

Author **`lib/activity-spine/emit.ts`** as the canonical Postgres `field_events`
emission helper, separate from `lib/events.ts:emitMCEvent`.

- Exports `emitActivitySpineEvent(tx, input)`.
- `tx` is a Drizzle `node-postgres` transaction handle (`db.transaction(async (tx) => …)`).
  The INSERT into `field_events` is executed against `tx`, so it commits or
  rolls back atomically with the caller's entity write.
- `input` is validated through `validateActivitySpinePayload` from
  `lib/activity-spine/event-contract.ts` (unchanged). Pattern B payloads must
  carry `from_state` + `to_state` per the existing contract
  (`event-contract.ts:93-100`).
- Throws `ActivitySpineEmitError` on any failure — unknown `event_type`,
  payload validation failure, or DB error from the INSERT. Callers do not
  catch inside the transaction callback, so the throw rolls back the entity
  write.
- `lib/events.ts:emitMCEvent` is **untouched** in this packet. It stays
  Sheets-only until Packet 005.5 performs the full cutover.

The original BAN-309 dispatch rule "do NOT create a new emission path" was
written on the assumption that a canonical Postgres helper already existed.
It did not. The new `lib/activity-spine/emit.ts` IS the canonical Postgres
emission path going forward; the rule applies to all future routes (do not
write to `field_events` directly — go through this helper).

## Scope boundary with Packet 005.5

- **In scope here:** Postgres `field_events` INSERTs originating from new
  AIA / TPA write routes added in BAN-309 Pass 3a.2.
- **Out of scope (Packet 005.5):** Migrating the existing 12 `emitMCEvent`
  call sites in WO + engagement routes from Sheets to Postgres. That cutover
  owns the dual-write / backfill / shadow-read story for legacy emit sites.
  When 005.5 lands, `emitMCEvent`'s public signature stays stable
  (`lib/events.ts:148`) and its body either delegates to
  `emitActivitySpineEvent` inside a wrapping transaction, or the two helpers
  are merged. That merge decision belongs to 005.5, not here.

## Why a separate helper instead of dual-write inside `emitMCEvent`

1. **Blast radius.** Modifying `emitMCEvent` would change semantics for all
   12 existing call sites (status transitions, BG1 Slice B engagement
   events) — they expect best-effort/non-blocking, not transactional. That's
   a cutover, not a tactical amendment.
2. **Transactional API mismatch.** `emitMCEvent` has no `tx` parameter and
   adding one would break the existing call sites. The new helper is
   tx-first by design.
3. **Failure semantics inversion.** New AIA routes need hard-fail on emit;
   existing routes need swallowed failures (a fail-closed pay-app transition
   is correct, but a fail-closed WO status update would block the office
   workflow today).

Keeping them separate lets Packet 005.5 reconcile both helpers on a single
deliberate cutover instead of forcing it now under the BAN-309 schedule.

## Consequences

- Two emission helpers coexist between now and Packet 005.5:
  `lib/events.ts:emitMCEvent` (Sheets, best-effort, legacy call sites) and
  `lib/activity-spine/emit.ts:emitActivitySpineEvent` (Postgres, tx-scoped,
  new AIA / TPA call sites).
- Activity Spine event contract (`event-contract.ts`) remains the single
  source of truth for `event_type` values and payload validation — both
  helpers consume the same validator.
- `field_events` schema and 34-value CHECK constraint are unchanged.
- Protected surfaces (`db/migrations/0000-0016`, `db/schema.ts`,
  `lib/activity-spine/event-contract.ts`) are not modified by this packet.

## References

- ADR-014 — WO Postgres Write-Path Authorization (parent decision)
- BAN-309 dispatch packet, D8–D12 ratification (2026-05-17)
- BAN-302 D4 — Activity Spine event contract for AIA / TPA
- AIA v1.1 §14.1, TPA v1.0 §6.5 + §11
- `lib/events.ts:147-148` — Packet 005.5 cutover boundary comment
- `lib/activity-spine/event-contract.ts:93-100` — Pattern B payload validation
