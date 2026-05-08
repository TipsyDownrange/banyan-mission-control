import {
  LEGACY_QBO_FIRST_AA_AH,
  canonicalServiceWorkOrdersHeaders,
  classifyServiceWorkOrdersHeader,
  classifyServiceWorkOrdersRowAAtoAH,
  summarizeServiceWorkOrdersRowShapes,
} from '@/lib/contracts/service-work-orders-drift';

const LIVE_KNOWN_HEADER_2026_05_07 = [
  'wo_id',
  'wo_number',
  'name',
  'description',
  'status',
  'island',
  'area_of_island',
  'address',
  'contact_person',
  'contact_title',
  'contact_phone',
  'contact_email',
  'customer_name',
  'system_type',
  'assigned_to',
  'date_received',
  'due_date',
  'scheduled_date',
  'start_date',
  'hours_estimated',
  'hours_actual',
  'men_required',
  'comments',
  'folder_url',
  'quote_total',
  'quote_status',
  'qbo_invoice_id',
  'invoice_number',
  'invoice_total',
  'invoice_balance',
  'invoice_date',
  'deposit_status',
  'deposit_amount',
  'deposit_invoice_num',
  'deposit_sent_date',
  'deposit_paid_date',
  'final_status',
  'final_amount',
  'final_invoice_num',
  'final_sent_date',
  'final_paid_date',
  'invoices_json',
  'org_id',
  'Customer_ID',
  'Legacy_Flag',
  'legacy_wo_ids',
  'requires_org_assignment',
];

describe('Service_Work_Orders header drift classifier', () => {
  it('classifies the BAN-179.A code contract as metadata-first', () => {
    const report = classifyServiceWorkOrdersHeader(canonicalServiceWorkOrdersHeaders());

    expect(report.shape).toBe('contract_v2_metadata_first');
    expect(report.columnCount).toBe(47);
    expect(report.mismatches).toEqual([]);
  });

  it('classifies the live 2026-05-07 staging/production header as legacy QBO-first', () => {
    const report = classifyServiceWorkOrdersHeader(LIVE_KNOWN_HEADER_2026_05_07);

    expect(report.shape).toBe('legacy_qbo_first');
    expect(report.columnCount).toBe(47);
    expect(report.mismatches.map(item => `${item.letter}:${item.actual}`)).toEqual([
      'AA:qbo_invoice_id',
      'AB:invoice_number',
      'AC:invoice_total',
      'AD:invoice_balance',
      'AE:invoice_date',
      'AF:deposit_status',
      'AG:deposit_amount',
      'AH:deposit_invoice_num',
      'AR:Customer_ID',
      'AS:Legacy_Flag',
    ]);
    expect(report.notes.join(' ')).toContain('legacy QBO-first');
  });

  it('exports the legacy AA:AH block used by the live header', () => {
    expect(LIVE_KNOWN_HEADER_2026_05_07.slice(26, 34)).toEqual([...LEGACY_QBO_FIRST_AA_AH]);
  });

  it('flags row-level mixed drift when AA:AH contains metadata and QBO-looking values', () => {
    const report = classifyServiceWorkOrdersRowAAtoAH([
      '2026-05-07T12:00:00.000Z',
      '2026-05-07T12:10:00.000Z',
      'banyan_dispatch',
      '12345',
      '2026-05-01',
      '',
      '',
      '',
    ]);

    expect(report.shape).toBe('mixed_drift');
    expect(report.metadataSignals).toBeGreaterThan(0);
    expect(report.qboSignals).toBeGreaterThan(0);
    expect(report.depositSignals).toBe(0);
    expect(report.notes.join(' ')).toContain('dormant');
  });

  it('flags populated AF:AH deposit cells as non-dormant drift', () => {
    const report = classifyServiceWorkOrdersRowAAtoAH([
      '',
      '',
      '',
      '',
      '',
      'sent',
      '1000',
      'INV-123',
    ]);

    expect(report.shape).toBe('mixed_drift');
    expect(report.depositSignals).toBe(3);
    expect(report.notes.join(' ')).toContain('do not treat deposit block as dormant');
  });

  it('summarizes the observed live row-shape sample as mixed drift with dormant deposits', () => {
    const report = summarizeServiceWorkOrdersRowShapes([
      ['98765', 'INV-1001', '2400', '0', '2026-05-01', '', '', ''],
      ['2026-05-07T12:00:00.000Z', '2026-05-07T12:10:00.000Z', 'banyan_dispatch', '', '', '', '', ''],
    ]);

    expect(report.shape).toBe('mixed_drift');
    expect(report.depositSignals).toBe(0);
    expect(report.notes.join(' ')).toContain('dormant');
  });
});
