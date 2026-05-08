import {
  buildServiceWorkOrderPostgresCandidate,
  runServiceWorkOrdersPostgresShadowDryRun,
  shadowFlagsFromEnv,
} from '@/lib/service-work-orders/postgres-shadow';
import { canonicalServiceWorkOrdersHeaders } from '@/lib/contracts/service-work-orders-drift';

const LIVE_KNOWN_HEADER_2026_05_07 = [
  'wo_id', 'wo_number', 'name', 'description', 'status', 'island', 'area_of_island', 'address',
  'contact_person', 'contact_title', 'contact_phone', 'contact_email', 'customer_name', 'system_type',
  'assigned_to', 'date_received', 'due_date', 'scheduled_date', 'start_date', 'hours_estimated',
  'hours_actual', 'men_required', 'comments', 'folder_url', 'quote_total', 'quote_status',
  'qbo_invoice_id', 'invoice_number', 'invoice_total', 'invoice_balance', 'invoice_date',
  'deposit_status', 'deposit_amount', 'deposit_invoice_num', 'deposit_sent_date', 'deposit_paid_date',
  'final_status', 'final_amount', 'final_invoice_num', 'final_sent_date', 'final_paid_date',
  'invoices_json', 'org_id', 'Customer_ID', 'Legacy_Flag', 'legacy_wo_ids', 'requires_org_assignment',
];

function baseRow(overrides: Record<number, string> = {}) {
  const row = Array(47).fill('');
  row[0] = 'WO-26-9999';
  row[1] = '26-9999';
  row[2] = 'Test Customer — Shower';
  row[3] = 'Replace shower glass';
  row[4] = 'quote';
  row[5] = 'Maui';
  row[13] = 'Shower';
  row[17] = '2026-05-12';
  row[23] = 'https://drive.google.com/drive/folders/test';
  row[24] = '$1,234.56';
  row[26] = '12345';
  row[27] = 'INV-12345';
  row[28] = '1234.56';
  row[29] = '0';
  row[30] = '2026-05-01';
  row[43] = 'CUST-1';
  return Object.assign(row, overrides);
}

describe('Service Work Orders Postgres shadow adapter dry-run', () => {
  it('maps a live legacy QBO-first row into a low-confidence candidate without pretending it is clean', () => {
    const mapped = buildServiceWorkOrderPostgresCandidate(LIVE_KNOWN_HEADER_2026_05_07, baseRow());

    expect(mapped.headerReport.shape).toBe('legacy_qbo_first');
    expect(mapped.rowReport.shape).toBe('legacy_qbo_first');
    expect(mapped.wo_number).toBe('26-9999');
    expect(mapped.kid).toBe('WO-26-9999');
    expect(mapped.status).toBe('quoted');
    expect(mapped.island).toBe('maui');
    expect(mapped.quote_total).toBe('1234.56');
    expect(mapped.metadata.header_shape).toBe('legacy_qbo_first');
    expect(mapped.metadata.deposit_block_dormant).toBe(true);
    expect(mapped.metadata.qbo_deposit_ambiguity).toBe('legacy_qbo_first_dormant_deposit');
    expect(mapped.metadata.confidence).toBe('low');
    expect(mapped.legacy_payload.aa_to_ah_header).toEqual(LIVE_KNOWN_HEADER_2026_05_07.slice(26, 34));
  });

  it('flags mixed AA:AH drift for manual invoice review', () => {
    const row = baseRow({
      26: '2026-05-07T12:00:00.000Z',
      27: '2026-05-07T12:10:00.000Z',
      28: 'banyan_dispatch',
      29: '12345',
      30: '2026-05-01',
    });

    const mapped = buildServiceWorkOrderPostgresCandidate(LIVE_KNOWN_HEADER_2026_05_07, row);

    expect(mapped.rowReport.shape).toBe('mixed_drift');
    expect(mapped.metadata.requires_manual_invoice_review).toBe(true);
    expect(mapped.metadata.qbo_deposit_ambiguity).toBe('manual_review_required');
  });

  it('flags populated AF:AH deposit cells as non-dormant/manual-review', () => {
    const row = baseRow({ 31: 'sent', 32: '500', 33: 'DEP-100' });
    const mapped = buildServiceWorkOrderPostgresCandidate(LIVE_KNOWN_HEADER_2026_05_07, row);

    expect(mapped.rowReport.depositSignals).toBe(3);
    expect(mapped.metadata.deposit_block_dormant).toBe(false);
    expect(mapped.metadata.requires_manual_invoice_review).toBe(true);
  });

  it('does not call insert function by default', async () => {
    const insertFn = jest.fn();
    const result = await runServiceWorkOrdersPostgresShadowDryRun(
      LIVE_KNOWN_HEADER_2026_05_07,
      baseRow(),
      { environment: 'staging' },
      insertFn,
    );

    expect(result.mode).toBe('dry_run');
    expect(result.canWrite).toBe(false);
    expect(result.blockedReasons).toEqual(expect.arrayContaining([
      'WO_POSTGRES_SHADOW_ENABLED is not true.',
      'WO_POSTGRES_SHADOW_DRY_RUN is active.',
    ]));
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('blocks drifted rows when writes are enabled but drift allowance is not explicit', async () => {
    const insertFn = jest.fn();
    const result = await runServiceWorkOrdersPostgresShadowDryRun(
      LIVE_KNOWN_HEADER_2026_05_07,
      baseRow(),
      { enabled: true, dryRun: false, environment: 'staging', allowDriftedRows: false },
      insertFn,
    );

    expect(result.mode).toBe('write_disabled');
    expect(result.canWrite).toBe(false);
    expect(result.blockedReasons.join(' ')).toContain('legacy_qbo_first');
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('blocks production writes even when every gate is otherwise true', async () => {
    const insertFn = jest.fn();
    const result = await runServiceWorkOrdersPostgresShadowDryRun(
      canonicalServiceWorkOrdersHeaders(),
      baseRow({
        26: '2026-05-07T12:00:00.000Z',
        27: '2026-05-07T12:10:00.000Z',
        28: 'banyan_dispatch',
        29: '',
        30: '',
      }),
      { enabled: true, dryRun: false, environment: 'production', allowDriftedRows: true },
      insertFn,
    );

    expect(result.canWrite).toBe(false);
    expect(result.blockedReasons).toContain('Production shadow writes are not authorized by BAN-179.B.');
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('allows insert function only when all no-write gates are explicitly open outside production', async () => {
    const insertFn = jest.fn().mockResolvedValue({ ok: true });
    const result = await runServiceWorkOrdersPostgresShadowDryRun(
      canonicalServiceWorkOrdersHeaders(),
      baseRow({
        26: '2026-05-07T12:00:00.000Z',
        27: '2026-05-07T12:10:00.000Z',
        28: 'banyan_dispatch',
        29: '',
        30: '',
      }),
      { enabled: true, dryRun: false, environment: 'staging', allowDriftedRows: true },
      insertFn,
    );

    expect(result.mode).toBe('ready_to_write');
    expect(result.canWrite).toBe(true);
    expect(insertFn).toHaveBeenCalledTimes(1);
  });

  it('reads conservative flags from env by default', () => {
    expect(shadowFlagsFromEnv({ NODE_ENV: 'test' })).toMatchObject({
      enabled: false,
      dryRun: true,
      allowDriftedRows: false,
      environment: 'test',
    });
  });
});
