/**
 * Contract tests for `lib/contracts/service-work-orders.ts` (BAN-179.A).
 *
 * Goals:
 *  - All 47 columns A–AU are represented exactly once each as a canonical
 *    owner.
 *  - No accidental duplicate index — duplicates are tolerated only when
 *    explicitly tagged `legacy_alias: true`.
 *  - Column letters and indices stay symmetrical (A=0, AU=46, etc.).
 *  - Metadata positions (created_at, updated_at, source) live at AA, AB, AC.
 *  - QBO invoice positions (qbo_invoice_id, invoice_number, invoice_total,
 *    invoice_balance, invoice_date) live at AD, AE, AF, AG, AH.
 *  - Identity positions (org_id, customer_id, legacy_flag, legacy_wo_ids,
 *    requires_org_assignment) live at AQ, AR, AS, AT, AU.
 *  - Route-level COL maps (service/route, service/update/route,
 *    qbo/sync-invoices, finance/sync-status, service/dispatch-pdf,
 *    service/wo-list, admin/backfill-wo-customer-fk, jobs/[woId]/upload)
 *    align with the shared contract.
 *
 * No external services are called by this test.
 */

import {
  SERVICE_WORK_ORDERS_CONTRACT,
  SERVICE_WORK_ORDERS_COL_COUNT,
  SERVICE_WORK_ORDERS_RANGE_END,
  SWO_COL,
  SWO_LETTER,
  ServiceWorkOrderColumn,
  assertHeaderMatchesContract,
  canonicalColumnAt,
  columnLetterFromIndex,
  validateContract,
} from '@/lib/contracts/service-work-orders';

describe('Service_Work_Orders shared contract', () => {
  it('declares exactly 47 physical columns (A–AU)', () => {
    expect(SERVICE_WORK_ORDERS_COL_COUNT).toBe(47);
    expect(SERVICE_WORK_ORDERS_RANGE_END).toBe('AU');
    expect(columnLetterFromIndex(SERVICE_WORK_ORDERS_COL_COUNT - 1)).toBe('AU');
    expect(columnLetterFromIndex(0)).toBe('A');
    expect(columnLetterFromIndex(25)).toBe('Z');
    expect(columnLetterFromIndex(26)).toBe('AA');
  });

  it('passes structural validation', () => {
    const result = validateContract();
    if (!result.valid) {
      // Surface every error in a single failure message.
      throw new Error(`Contract validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('covers every physical index 0..46 with exactly one canonical (non-alias) owner', () => {
    const owners = new Map<number, ServiceWorkOrderColumn>();
    for (const col of SERVICE_WORK_ORDERS_CONTRACT) {
      if (col.legacy_alias) continue;
      expect(owners.has(col.index))
        .toBe(false); // duplicate canonical owner is a hard fail
      owners.set(col.index, col);
    }
    for (let i = 0; i < SERVICE_WORK_ORDERS_COL_COUNT; i++) {
      expect(owners.has(i)).toBe(true);
    }
    expect(owners.size).toBe(SERVICE_WORK_ORDERS_COL_COUNT);
  });

  it('keeps letter/index pairs symmetrical for every entry (canonical and alias)', () => {
    for (const col of SERVICE_WORK_ORDERS_CONTRACT) {
      expect(col.letter).toBe(columnLetterFromIndex(col.index));
    }
  });

  it('uses unique canonical names', () => {
    const seen = new Set<string>();
    for (const col of SERVICE_WORK_ORDERS_CONTRACT) {
      expect(seen.has(col.name)).toBe(false);
      seen.add(col.name);
    }
  });

  it('places metadata at AA, AB, AC (created_at, updated_at, source)', () => {
    expect(SWO_COL.created_at).toBe(26);
    expect(SWO_COL.updated_at).toBe(27);
    expect(SWO_COL.source).toBe(28);
    expect(SWO_LETTER.created_at).toBe('AA');
    expect(SWO_LETTER.updated_at).toBe('AB');
    expect(SWO_LETTER.source).toBe('AC');

    // Defensive: the canonical owners at these indices must be the metadata
    // names, NOT the QBO invoice fields. This is the original BAN-179 P0 bug.
    expect(canonicalColumnAt(26)?.name).toBe('created_at');
    expect(canonicalColumnAt(27)?.name).toBe('updated_at');
    expect(canonicalColumnAt(28)?.name).toBe('source');
  });

  it('places QBO invoice fields at AD–AH', () => {
    expect(SWO_COL.qbo_invoice_id).toBe(29);
    expect(SWO_COL.invoice_number).toBe(30);
    expect(SWO_COL.invoice_total).toBe(31);
    expect(SWO_COL.invoice_balance).toBe(32);
    expect(SWO_COL.invoice_date).toBe(33);
    expect(SWO_LETTER.qbo_invoice_id).toBe('AD');
    expect(SWO_LETTER.invoice_number).toBe('AE');
    expect(SWO_LETTER.invoice_total).toBe('AF');
    expect(SWO_LETTER.invoice_balance).toBe('AG');
    expect(SWO_LETTER.invoice_date).toBe('AH');

    expect(canonicalColumnAt(29)?.name).toBe('qbo_invoice_id');
    expect(canonicalColumnAt(30)?.name).toBe('invoice_number');
    expect(canonicalColumnAt(31)?.name).toBe('invoice_total');
    expect(canonicalColumnAt(32)?.name).toBe('invoice_balance');
    expect(canonicalColumnAt(33)?.name).toBe('invoice_date');
  });

  it('places identity / FK fields at AQ–AU', () => {
    expect(SWO_COL.org_id).toBe(42);
    expect(SWO_COL.customer_id).toBe(43);
    expect(SWO_COL.legacy_flag).toBe(44);
    expect(SWO_COL.legacy_wo_ids).toBe(45);
    expect(SWO_COL.requires_org_assignment).toBe(46);
    expect(SWO_LETTER.org_id).toBe('AQ');
    expect(SWO_LETTER.customer_id).toBe('AR');
    expect(SWO_LETTER.legacy_flag).toBe('AS');
    expect(SWO_LETTER.legacy_wo_ids).toBe('AT');
    expect(SWO_LETTER.requires_org_assignment).toBe('AU');
  });

  it('does not allow created_at/updated_at/source to share an index with QBO invoice fields', () => {
    // This is the regression guard for the BAN-179 root cause: a previous
    // edit (commit 14ef33c) set qbo_invoice_id = 26, invoice_number = 27,
    // invoice_total = 28, colliding with the metadata cells.
    expect(SWO_COL.created_at).not.toBe(SWO_COL.qbo_invoice_id);
    expect(SWO_COL.updated_at).not.toBe(SWO_COL.invoice_number);
    expect(SWO_COL.source).not.toBe(SWO_COL.invoice_total);
  });

  it('flags legacy deposit_*/final_* aliases that overlap canonical QBO invoice cells', () => {
    // The legacy invoicing-tracker fields share AF/AG/AH with QBO invoice
    // fields. They must be tagged `legacy_alias: true` so the duplicate-index
    // assertion treats them as known overlaps requiring a Sean decision
    // (see contract module header / docs/audits/ban-179a-*.md).
    const aliasNames = SERVICE_WORK_ORDERS_CONTRACT
      .filter(c => c.legacy_alias)
      .map(c => c.name)
      .sort();
    expect(aliasNames).toEqual(
      ['deposit_amount', 'deposit_invoice_num', 'deposit_status'].sort(),
    );

    for (const col of SERVICE_WORK_ORDERS_CONTRACT) {
      if (!col.legacy_alias) continue;
      const canonical = canonicalColumnAt(col.index);
      expect(canonical).toBeDefined();
      expect(canonical?.legacy_alias).toBeFalsy();
      // Alias and canonical must NOT share a name.
      expect(canonical?.name).not.toBe(col.name);
    }
  });

  describe('column letter helper', () => {
    it('maps the standard A–AU letters correctly', () => {
      const expected: Array<[number, string]> = [
        [0, 'A'], [1, 'B'], [25, 'Z'],
        [26, 'AA'], [27, 'AB'], [28, 'AC'],
        [29, 'AD'], [30, 'AE'], [31, 'AF'], [32, 'AG'], [33, 'AH'],
        [34, 'AI'], [40, 'AO'], [41, 'AP'],
        [42, 'AQ'], [43, 'AR'], [44, 'AS'], [45, 'AT'], [46, 'AU'],
      ];
      for (const [idx, letter] of expected) {
        expect(columnLetterFromIndex(idx)).toBe(letter);
      }
    });

    it('rejects negative or non-integer indices', () => {
      expect(() => columnLetterFromIndex(-1)).toThrow(RangeError);
      expect(() => columnLetterFromIndex(1.5)).toThrow(RangeError);
    });
  });

  describe('header drift assertion', () => {
    it('passes when actual headers match the canonical contract', () => {
      const headers = SERVICE_WORK_ORDERS_CONTRACT
        .filter(c => !c.legacy_alias)
        .sort((a, b) => a.index - b.index)
        .map(c => c.name);
      expect(() => assertHeaderMatchesContract(headers)).not.toThrow();
    });

    it('throws when AA/AB/AC are populated with QBO invoice names', () => {
      const headers = SERVICE_WORK_ORDERS_CONTRACT
        .filter(c => !c.legacy_alias)
        .sort((a, b) => a.index - b.index)
        .map(c => c.name);
      // Simulate the duplicate-key bug being mirrored into the live header row.
      headers[26] = 'qbo_invoice_id';
      headers[27] = 'invoice_number';
      headers[28] = 'invoice_total';
      expect(() => assertHeaderMatchesContract(headers)).toThrow(/SERVICE_WORK_ORDERS schema drift/);
    });
  });
});

describe('Route column-map alignment with shared contract', () => {
  // Each test re-derives the per-route column map from the actual route
  // module to make sure no future edit silently re-introduces a local
  // duplicate or drifts off-contract. We do not invoke any handler — only
  // import the module's source for static evaluation.

  it('app/api/service/route.ts uses SWO_COL directly (no local index map)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/service/route.ts'),
      'utf8',
    );
    expect(src).toContain('@/lib/contracts/service-work-orders');
    expect(src).toContain('SWO_COL');
    // Hard-block any future re-introduction of duplicate-key COL entries.
    expect(src).not.toMatch(/qbo_invoice_id:\s*26/);
    expect(src).not.toMatch(/invoice_number:\s*27/);
    expect(src).not.toMatch(/invoice_total:\s*28/);
  });

  it('app/api/service/update/route.ts uses SWO_COL directly (no local index map)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/service/update/route.ts'),
      'utf8',
    );
    expect(src).toContain('@/lib/contracts/service-work-orders');
    expect(src).toContain('SWO_COL');
    expect(src).not.toMatch(/qbo_invoice_id:\s*26/);
    expect(src).not.toMatch(/invoice_number:\s*27/);
    expect(src).not.toMatch(/invoice_total:\s*28/);
  });

  it('app/api/qbo/sync-invoices/route.ts pulls invoice indices from SWO_COL', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/qbo/sync-invoices/route.ts'),
      'utf8',
    );
    expect(src).toContain('@/lib/contracts/service-work-orders');
    expect(src).toContain('SWO_COL.qbo_invoice_id');
    expect(src).toContain('SWO_COL.invoice_number');
    expect(src).toContain('SWO_COL.invoice_total');
    expect(src).toContain('SWO_COL.invoice_balance');
    expect(src).toContain('SWO_COL.invoice_date');
  });

  it('app/api/finance/sync-status/route.ts pulls indices from SWO_COL', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/finance/sync-status/route.ts'),
      'utf8',
    );
    expect(src).toContain('@/lib/contracts/service-work-orders');
    expect(src).toContain('SWO_COL');
  });

  it('app/api/service/dispatch-pdf/route.ts pulls indices from SWO_COL', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/service/dispatch-pdf/route.ts'),
      'utf8',
    );
    expect(src).toContain('@/lib/contracts/service-work-orders');
    expect(src).toContain('SWO_COL');
  });

  it('app/api/service/wo-list/route.ts pulls indices from SWO_COL', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/service/wo-list/route.ts'),
      'utf8',
    );
    expect(src).toContain('@/lib/contracts/service-work-orders');
    expect(src).toContain('SWO_COL');
  });

  it('app/api/admin/backfill-wo-customer-fk/route.ts pulls indices from SWO_COL', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/admin/backfill-wo-customer-fk/route.ts'),
      'utf8',
    );
    expect(src).toContain('@/lib/contracts/service-work-orders');
    expect(src).toContain('SWO_COL.customer_id');
    expect(src).toContain('SWO_COL.legacy_flag');
  });

  it('app/api/jobs/[woId]/upload/route.ts pulls folder_url index from SWO_COL', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/jobs/[woId]/upload/route.ts'),
      'utf8',
    );
    expect(src).toContain('@/lib/contracts/service-work-orders');
    expect(src).toContain('SWO_COL.folder_url');
  });
});
