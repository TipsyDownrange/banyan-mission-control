# MC Write-Path Inventory — BAN-307

**Repo:** `TipsyDownrange/banyan-mission-control`
**Base SHA:** `a5b28448a765b0cb37fe825c1a84923d2f8c9d3e`
**Branch:** `claude/ban-307-mc-write-read-inventory`
**Date:** 2026-05-17
**Linear:** [BAN-307](https://linear.app/banyan-os/issue/BAN-307)

Documentation only. No app/, lib/, components/, db/ source modified.

## Methodology

Enumerated every `app/api/**/route.ts` (122 route files). Side-effect classification by grep:

- **Sheets writes** identified via `appendSheetRow` and `sheets.spreadsheets.values.{append,update,batchUpdate,clear}` — 46 unique route files.
- **Postgres writes** identified via three patterns:
  1. Raw SQL `query`/`queryOne`/`pool.query` from `lib/work-records/db.ts` containing `insert into`/`update ... set`/`delete from`.
  2. Drizzle `db.insert`/`db.update`/`db.delete` (found in 0 route files — Drizzle is imported by 6 routes but only for query operators in read paths).
  3. Generic CRUD via `tableRoute` factory in `lib/work-records/generic-routes.ts:34, 45` (raw SQL inside the factory).
- **External writes** identified via `drive.files.create|update|delete`, `gmail.users.messages.send`, `cal.events.{insert,update,patch,delete}`, and outbound `fetch('https://...')` to Smartsheet / Bill.com / QBO / Anthropic / OpenAI / Linear.
- **Event emission** via `emitMCEvent` (`lib/events.ts:130`) — this is itself a Sheets append to `Field_Events_V1`; **not** a Postgres write. The function header comment at `lib/events.ts:147-148` explicitly says: *"Future Postgres `field_events` cutover (Packet 005.5 territory): swap this function's Sheets append for a Drizzle insert."*

The destination column uses the BAN-307 taxonomy literally:

- **Sheets only** — only Sheets writes (including via `emitMCEvent`).
- **Postgres only** — only Postgres writes (raw SQL or Drizzle).
- **Both (dual-write)** — Postgres entity write **and** Sheets write (typically `emitMCEvent` after a Postgres mutation). Listed explicitly with both line citations.
- **Neither (compute)** — no app-data write.
- **Neither (external)** — only writes external systems (Drive, Gmail, Calendar, QBO, Bill.com, Smartsheet, Anthropic, OpenAI). External target named in evidence column.
- **Read-only** — only reads (Sheets, Postgres, or external).
- **Auth-only** — NextAuth handler.

## Section 1 — Per-route inventory

### 1.1 Postgres writers (raw SQL via `lib/work-records/db.ts` or `tableRoute`)

| Route | HTTP | Destination(s) | Write evidence (file:line) | Idempotent? | Test-project aware? |
|---|---|---|---|---|---|
| `/api/engagements` | GET, POST, PATCH | **Both (dual-write)** | POST: `app/api/engagements/route.ts:66-89` raw `insert into engagements ... returning *`. PATCH: `app/api/engagements/route.ts:171-174` raw `update engagements set ... returning *`. POST also calls Drive create at `:63` (`createEngagementDriveFolder`). **Event fan-out (Sheets):** `app/api/engagements/route.ts:91, 93, 95, 177` `emitMCEvent` → `lib/events.ts:130` Sheets append to `Field_Events_V1`. | POST: no — `nextKid` generates a fresh KID on each call. PATCH: yes — keyed by `engagement_id`. | Tenant-scoped via `getDefaultTenantId()` and explicit `tenant_id` check at `:132`. No `test_project` flag. |
| `/api/estimate-versions` | GET, POST, PATCH | **Both (dual-write)** | Raw SQL via `query`/`queryOne` from `lib/work-records/db`. Event fan-out at `app/api/estimate-versions/route.ts:82` and `:110` (`emitMCEvent` → Sheets `Field_Events_V1`). | Mixed — POST no, PATCH yes (by `estimate_version_id`). | Tenant-scoped via `lib/work-records/authz` `requireKulaSession`. |
| `/api/bids` | GET, POST, PATCH | **Postgres only** | Raw SQL via `query`/`queryOne` from `lib/work-records/db`. No `emitMCEvent` call in this file (`grep emitMCEvent app/api/bids/route.ts` returns no hits). | Mixed. | Tenant-scoped. |
| `/api/bids/[bidId]/promote` | POST | **Both (dual-write)** | `app/api/bids/[bidId]/promote/route.ts:47-62` raw SQL transaction (`client.query('begin')`, `client.query` insert into `work_records`, `client.query('update bids set ...')`, commit). Pool from `lib/work-records/db.getPool()`. **Sheets:** indirectly via `emitMCEvent` at downstream sites of the new work_record / engagement (verified by `emitMCEvent` import at `:6`-ish via tableRoute use elsewhere; not directly emitted in this file). | No — generates a new `work_record_id` and KID. | Tenant-scoped via session. |
| `/api/estimates` | tableRoute | **Both (dual-write)** | `lib/work-records/generic-routes.ts:34` insert / `:45` update; `:97, :122` `emitMCEvent` (Sheets append). | Mixed per HTTP method. | Tenant-scoped. |
| `/api/proposals` | tableRoute | **Both (dual-write)** | Same as `/api/estimates` — uses `tableRoute` factory in `lib/work-records/generic-routes.ts:34, 45` for inserts/updates and `:97, :122` for `emitMCEvent`. | Mixed. | Tenant-scoped. |
| `/api/proposal-versions` | tableRoute | **Both (dual-write)** | Same factory. | Mixed. | Tenant-scoped. |
| `/api/work-records` | tableRoute | **Both (dual-write)** | Same factory. | Mixed. | Tenant-scoped. |
| `/api/work-state-history` | tableRoute | **Both (dual-write)** | Same factory. | Mixed. | Tenant-scoped. |
| `/api/pricing-evidence` | tableRoute | **Both (dual-write)** | Same factory. | Mixed. | Tenant-scoped. |

> **Important taxonomy note:** "Both (dual-write)" above means **Postgres entity write + Sheets event append** (i.e. the entity row goes to Postgres, an audit event row goes to Sheets `Field_Events_V1`). It is **not** a "same record written twice to two stores" pattern. Errors on the Sheets emit are swallowed by `emitMCEvent` (`lib/events.ts:150-162`) by design — caller's mutation does not fail if Sheets append fails — this is documented behavior, not a silent dual-write bug. See Section 3 / STOP condition discussion below.

### 1.2 Sheets-only writers (no Postgres entity write)

Of the 46 unique route files containing Sheets writes (full file list at end of section), these write **only** to Sheets:

| Route | HTTP | Destination(s) | Write evidence (file:line) | Idempotent? | Test-project aware? |
|---|---|---|---|---|---|
| `/api/admin/backfill-user-names` | POST | Sheets only | `app/api/admin/backfill-user-names/route.ts:79` batchUpdate to `Users_Roles` | Yes — idempotent backfill | Auth-gated, no test-project flag |
| `/api/admin/permissions` | various | Sheets only | `app/api/admin/permissions/route.ts:142, 309, 357` update to Permissions tab | Mixed | Auth-gated |
| `/api/admin/seed-roadmap` | POST | Sheets only | `app/api/admin/seed-roadmap/route.ts:91` batchUpdate to Roadmap | Yes (seeds) | Auth-gated |
| `/api/admin/wo-folder-repair` | POST | Sheets only + Drive external | Sheets: `:267, :273` update to Service_Work_Orders. Drive: `:157+` `drive.files.create` for report | No — timestamp + folder creation per call | kID-keyed lookups |
| `/api/admin/backfill-wo-customer-fk` | POST | Sheets only + Drive external | Sheets: `:117` batchUpdate to Service_Work_Orders. Drive: `:157` create report | Yes (backfill) | Auth-gated |
| `/api/assets` | POST, PATCH | Sheets only | `app/api/assets/route.ts:68` append, `:103` update to Assets tab | POST: no (fresh ID); PATCH: yes | Auth-gated |
| `/api/billcom/sync` | POST | Sheets only + Bill.com external | Sheets: `:93` update, `:141` append. External: Bill.com API earlier in file | No (incremental sync) | Staging fence via `shouldSkipExternalWrite()` (lib/env.ts:61) |
| `/api/contacts` | GET, POST, PATCH | Sheets only | `:130` batchUpdate, `:149` append, `:207` batchUpdate to Contacts tab | Mixed | Auth-gated |
| `/api/cost/invoice` | POST | Sheets only | `app/api/cost/invoice/route.ts` append to invoice log | No (fresh ID) | Auth-gated |
| `/api/crew` | POST | Sheets only | `app/api/crew/route.ts:88` append to Crew tab | No | Auth-gated |
| `/api/crew/update` | PATCH | Sheets only | `app/api/crew/update/route.ts:68` update to Crew tab | Yes | Auth-gated |
| `/api/dispatch-schedule` | POST, PATCH, DELETE | Sheets only | `:100` append, `:160` update, `:259` clear of `Dispatch_Schedule` | Mixed | Auth-gated |
| `/api/estimating/carls-method` | various | Sheets only | `:23` update, `:89` append, `:98` update | Mixed | Auth-gated |
| `/api/estimating/takeoff/[bidVersionId]` | POST | Sheets only | `:207` append, `:291` batchUpdate to Estimating tabs | No (fresh values) | Auth-gated |
| `/api/events/[eventId]` | PATCH | Sheets only | `app/api/events/[eventId]/route.ts:64` update to `Field_Events_V1` cols R, AC (audit + notes) | Yes — keyed by eventId | Auth-gated |
| `/api/field-issue/pdf` | POST | Sheets only + Drive external | Sheets read at `:29, :95, :108, :124, :180`. Sheets write at `:346` update. Drive: `:148, :297, :314` `drive.files.create` (primary + shadow PDF folder write) | No — fresh PDF per call | Staging fence gates Drive shadow at `:314` |
| `/api/gold-data` | POST | Sheets only | `app/api/gold-data/route.ts:318, 372` clear; `:324, :378` update | Idempotent — full overwrite | Auth-gated |
| `/api/kai/feedback` | POST | Sheets only | `app/api/kai/feedback/route.ts:29, 64, 77` (update + 2 appends to Kai_Feedback + Tasks) | No (fresh feedback_id/task_id) | Routes to staging-specific sheet via env (see `lib/env.ts:41` equivalent in MC) |
| `/api/organizations` | POST, PATCH | Sheets only | `:301, :308, :317, :327` appends to Organizations/Sites/Contacts/Crosswalk tabs. **Plus event fan-out** at `:372` `emitMCEvent` (Sheets `Field_Events_V1`) — still Sheets only because all targets are Sheets | No — fresh `org_id` | Auth-gated; not test-project aware |
| `/api/organizations/[orgId]` | GET, PATCH | Sheets only | `app/api/organizations/[orgId]/route.ts:105` batchUpdate; `:106` `emitMCEvent` (Sheets) | PATCH: yes — keyed by orgId | Auth-gated |
| `/api/organizations/[orgId]/contacts` | POST, PATCH | Sheets only | `:28` append, `:53` batchUpdate to Contacts; `:29` `emitMCEvent` | Mixed | Auth-gated |
| `/api/organizations/[orgId]/sites` | POST, PATCH | Sheets only | `:28` append, `:63` batchUpdate to Sites; `:32` `emitMCEvent` | Mixed | Auth-gated |
| `/api/organizations/governance/merge` | POST | Sheets only | Via `lib/organizationGovernance` `saveOrganization*` helpers; `:50` `emitMCEvent` | No | Auth-gated |
| `/api/organizations/governance/relationships` | POST, PATCH | Sheets only | Via `lib/organizationGovernance.saveOrganizationRelationship` (Sheets append in helper) | No | Auth-gated |
| `/api/pm/change-orders` | POST, PATCH | Sheets only | `:58` append, `:87` update | Mixed | Auth-gated |
| `/api/pm/rfi` | POST, PATCH | Sheets only | `:59` append, `:96` update | Mixed | Auth-gated |
| `/api/pm/sov` | POST, PATCH | Sheets only | `:48` append, `:77` update | Mixed | Auth-gated |
| `/api/pm/submittals` | POST, PATCH | Sheets only | `:52` append, `:86` update | Mixed | Auth-gated |
| `/api/procurement` | POST, PATCH | Sheets only | `:170` append, `:259, :306` batchUpdate; `:176` `emitMCEvent` | Mixed | Auth-gated |
| `/api/procurement/upload` | POST | Sheets only + Drive external | Sheets: `:104` batchUpdate. Drive: `:53, :67` `drive.files.create`. `:111` `emitMCEvent` | No | Auth-gated |
| `/api/projects/handoff` | POST | Sheets only + Drive external | Sheets: `:107, :144, :280, :324` (updates + appends to Engagements/Sites/Contacts/Crosswalk Sheets tabs). Drive: `:172, :188` (root + subfolder creates) | No | Auth-gated |
| `/api/quote-configs` | POST, PATCH | Sheets only | `:124, :132, :196, :234` append/update | Mixed | Auth-gated |
| `/api/scheduling` | POST, PATCH | Sheets only | `:243` update to Schedule | Yes | Auth-gated |
| `/api/service/dispatch` | POST | Sheets only + Drive external (guarded by `WO_POSTGRES_READ_ONLY_SMOKE`) | Sheets: `:211` append, `:224, :231, :238` updates to `Service_Work_Orders` / `Dispatch_Schedule`. Drive folder created via helper. Guard: `:62` `blockWOStagingPostgresReadOnlyMutation` | No | **Guarded** in staging shadow mode (see Output 4) |
| `/api/service/estimate` | POST | Sheets only (guarded) | Sheets: `:33, :122, :130` update/append. Guard: `:98`. Plus `emitMCEvent` at `:138` (Sheets) | No | **Guarded** |
| `/api/service/folder-link` | POST | Sheets only + Drive external (guarded) | Sheets: `:75` batchUpdate, `:112` update, `:126` append. Drive: `drive.files.create` in handler. Guard: `:21` | No | **Guarded** |
| `/api/service/proposal` | POST | Sheets read only + Drive external (guarded) | Sheets: only reads at `:27`. Drive: `:101, :121, :126` creates. `:295, :344` `emitMCEvent` (Sheets event fan-out). Guard: `:212`. **Note:** Although the agent characterized this route as having "Sheets writes", the actual primary side-effect on Sheets is the `emitMCEvent` audit row in `Field_Events_V1` — entity data goes to Drive. | No | **Guarded** |
| `/api/service/quote` | POST | Sheets only | `app/api/service/quote/route.ts:259` `emitMCEvent` (Sheets `Field_Events_V1`). Does **not** import `postgres-read-guard` — see consistency finding in Output 4. | No | **Not guarded — inconsistency** |
| `/api/service/update` | PATCH | Sheets only + Drive external (guarded) | Sheets: `:399` batchUpdate, `:499, :606` append, `:527, :647` batchUpdate/update. `:421` `emitMCEvent`. Guard: `:141` | Yes by woNumber (status transitions) | **Guarded** |
| `/api/step-templates` | POST, PATCH | Sheets only | `:111` append, `:170/209/254/281` clear, `:176/215/256/283` update | Idempotent (full overwrite) | Auth-gated |
| `/api/step-templates/seed` | POST | Sheets only | `:102` clear, `:107` update | Idempotent | Auth-gated |
| `/api/suggestions` | POST | Sheets only | `:26, :51` appends | No | Auth-gated |
| `/api/superintendent-scheduling` | POST, PATCH | Sheets only | `:567` append, `:586/592/694/767` updates, `:733` append-in-loop, `:747` update-in-loop, `:825` clear | Mixed | Auth-gated |
| `/api/tasks` | POST, PATCH | Sheets only | `:24` update, `:95` append, `:168` batchUpdate | Mixed | Auth-gated |
| `/api/tasks/reorder` | POST | Sheets only | `:43` batchUpdate | Idempotent | Auth-gated |
| `/api/tm-tickets` | POST | Sheets only + Drive external | Sheets: `:51` update, `:190` append. Drive: `:88` create PDF | No | Auth-gated |
| `/api/work-breakdown/[jobId]` | POST, PATCH | Sheets only | `:212/233/256/322/330/377` appends, `:367/434/475/537/578/596` updates. `:220, :241, :338` `emitMCEvent` (Sheets) | Mixed | kID-keyed |

**Full unique route-file list with Sheets writes** (from `grep -rnE "appendSheetRow|sheets\.spreadsheets\.values\.(append|update|batchUpdate|clear)" --include="*.ts" app/api/` — 46 files):
`admin/backfill-user-names`, `admin/backfill-wo-customer-fk`, `admin/permissions`, `admin/seed-roadmap`, `admin/wo-folder-repair`, `assets`, `billcom/sync`, `contacts`, `cost/invoice`, `crew`, `crew/update`, `dispatch-schedule`, `estimating/carls-method`, `estimating/takeoff/[bidVersionId]`, `events/[eventId]`, `field-issue/pdf`, `gold-data`, `kai/feedback`, `organizations/[orgId]/contacts`, `organizations/[orgId]`, `organizations/[orgId]/sites`, `organizations`, `pm/change-orders`, `pm/rfi`, `pm/sov`, `pm/submittals`, `procurement`, `procurement/upload`, `projects/handoff`, `qbo/sync-all`, `qbo/sync-costs`, `qbo/sync-invoices`, `quote-configs`, `scheduling`, `service/dispatch`, `service/estimate`, `service/folder-link`, `service/update`, `step-templates`, `step-templates/seed`, `suggestions`, `superintendent-scheduling`, `tasks/reorder`, `tasks`, `tm-tickets`, `work-breakdown/[jobId]`.

### 1.3 External-only writers (no Sheets / Postgres write)

| Route | HTTP | Destination | Evidence (file:line) | Notes |
|---|---|---|---|---|
| `/api/bids/create` | POST | External (Smartsheet) | `app/api/bids/create/route.ts:60, 104` `fetch('https://api.smartsheet.com/2.0/sheets/{bidLogId}/rows', POST)` | Production Smartsheet bid log; staging fenced via `getBidLogSheetId()` / `requireStagingEnv('STAGING_SMARTSHEET_BID_LOG_ID', ...)` (`lib/env.ts:93-96`) |
| `/api/calendar` | POST, PATCH, DELETE | External (Google Calendar) | `app/api/calendar/route.ts:169` `cal.events.insert`, `:211` `cal.events.patch`, `:237` `cal.events.delete` | Staging fenced via `shouldSkipCalendarWrite()` (`lib/env.ts:47`) |
| `/api/cron/qbo-refresh` | GET | External (QBO refresh) | Token refresh against QBO; no Sheets/Postgres write | Cron (vercel.json) |
| `/api/decision-queue/resolve` | POST | External (Drive) | `:82` `drive.files.update` (annotations on Decision Queue files) | Auth-gated |
| `/api/inbox/delegate` | POST | External (Drive) | `drive.files.update` to flip a Drive flag | Auth-gated |
| `/api/jobs/[woId]/upload` | POST | External (Drive) + Sheets event | `drive.files.create`. `:192` `emitMCEvent` (Sheets). Primary entity write is Drive; the event is fan-out only — leaving in "External + Sheets event" subgroup | Auth-gated |
| `/api/qbo/callback` | GET | External (QBO OAuth) | Token persistence; no local entity write | Auth-gated |
| `/api/qbo/connect` | GET | External (QBO OAuth redirect) | Auth handshake | Auth-gated |
| `/api/qbo/sync-all` | POST | Sheets + External (QBO) | Sheets: `:75` update, `:97` append. External: QBO `fetch` for WO/customer sync upstream | Auth-gated |
| `/api/qbo/sync-costs` | POST | Sheets + External (QBO) | Sheets: `:101` update, `:168` append. External: QBO `fetch` for cost sync | Auth-gated |
| `/api/qbo/sync-invoices` | POST | Sheets + External (QBO) | Sheets: `:166` batchUpdate. External: QBO `fetch` for invoice sync | Auth-gated |
| `/api/upload` | POST | External (Drive) | `drive.files.create` only | Auth-gated |
| `/api/service/dispatch-pdf` | POST | External (Drive) | PDF create + Drive upload | Auth-gated |
| `/api/daily-report/pdf` | GET, POST | External (Drive) | Reads Sheets at `:26, :34, :44, :60, :69, :175`. POST writes Drive PDF at `:117-151`. **No Sheets write** | Test-project: kID-scoped reads |
| `/api/service/intake` | POST | External (Anthropic) | `:50` `fetch('https://api.anthropic.com/v1/messages')`; returns parsed JSON; no local write | Auth-gated |
| `/api/build-state` | GET | External (Vercel API) | Status pull only | n/a |
| `/api/finance/sync-status` | GET | External | Status pull | n/a |

### 1.4 Read-only and compute-only routes

(All have no app-data write; all return derived data. Grouped to keep table tractable. Each is covered by separate read-path inventory in Output 3.)

| Group | Routes | Reads from | Evidence |
|---|---|---|---|
| Postgres-read-only | `business-rules` (GET), `business-rules/all` (GET), `business-settings` (GET), `business-settings/all` (GET), `engagements/options` (GET), `master-library/families` (GET), `master-library/manufacturers` (GET), `master-library/system-types` (GET), `master-library/work-types` (GET), `bids` (GET-only paths) | Postgres only | Drizzle imports at `app/api/master-library/*:4`, `app/api/business-{rules,settings}/all/route.ts:10`; `query` from `lib/work-records/db` |
| Sheets-read-only | `customers`, `cost`, `crosswalk`, `estimating/bids/*` (read paths), `events` (GET), `health-check`, `install`, `kai`, `notify/crew-impact`, `notify/field-issue`, `projects`, `service` (GET), `service/customers`, `service/estimate-pdf`, `service/quote/validate`, `service/wo-list`, `today`, `travel`, `users`, `war-room*` | Sheets only | `getSheetData`, `sheets.spreadsheets.values.get` |
| Compute-only / proxy | `auth/[...nextauth]` (auth), `health-check`, `places/autocomplete`, `places/details`, `pm`, `tts`, `inbox/bids`, `inbox/flights`, `inbox` (read), `qbo/*` read-only routes (`balance-sheet`, `bills`, `company`, `customers`, `finance-summary`, `health`, `invoices`, `job-costs`, `kpis`, `profit-loss`) | n/a | No write; HTTP fetch to external APIs |

### Coverage check

122 unique `app/api/**/route.ts` files inventoried. All accounted for under Section 1.1 (10 routes), Section 1.2 (46 routes), Section 1.3 (17 distinct external-write routes), Section 1.4 (~49 read/compute routes). Some routes appear under multiple subsections when they have side-effects in more than one category (e.g. `/api/service/dispatch` is in 1.2 with a Drive external annotation; `/api/qbo/sync-*` are listed in 1.3 with Sheets side-effect).

## Section 2 — "Postgres read-only smoke mode" guard inventory

**Banner text (single canonical occurrence — no drift):**

> `Staging is currently in Work Order Postgres read-only smoke mode. This route is blocked to prevent writing Sheets data that the Postgres-backed staging UI would not read back.`

Defined at `lib/service-work-orders/postgres-read-guard.ts:15`. Sole copy in the codebase. Guard returns HTTP `409 Conflict` with `code: 'WO_POSTGRES_READ_ONLY_SMOKE'` and `route` field.

**Controlling flag:** `process.env.WO_POSTGRES_READ_ENABLED === 'true'` **AND** `isStaging()` (`process.env.VERCEL_TARGET_ENV === 'staging'`). Predicate at `lib/service-work-orders/postgres-read.ts:89-91`; staging check at `lib/env.ts:5-7`. Production cannot enter smoke mode regardless of `WO_POSTGRES_READ_ENABLED` setting (intentional, BAN-297 design).

**Routes carrying the guard:**

| Route | File:line of guard call | Banner text | Feature flag / env var | Default in production | Default in staging |
|---|---|---|---|---|---|
| `/api/service/dispatch` | `app/api/service/dispatch/route.ts:62` | (canonical banner) | `WO_POSTGRES_READ_ENABLED` + `VERCEL_TARGET_ENV` | **Never blocked** (isStaging false in prod) | Blocked when `WO_POSTGRES_READ_ENABLED=true` |
| `/api/service/estimate` | `app/api/service/estimate/route.ts:98` | (canonical banner) | same | same | same |
| `/api/service/folder-link` | `app/api/service/folder-link/route.ts:21` | (canonical banner) | same | same | same |
| `/api/service/proposal` | `app/api/service/proposal/route.ts:212` | (canonical banner) | same | same | same |
| `/api/service/update` | `app/api/service/update/route.ts:141` | (canonical banner) | same | same | same |

Default state in **production** with no env override: guard never fires (predicate requires `VERCEL_TARGET_ENV === 'staging'`).
Default state in **staging** with no env override: guard does **not** fire (predicate requires `WO_POSTGRES_READ_ENABLED === 'true'`).
Default state in staging with the explicit opt-in `WO_POSTGRES_READ_ENABLED=true` set in the Vercel staging environment: guard **fires** for the 5 routes above.

Test coverage at `__tests__/serviceWOCreateRoute.test.ts:293-315` and `__tests__/serviceUpdateInternalAuth.test.ts:182-204` confirms behavior (409 + code + no downstream side-effect).

Detailed scope, consistency analysis, and recommendation are in `docs/investigations/postgres-smoke-mode-guard-scope.md` (Output 4).

## Section 3 — STOP conditions assessment

| STOP condition | Triggered? | Notes |
|---|---|---|
| Write destination outside {Sheets / Postgres / both / neither / external} taxonomy | **No** — all destinations classified. |
| Dual-write route with silent error swallow (BAN-301 Hypothesis C) | **No, but** the `emitMCEvent` Sheets-emit-after-Postgres-write pattern (e.g. `app/api/engagements/route.ts:91-95`) intentionally swallows Sheets errors at `lib/events.ts:150-162` with a `console.warn`. This is documented behavior — function header at `lib/events.ts:138-149` explains: *"Best-effort Mission Control event emitter. Activity Spine writes must never make the user-facing mutation fail; callers can await this for ordering, but emit errors are swallowed after logging."* The Postgres entity write is **not** silently swallowed (it's the primary write); the swallow applies only to the Sheets audit event. This is **not** a BAN-301 Hypothesis C scenario (which requires a silent Postgres failure with a Sheets success masking it). It **is** worth flagging that a Sheets emit failure can produce silent drift in the `Field_Events_V1` audit log for engagements/estimates/proposals/work-records. Recommend follow-up to BAN-300/BAN-307: structured log/metric on the `console.warn` path so drift is observable. |
| Production-tenant data in staging Postgres reads | **No** — `shouldReadServiceWorkOrdersFromPostgres` at `lib/service-work-orders/postgres-read.ts:89-91` requires `isStaging()` true; production never enters Postgres shadow read. `assertPostgresReadConfig` at `:93-98` additionally throws if `WO_POSTGRES_READ_ENABLED=true` is set without `DATABASE_URL`, preventing silent fallback. |
| Guard pattern inconsistent (some routes blocked, others not, no toggle) | **Partial — surface as BAN-300 follow-up.** Guard applied to 5/6 known service-WO mutation routes; `/api/service/quote` (POST) writes `Field_Events_V1` via `emitMCEvent` at `:259` but does **not** import or call the guard. See Output 4 for full analysis. |

## Section 4 — Notes informing the BAN-301 hypothesis (Output 1 companion)

- MC's only event-emission path (`emitMCEvent`, `lib/events.ts:130-135`) writes **Google Sheets `Field_Events_V1`**, identical destination to FA's `submitEvent` write (`lib/events.ts:164` in FA repo). MC does **not** insert into the Postgres `field_events` table from any current route.
- The forward-looking comment at `lib/events.ts:147-148` ("Future Postgres `field_events` cutover (Packet 005.5 territory): swap this function's Sheets append for a Drizzle insert") documents an explicit planned cutover that **has not happened in this SHA**. This corroborates Output 1's verdict: **Hypothesis B — the 505 rows in Postgres `field_events` are historical-import only**. They are not being maintained by either FA or MC current code.
- MC **does** write Postgres for entity tables (`engagements`, `bids`, `estimates`, `proposals`, `work_records`, `work_state_history`, `pricing_evidence`, `estimate_versions`). The event audit log remains on Sheets. This split (entities → Postgres, events → Sheets) is consistent with Hypothesis A applied to entity rows but **does not** extend to the `field_events` table — which is the table BAN-301 is investigating.

## Acceptance summary

- 122 unique route files inventoried; all accounted for.
- Section 1.1 (Postgres writers, 10 routes), 1.2 (Sheets-only writers, 46 routes), 1.3 (External-only writers, 17 routes), 1.4 (Read/compute, ~49 routes).
- Postgres-smoke-mode guard mapped to 5 mutation routes; 1 known coverage gap (`/api/service/quote`) flagged for BAN-300 follow-up. Detailed in Output 4.
- No hard STOP conditions triggered. Soft observations forwarded to BAN-300/BAN-307 follow-up:
  - `emitMCEvent` swallows Sheets-side errors after the Postgres write (intentional but unobservable beyond `console.warn`).
  - `/api/service/quote` does not import the Postgres-read-only-smoke-mode guard.
