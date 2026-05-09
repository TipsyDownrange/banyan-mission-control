import {
  buildLegacyShadowImportRow,
  buildUserAliasMap,
  extractDriveFolderId,
  resolveAssignment,
  splitAssignedTokens,
} from '@/lib/service-work-orders/legacy-shadow-import';
import { buildServiceWorkOrderPostgresCandidate } from '@/lib/service-work-orders/postgres-shadow';

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

function row(overrides: Record<number, string> = {}) {
  const r = Array(47).fill('');
  r[0] = 'WO-26-9999';
  r[1] = '26-9999';
  r[2] = 'Legacy WO';
  r[3] = 'Legacy scope';
  r[4] = 'lost';
  r[5] = 'Maui';
  r[7] = '123 Test Road, Wailuku, HI';
  r[13] = 'Storefront';
  r[14] = 'Joey Ritthaler, Nate Nakamura, Unknown Person';
  r[17] = '2026-05-12';
  r[23] = 'https://drive.google.com/drive/folders/1abcDEF_234';
  r[24] = '$1,234.56';
  r[42] = 'not-a-uuid-org';
  r[43] = 'CUST-1';
  r[44] = 'legacy';
  r[46] = 'false';
  return Object.assign(r, overrides);
}

describe('WO Postgres legacy shadow import helpers', () => {
  it('splits assignment crews and resolves aliases while preserving unresolved tokens', () => {
    const aliases = buildUserAliasMap([
      ['11111111-1111-4111-8111-111111111111', 'Joey Ritthaler', '', 'joey@kulaglass.com'],
      ['22222222-2222-4222-8222-222222222222', 'Nate Nakamura', '', 'nate@kulaglass.com'],
    ]);

    expect(splitAssignedTokens('Joey Ritthaler, Nate Nakamura and Unknown Person')).toEqual([
      'Joey Ritthaler', 'Nate Nakamura', 'Unknown Person',
    ]);

    const resolved = resolveAssignment('JOEY@KULAGLASS.COM, Nate Nakamura, Unknown Person', aliases);
    expect(resolved.status).toBe('partial');
    expect(resolved.assigned_user_ids).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(resolved.unresolved_tokens).toEqual(['Unknown Person']);
  });

  it('builds a legacy-safe low-confidence import row without forcing raw org ids into UUID columns', () => {
    const aliases = buildUserAliasMap([
      ['11111111-1111-4111-8111-111111111111', 'Joey Ritthaler', '', 'joey@kulaglass.com'],
      ['22222222-2222-4222-8222-222222222222', 'Nate Nakamura', '', 'nate@kulaglass.com'],
    ]);
    const candidate = buildServiceWorkOrderPostgresCandidate(LIVE_KNOWN_HEADER_2026_05_07, row());
    const assignment = resolveAssignment(candidate.assigned_to_raw, aliases);
    const importRow = buildLegacyShadowImportRow(candidate, assignment);

    expect(candidate.status).toBe('declined');
    expect(importRow.stableKey).toBe('WO-26-9999');
    expect(importRow.values.status).toBe('declined');
    expect(importRow.values.folder_id).toBe('1abcDEF_234');
    expect(importRow.values.org_id).toBeNull();
    expect(importRow.values.legacy_customer_id).toBe('CUST-1');
    expect(importRow.values.assigned_to).toBe('11111111-1111-4111-8111-111111111111');
    expect(importRow.values.assigned_crew).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(importRow.values.metadata).toMatchObject({
      import_mode: 'legacy_payload_shadow',
      confidence: 'low',
      assignment_resolution_status: 'partial',
      org_id_raw_preserved: 'not-a-uuid-org',
      org_id_mapped_to_uuid: false,
      assigned_unresolved_tokens: ['Unknown Person'],
    });
    expect(importRow.values.legacy_payload).toMatchObject({
      legacy_shadow_import: true,
      org_id_raw: 'not-a-uuid-org',
      customer_id_raw: 'CUST-1',
      assigned_unresolved_tokens: ['Unknown Person'],
      source_folder_url: 'https://drive.google.com/drive/folders/1abcDEF_234',
    });
  });

  it('extracts Drive folder ids from standard folder URLs and id params', () => {
    expect(extractDriveFolderId('https://drive.google.com/drive/folders/abc_123-XYZ')).toBe('abc_123-XYZ');
    expect(extractDriveFolderId('https://drive.google.com/open?id=abc_123-XYZ')).toBe('abc_123-XYZ');
    expect(extractDriveFolderId('')).toBeNull();
  });
});
