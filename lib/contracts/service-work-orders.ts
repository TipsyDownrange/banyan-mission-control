/**
 * lib/contracts/service-work-orders.ts
 *
 * Single source-of-truth column contract for the Service_Work_Orders sheet
 * (47 columns A–AU). Established by BAN-179.A.
 *
 * Background: Multiple route handlers (`app/api/service/route.ts`,
 * `app/api/service/update/route.ts`, `app/api/qbo/sync-invoices/route.ts`,
 * `app/api/finance/sync-status/route.ts`, `app/api/service/dispatch-pdf/route.ts`,
 * `app/api/service/dispatch/route.ts`, and `app/api/admin/backfill-wo-customer-fk/route.ts`)
 * each maintained their own column-index map. Two of those maps had duplicate-key
 * collisions on AA/AB/AC (created_at/updated_at/source AND qbo_invoice_id/
 * invoice_number/invoice_total reading the same physical cells). This file
 * collapses the SWO column contract into one declaration that every route can
 * import, and contract tests assert that all consumers stay aligned.
 *
 * Stable-position evidence (from current repo at base SHA 9957b9e):
 *   - WO create (`app/api/service/dispatch/route.ts`) writes `W..AC`
 *     (comments → source) and `AQ..AS` (org_id, customer_id, legacy_flag) and
 *     `AU` (requires_org_assignment) — anchors metadata at AA–AC and identity
 *     at AQ–AU.
 *   - QBO sync (`app/api/qbo/sync-invoices/route.ts`) writes `AD..AH` for
 *     qbo_invoice_id, invoice_number, invoice_total, invoice_balance,
 *     invoice_date — anchors QBO invoice columns at AD–AH.
 *   - Finance sync status (`app/api/finance/sync-status/route.ts`) reads the
 *     same AD–AH layout — second confirmation of the QBO invoice positions.
 *
 * Open ambiguity (NOT resolved here, surfaced in
 * `docs/audits/ban-179a-service-work-orders-column-contract.md`):
 *   The legacy invoicing-tracker fields `deposit_status`, `deposit_amount`,
 *   `deposit_invoice_num`, `deposit_sent_date`, `deposit_paid_date`,
 *   `final_status`, `final_amount`, `final_invoice_num`, `final_sent_date`,
 *   `final_paid_date`, and `invoices_json` were mapped at AF–AP in
 *   `app/api/service/route.ts` and `app/api/service/update/route.ts`. AF–AH
 *   physically overlap the QBO invoice columns (invoice_total/AF,
 *   invoice_balance/AG, invoice_date/AH). Because `invoices_json` is the
 *   active source for invoice tracking in the UI (see
 *   `components/WODetailPanel.tsx`) and the deposit/final fields only act as
 *   a fallback, this overlap has not surfaced as a visible bug. The legacy
 *   positions are declared on this contract as `legacy_alias: true` so the
 *   duplicate-index assertion accepts them, but BAN-179.B must reach a Sean
 *   decision on the live Sheet header before any Postgres mirror trusts these
 *   fields.
 */

export interface ServiceWorkOrderColumn {
  /** 0-based column index (A=0). */
  index: number;
  /** Spreadsheet column letter (A, B, ..., Z, AA, ...). */
  letter: string;
  /** Canonical field name used throughout the codebase. */
  name: string;
  /** Owner / where this column is canonically written. */
  owner:
    | 'wo_create'        // app/api/service/dispatch/route.ts
    | 'wo_update'        // app/api/service/update/route.ts
    | 'qbo_invoice_sync' // app/api/qbo/sync-invoices/route.ts
    | 'identity'         // org/customer FK + legacy markers
    | 'system'           // metadata maintained by the runtime (created_at, updated_at, source)
    | 'unwritten';       // exists in header row but no write path lands here today
  /** Notes on edge cases, fences, or ownership history. */
  notes?: string;
  /**
   * Marks a field whose physical position currently overlaps another canonical
   * column. Such fields are NOT enforced as unique by the duplicate-index
   * assertion in the contract test. They require explicit Sean decision before
   * downstream migration trusts them. See module header for context.
   */
  legacy_alias?: boolean;
}

/** 0-based index → spreadsheet column letter (A, B, ... Z, AA, AB, ...). */
export function columnLetterFromIndex(idx: number): string {
  if (!Number.isInteger(idx) || idx < 0) {
    throw new RangeError(`Invalid column index: ${idx}`);
  }
  let result = '';
  let n = idx;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

/**
 * Canonical 47-column contract for Service_Work_Orders!A1:AU1.
 * Order is significant: index N corresponds to spreadsheet column at offset N.
 *
 * Aliased duplicate-index entries are allowed only when explicitly marked with
 * `legacy_alias: true` and are skipped by the unique-owner check.
 */
export const SERVICE_WORK_ORDERS_CONTRACT: readonly ServiceWorkOrderColumn[] = [
  { index: 0,  letter: 'A',  name: 'wo_id',                   owner: 'wo_create' },
  { index: 1,  letter: 'B',  name: 'wo_number',               owner: 'wo_create' },
  { index: 2,  letter: 'C',  name: 'name',                    owner: 'wo_create' },
  { index: 3,  letter: 'D',  name: 'description',             owner: 'wo_create' },
  { index: 4,  letter: 'E',  name: 'status',                  owner: 'wo_update', notes: 'GC-D037 either-both-or-neither rollback on event emit failure' },
  { index: 5,  letter: 'F',  name: 'island',                  owner: 'wo_update' },
  { index: 6,  letter: 'G',  name: 'area_of_island',          owner: 'wo_update' },
  { index: 7,  letter: 'H',  name: 'address',                 owner: 'wo_create' },
  { index: 8,  letter: 'I',  name: 'contact_person',          owner: 'wo_update' },
  { index: 9,  letter: 'J',  name: 'contact_title',           owner: 'wo_update' },
  { index: 10, letter: 'K',  name: 'contact_phone',           owner: 'wo_update' },
  { index: 11, letter: 'L',  name: 'contact_email',           owner: 'wo_update' },
  { index: 12, letter: 'M',  name: 'customer_name',           owner: 'wo_update', notes: 'GC-D053: replaced by customer_id (AR) for FK resolution; column kept for display' },
  { index: 13, letter: 'N',  name: 'system_type',             owner: 'wo_create' },
  { index: 14, letter: 'O',  name: 'assigned_to',             owner: 'wo_update' },
  { index: 15, letter: 'P',  name: 'date_received',           owner: 'wo_create' },
  { index: 16, letter: 'Q',  name: 'due_date',                owner: 'unwritten', notes: 'Header reserved; no current write path lands here.' },
  { index: 17, letter: 'R',  name: 'scheduled_date',          owner: 'wo_update' },
  { index: 18, letter: 'S',  name: 'start_date',              owner: 'wo_update' },
  { index: 19, letter: 'T',  name: 'hours_estimated',         owner: 'wo_update' },
  { index: 20, letter: 'U',  name: 'hours_actual',            owner: 'unwritten', notes: 'Header reserved; populated by step rollups, not by service routes.' },
  { index: 21, letter: 'V',  name: 'men_required',            owner: 'wo_update' },
  { index: 22, letter: 'W',  name: 'comments',                owner: 'wo_create' },
  { index: 23, letter: 'X',  name: 'folder_url',              owner: 'wo_create', notes: 'Drive folder URL for the WO. Validated by lib/drive-wo-folder.' },
  { index: 24, letter: 'Y',  name: 'quote_total',             owner: 'wo_update' },
  { index: 25, letter: 'Z',  name: 'quote_status',            owner: 'wo_update' },
  { index: 26, letter: 'AA', name: 'created_at',              owner: 'system',    notes: 'Set on dispatch/route.ts WO create. NOT a QBO invoice cell — see module header.' },
  { index: 27, letter: 'AB', name: 'updated_at',              owner: 'system',    notes: 'Set on every wo_update. Snapshotted for GC-D037 rollback.' },
  { index: 28, letter: 'AC', name: 'source',                  owner: 'system',    notes: 'Provenance tag (e.g., "banyan_dispatch") set on WO create.' },
  { index: 29, letter: 'AD', name: 'qbo_invoice_id',          owner: 'qbo_invoice_sync' },
  { index: 30, letter: 'AE', name: 'invoice_number',          owner: 'qbo_invoice_sync' },
  { index: 31, letter: 'AF', name: 'invoice_total',           owner: 'qbo_invoice_sync' },
  { index: 32, letter: 'AG', name: 'invoice_balance',         owner: 'qbo_invoice_sync' },
  { index: 33, letter: 'AH', name: 'invoice_date',            owner: 'qbo_invoice_sync' },
  // Legacy invoicing-tracker fields below physically overlap the QBO invoice cells
  // at AF/AG/AH. They are kept for read-only fallback parity with route.ts and
  // update/route.ts and MUST be resolved (renamed/relocated/removed) before any
  // Postgres mirror is wired. Aliased duplicate indices are tolerated by the
  // contract validator only when `legacy_alias: true`.
  { index: 31, letter: 'AF', name: 'deposit_status',          owner: 'wo_update', legacy_alias: true, notes: 'OVERLAPS invoice_total/AF — see contract module header for resolution requirement.' },
  { index: 32, letter: 'AG', name: 'deposit_amount',          owner: 'wo_update', legacy_alias: true, notes: 'OVERLAPS invoice_balance/AG.' },
  { index: 33, letter: 'AH', name: 'deposit_invoice_num',     owner: 'wo_update', legacy_alias: true, notes: 'OVERLAPS invoice_date/AH.' },
  { index: 34, letter: 'AI', name: 'deposit_sent_date',       owner: 'wo_update' },
  { index: 35, letter: 'AJ', name: 'deposit_paid_date',       owner: 'wo_update' },
  { index: 36, letter: 'AK', name: 'final_status',            owner: 'wo_update' },
  { index: 37, letter: 'AL', name: 'final_amount',            owner: 'wo_update' },
  { index: 38, letter: 'AM', name: 'final_invoice_num',       owner: 'wo_update' },
  { index: 39, letter: 'AN', name: 'final_sent_date',         owner: 'wo_update' },
  { index: 40, letter: 'AO', name: 'final_paid_date',         owner: 'wo_update' },
  { index: 41, letter: 'AP', name: 'invoices_json',           owner: 'wo_update', notes: 'Active source for invoice tracker UI (WODetailPanel); deposit_*/final_* are fallback only.' },
  { index: 42, letter: 'AQ', name: 'org_id',                  owner: 'identity',  notes: 'GC-D023: FK to Organizations.' },
  { index: 43, letter: 'AR', name: 'customer_id',             owner: 'identity',  notes: 'GC-D053: FK to Customers (mandatory on WO create).' },
  { index: 44, letter: 'AS', name: 'legacy_flag',             owner: 'identity',  notes: 'GC-D053: marks WOs with no resolvable customer_id.' },
  { index: 45, letter: 'AT', name: 'legacy_wo_ids',           owner: 'identity',  notes: 'BAN-56: searchable previous/non-canonical WO IDs.' },
  { index: 46, letter: 'AU', name: 'requires_org_assignment', owner: 'identity',  notes: 'Identity follow-up flag for missing org_id.' },
];

/** Total physical column count (A–AU). */
export const SERVICE_WORK_ORDERS_COL_COUNT = 47;

/** Column-letter range used by sheet read calls (`Service_Work_Orders!<RANGE>`). */
export const SERVICE_WORK_ORDERS_RANGE_END = 'AU';

/**
 * Map of canonical-name → 0-based index.
 *
 * Includes legacy aliases. Where two names share an index (e.g.
 * `invoice_total` and `deposit_status` both at AF=31), both keys resolve to
 * the same number. Callers should pick the name appropriate to their write
 * path; the contract test enforces that no NEW non-alias duplicates are
 * introduced.
 */
export const SWO_COL: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    SERVICE_WORK_ORDERS_CONTRACT.map(({ name, index }) => [name, index]),
  ) as Record<string, number>,
);

/** Map of canonical-name → spreadsheet column letter. */
export const SWO_LETTER: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    SERVICE_WORK_ORDERS_CONTRACT.map(({ name, letter }) => [name, letter]),
  ) as Record<string, string>,
);

export interface ContractValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates the contract array.
 * - Every (index, letter) pair is internally consistent.
 * - The non-alias entries cover indices 0..SERVICE_WORK_ORDERS_COL_COUNT-1
 *   exactly once each.
 * - Aliased duplicate-index entries are tolerated only when
 *   `legacy_alias: true` AND a non-alias canonical owner already exists at
 *   that index.
 */
export function validateContract(
  contract: readonly ServiceWorkOrderColumn[] = SERVICE_WORK_ORDERS_CONTRACT,
): ContractValidation {
  const errors: string[] = [];
  const canonicalByIndex = new Map<number, ServiceWorkOrderColumn>();
  const seenNames = new Set<string>();

  for (const col of contract) {
    if (col.letter !== columnLetterFromIndex(col.index)) {
      errors.push(
        `Column "${col.name}" has letter "${col.letter}" but index ${col.index} should map to "${columnLetterFromIndex(col.index)}".`,
      );
    }
    if (seenNames.has(col.name)) {
      errors.push(`Duplicate canonical name "${col.name}".`);
    }
    seenNames.add(col.name);

    if (col.legacy_alias) {
      const canonical = canonicalByIndex.get(col.index);
      if (!canonical) {
        errors.push(
          `Legacy alias "${col.name}" at index ${col.index} (${col.letter}) has no canonical owner declared earlier in the contract.`,
        );
      }
      continue;
    }
    if (canonicalByIndex.has(col.index)) {
      const existing = canonicalByIndex.get(col.index)!;
      errors.push(
        `Duplicate canonical owner at index ${col.index} (${col.letter}): "${existing.name}" vs "${col.name}". Mark one as legacy_alias if intentional.`,
      );
      continue;
    }
    canonicalByIndex.set(col.index, col);
  }

  for (let i = 0; i < SERVICE_WORK_ORDERS_COL_COUNT; i++) {
    if (!canonicalByIndex.has(i)) {
      errors.push(`Missing canonical owner for index ${i} (${columnLetterFromIndex(i)}).`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Returns the canonical (non-alias) column entry for an index, or undefined
 * if the contract has no canonical owner for that index.
 */
export function canonicalColumnAt(index: number): ServiceWorkOrderColumn | undefined {
  return SERVICE_WORK_ORDERS_CONTRACT.find(c => c.index === index && !c.legacy_alias);
}

/**
 * Throws if the live Sheet header row does not match the contract's canonical
 * names in column order. Aliased duplicate-index entries are excluded — only
 * the canonical owners are compared.
 *
 * Used by future read-path validators when ground-truthing the live Sheet
 * (BAN-179.B+). Not invoked at module load.
 */
export function assertHeaderMatchesContract(
  actualHeaders: readonly (string | undefined | null)[],
  tableLabel = 'Service_Work_Orders',
): void {
  const expected = SERVICE_WORK_ORDERS_CONTRACT
    .filter(c => !c.legacy_alias)
    .sort((a, b) => a.index - b.index)
    .map(c => c.name);

  const mismatches: string[] = [];
  for (let i = 0; i < expected.length; i++) {
    const actual = (actualHeaders[i] || '').toString().trim();
    if (actual !== expected[i]) {
      mismatches.push(
        `${tableLabel} column ${columnLetterFromIndex(i)} (index ${i}): expected "${expected[i]}", got "${actual}".`,
      );
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`SERVICE_WORK_ORDERS schema drift:\n${mismatches.join('\n')}`);
  }
}
