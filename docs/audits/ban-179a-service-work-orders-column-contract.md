# BAN-179.A — Service_Work_Orders Column Contract (Audit)

**Date:** 2026-05-07
**Repo:** banyan-mission-control
**Worktree:** `/Users/kulaglassopenclaw/.openclaw/workspace/worktrees/ban-179a-column-contract`
**Base SHA:** `9957b9ebe5712aaa4e77f9888d74d387219814b7`
**Branch:** `ban-179-a-wo-column-drift`
**Packet:** `BAN-179A_SHEET_COLUMN_DRIFT_FIX_BQS_v0.1.md`

This audit documents the resolved 47-column contract for the
`Service_Work_Orders` Sheet tab and surfaces a residual ambiguity that BAN-179.B
must resolve before any Sheets→Postgres mirroring is wired.

## 1. Why this exists

Per the BAN-179 audit (`BAN-179_CLAUDE_AUDIT_REPORT.md` §3 / §6 / §13):

1. `app/api/service/route.ts` and `app/api/service/update/route.ts` declared a
   single `COL` map containing *both* metadata fields (`created_at` / AA,
   `updated_at` / AB, `source` / AC) **and** QBO invoice fields
   (`qbo_invoice_id` / AA, `invoice_number` / AB, `invoice_total` / AC,
   `invoice_balance` / AD, `invoice_date` / AE) at duplicate indices. Object
   literal duplicate keys mean the QBO invoice values silently overwrote the
   metadata values: `COL.created_at`, `COL.updated_at`, and `COL.source` all
   resolved to the QBO invoice cell.
2. `app/api/qbo/sync-invoices/route.ts` mapped invoice fields to AD–AH
   (29–33), not AA–AE. So the WO read path believed invoices lived at AA–AE
   while the QBO sync writer believed they lived at AD–AH. Whichever map was
   wrong, every WO read/write that depended on it was wrong too.
3. The previous fix (commit `7383b61`, *fix: invoice columns mapped to correct
   positions AA-AE (was AD-AH)*) was reverted three hours later by
   `d63a26b` (*Fix 3 API bugs: service WO invoice column collision*) which
   moved invoices back to AD–AH. Commit `14ef33c` then introduced the WO
   Invoicing Tracker on Apr 11 and re-introduced the AA–AE mapping in
   `route.ts` only — that is the regression this packet repairs.

Until these maps are reconciled, any Postgres mirror would codify the wrong
contract for both metadata and invoice columns. This is a data-loss class bug,
not a porting risk, and must be closed before BAN-179.B begins.

## 2. Ground truth used

This audit was performed against the repo at `9957b9e` only. No live Sheet
header row was read. Decisions came from the following anchors:

| Anchor | Provides |
| --- | --- |
| `app/api/service/dispatch/route.ts` lines 197–239 (WO create writes) | `W..AC` and `AQ..AS` and `AU` ranges. Confirms metadata at AA/AB/AC and identity at AQ/AR/AS/AU. |
| `app/api/qbo/sync-invoices/route.ts` (writer) | Writes QBO invoice fields at indices 29–33 (AD–AH). Two consumers (`app/api/finance/sync-status/route.ts` reader, identical layout) confirm. |
| Git history (commits `7383b61`, `d63a26b`, `14ef33c`) | Records the AA-AE ↔ AD-AH back-and-forth and the regression that this packet undoes. |
| `lib/schemas.ts` (Dispatch, Install schemas) | Pattern for declaring sheet-tab column contracts in one place, with a `validateHeaders()` companion. |
| `BAN-179_CLAUDE_AUDIT_REPORT.md` §3, §5, §6, §13 | P0 punchlist. |

The live Sheet header row is **NOT** part of this audit's evidence base —
ground-truthing the live header is reserved for BAN-179.B (see §6 below).

## 3. Resolved 47-column contract (A–AU)

The contract is encoded in `lib/contracts/service-work-orders.ts` and validated
by `__tests__/serviceWorkOrdersContract.test.ts`.

| Idx | Letter | Field | Owner / write path | Notes |
| ---:| ---    | ---   | ---                | ---   |
| 0  | A  | `wo_id`                   | `wo_create` | dispatch POST |
| 1  | B  | `wo_number`               | `wo_create` | YY-#### |
| 2  | C  | `name`                    | `wo_create` | display name |
| 3  | D  | `description`             | `wo_create` | |
| 4  | E  | `status`                  | `wo_update` | GC-D037 rollback |
| 5  | F  | `island`                  | `wo_update` | |
| 6  | G  | `area_of_island`          | `wo_update` | |
| 7  | H  | `address`                 | `wo_create` | |
| 8  | I  | `contact_person`          | `wo_update` | |
| 9  | J  | `contact_title`           | `wo_update` | |
| 10 | K  | `contact_phone`           | `wo_update` | normalized on write |
| 11 | L  | `contact_email`           | `wo_update` | normalized on write |
| 12 | M  | `customer_name`           | `wo_update` | display only post-GC-D053 |
| 13 | N  | `system_type`             | `wo_create` | |
| 14 | O  | `assigned_to`             | `wo_update` | |
| 15 | P  | `date_received`           | `wo_create` | |
| 16 | Q  | `due_date`                | `unwritten` | reserved header |
| 17 | R  | `scheduled_date`          | `wo_update` | |
| 18 | S  | `start_date`              | `wo_update` | |
| 19 | T  | `hours_estimated`         | `wo_update` | |
| 20 | U  | `hours_actual`            | `unwritten` | populated by step rollups |
| 21 | V  | `men_required`            | `wo_update` | |
| 22 | W  | `comments`                | `wo_create` | |
| 23 | X  | `folder_url`              | `wo_create` | Drive folder URL |
| 24 | Y  | `quote_total`             | `wo_update` | |
| 25 | Z  | `quote_status`            | `wo_update` | |
| 26 | AA | `created_at`              | `system`    | **metadata, NOT a QBO cell** |
| 27 | AB | `updated_at`              | `system`    | **metadata, NOT a QBO cell** |
| 28 | AC | `source`                  | `system`    | **metadata, NOT a QBO cell** |
| 29 | AD | `qbo_invoice_id`          | `qbo_invoice_sync` | **was AA in route.ts (bug)** |
| 30 | AE | `invoice_number`          | `qbo_invoice_sync` | **was AB in route.ts (bug)** |
| 31 | AF | `invoice_total`           | `qbo_invoice_sync` | **was AC in route.ts (bug)** |
| 32 | AG | `invoice_balance`         | `qbo_invoice_sync` | **was AD in route.ts (bug)** |
| 33 | AH | `invoice_date`            | `qbo_invoice_sync` | **was AE in route.ts (bug)** |
| 31 | AF | `deposit_status`          | `wo_update` | **legacy_alias — overlaps invoice_total/AF** |
| 32 | AG | `deposit_amount`          | `wo_update` | **legacy_alias — overlaps invoice_balance/AG** |
| 33 | AH | `deposit_invoice_num`     | `wo_update` | **legacy_alias — overlaps invoice_date/AH** |
| 34 | AI | `deposit_sent_date`       | `wo_update` | |
| 35 | AJ | `deposit_paid_date`       | `wo_update` | |
| 36 | AK | `final_status`            | `wo_update` | |
| 37 | AL | `final_amount`            | `wo_update` | |
| 38 | AM | `final_invoice_num`       | `wo_update` | |
| 39 | AN | `final_sent_date`         | `wo_update` | |
| 40 | AO | `final_paid_date`         | `wo_update` | |
| 41 | AP | `invoices_json`           | `wo_update` | active source for invoice tracker UI |
| 42 | AQ | `org_id`                  | `identity`  | GC-D023 |
| 43 | AR | `customer_id`             | `identity`  | GC-D053 |
| 44 | AS | `legacy_flag`             | `identity`  | GC-D053 |
| 45 | AT | `legacy_wo_ids`           | `identity`  | BAN-56 |
| 46 | AU | `requires_org_assignment` | `identity`  | identity follow-up |

## 4. Before / after — `app/api/service/route.ts:39–47`

### Before (regressed by commit `14ef33c`)

```ts
created_at:      26, // AA
updated_at:      27, // AB
source:          28, // AC
// QBO invoice columns (actual sheet positions)
qbo_invoice_id:  26, // AA   ← duplicate-key collision
invoice_number:  27, // AB   ← overwrites updated_at
invoice_total:   28, // AC   ← overwrites source
invoice_balance: 29, // AD
invoice_date:    30, // AE
```

### After (BAN-179.A)

```ts
import { SWO_COL } from '@/lib/contracts/service-work-orders';
const COL = SWO_COL;
// COL.created_at      = 26 (AA)
// COL.updated_at      = 27 (AB)
// COL.source          = 28 (AC)
// COL.qbo_invoice_id  = 29 (AD)
// COL.invoice_number  = 30 (AE)
// COL.invoice_total   = 31 (AF)
// COL.invoice_balance = 32 (AG)
// COL.invoice_date    = 33 (AH)
```

The same change is applied to `app/api/service/update/route.ts` (it also had
the duplicate-key bug). All other route consumers
(`qbo/sync-invoices`, `finance/sync-status`, `service/dispatch-pdf`,
`service/wo-list`, `admin/backfill-wo-customer-fk`, `jobs/[woId]/upload`) now
import `SWO_COL` instead of declaring their own indices. `service/dispatch`
already wrote raw letter ranges, so its layout was already on-contract; no
changes are required there.

## 5. Files changed

| File | Change |
| --- | --- |
| `lib/contracts/service-work-orders.ts` | New shared contract module. |
| `app/api/service/route.ts` | Replace local `COL` map with `SWO_COL`. Use `SERVICE_WORK_ORDERS_RANGE_END` for `A2:AU5000` range. |
| `app/api/service/update/route.ts` | Replace local `COL_IDX` and `colLetter` with imports from contract. |
| `app/api/qbo/sync-invoices/route.ts` | Replace local `INV_COL` with `SWO_COL`-sourced indices; fix stale `AA–AE` comments to `AD–AH`. |
| `app/api/finance/sync-status/route.ts` | Replace local `WO_COL` with `SWO_COL`-sourced indices. |
| `app/api/service/dispatch-pdf/route.ts` | Replace local `COL` with `SWO_COL`-sourced indices. |
| `app/api/service/wo-list/route.ts` | Replace local `COL` with `SWO_COL`-sourced indices. |
| `app/api/admin/backfill-wo-customer-fk/route.ts` | Replace local index constants with `SWO_COL`-sourced values; use `columnLetterFromIndex`. |
| `app/api/jobs/[woId]/upload/route.ts` | Replace `FOLDER_URL_COL = 23` with `SWO_COL.folder_url`. |
| `__tests__/serviceWorkOrdersContract.test.ts` | New tests. |
| `docs/audits/ban-179a-service-work-orders-column-contract.md` | This document. |

## 6. Open ambiguity — `deposit_*` ↔ QBO invoice cells

The legacy invoicing-tracker fields `deposit_status`, `deposit_amount`, and
`deposit_invoice_num` were mapped at AF / AG / AH in
`app/api/service/route.ts` and `app/api/service/update/route.ts`. Those are
the same physical cells used by `qbo/sync-invoices` for `invoice_total`,
`invoice_balance`, and `invoice_date`. The packet's stated P0 scope is the
metadata vs QBO invoice collision — this secondary collision is **not** in
the packet and is **not silently** resolved here.

This audit codifies the secondary collision as a tracked alias:

- The contract declares `deposit_status` / `deposit_amount` /
  `deposit_invoice_num` with `legacy_alias: true` at AF / AG / AH so the
  duplicate-index assertion does not break, while still surfacing the overlap
  in the contract data.
- The legacy fields stay readable in `WODetailPanel.tsx` as a fallback (the
  active path is `invoices_json` at AP).
- BAN-179.B **must** ground-truth the live Sheet header row and either:
  - confirm `deposit_status` etc. do not exist in the live Sheet header (in
    which case the route entries should be removed), or
  - relocate `deposit_status` / `deposit_amount` / `deposit_invoice_num` to
    different column positions (which would require a Sheet header rename and
    is out of scope for this packet), or
  - explicitly approve overwriting the legacy deposit fields when QBO sync
    runs (which is what is happening today, silently).

This is a **STOP** before any Postgres mirror or backfill of the deposit
columns. It is **not** a stop for the metadata-vs-QBO-invoice fix landed in
this packet, which has unambiguous resolution.

## 7. Tests added

`__tests__/serviceWorkOrdersContract.test.ts` covers:

- 47 columns A–AU represented exactly once (canonical owners).
- No duplicate index unless `legacy_alias: true`.
- Letter ↔ index symmetry for every entry.
- Metadata at AA/AB/AC is `created_at`/`updated_at`/`source`.
- QBO invoice positions at AD/AE/AF/AG/AH are
  `qbo_invoice_id`/`invoice_number`/`invoice_total`/`invoice_balance`/`invoice_date`.
- Identity at AQ/AR/AS/AT/AU.
- `created_at` does NOT share an index with `qbo_invoice_id` (regression
  guard for the BAN-179 root cause).
- Legacy `deposit_*` aliases are tagged correctly and pair with non-alias
  canonical owners.
- Each route consumer imports from the shared contract (static source check).
- `assertHeaderMatchesContract` round-trips on a contract-derived header row
  and rejects a duplicate-key drift.

No external services are called.

## 8. Out of scope (per packet §4 / §17)

- No Postgres mirror writes added.
- No Sheet data migration / backfill.
- No QBO live sync run.
- No Drive / Gmail / Calendar / Smartsheet / Vercel external writes.
- No War Room code touched.
- No production Sheet header changes.
- No live Sheet header read.
- The `deposit_*` ↔ QBO invoice cell overlap is documented and aliased, NOT
  silently resolved (see §6).

## 9. Recommendation for BAN-179.B

The metadata vs QBO invoice collision is closed. BAN-179.B can proceed only
*after*:

1. The live `Service_Work_Orders` header row is read (read-only OAuth) and
   compared against the canonical list using
   `assertHeaderMatchesContract()`.
2. Sean makes a decision on the `deposit_*` ↔ QBO invoice alias overlap
   (§6). If the legacy fields do not exist in the live header, remove their
   `route.ts` entries before any Postgres mirror is wired. If they do exist,
   relocating them is out of scope for BAN-179.B and BAN-179.A's
   `legacy_alias: true` annotation is the correct holding pattern.

Until both gates are met, no Postgres `INSERT … ON CONFLICT … DO UPDATE` for
service work orders is safe.
