import {
  engagements,
  test_project_resets,
  sov_versions,
  schedule_of_values,
  billing_format_config,
  deposit_terms,
  tm_authorizations,
  pay_applications,
  pay_app_line_items,
  pay_app_states,
  notarization_sessions,
  lien_waivers,
  cash_receipts,
  retainage_holdings,
  handoff_validations,
  tm_tickets,
  textura_submissions,
} from '@/db/schema';

describe('BAN-302 Pass 3a Drizzle schema shape', () => {
  it('augments engagements with the three D2-authorized TPA columns', () => {
    expect(engagements.is_test_project).toBeDefined();
    expect(engagements.test_project_created_by).toBeDefined();
    expect(engagements.test_project_purpose).toBeDefined();
  });

  it('exposes test_project_resets with expected audit columns', () => {
    expect(test_project_resets.reset_id).toBeDefined();
    expect(test_project_resets.engagement_id).toBeDefined();
    expect(test_project_resets.reset_by).toBeDefined();
    expect(test_project_resets.reset_at).toBeDefined();
    expect(test_project_resets.child_records_deleted).toBeDefined();
    expect(test_project_resets.reason).toBeDefined();
  });

  describe('AIA v1.1 entities (15 tables per AIA §14.1)', () => {
    const entities: Array<[string, Record<string, unknown>, string[]]> = [
      ['sov_versions', sov_versions, ['sov_version_id', 'engagement_id', 'version_number', 'state', 'source_kind']],
      ['schedule_of_values', schedule_of_values, ['sov_line_id', 'sov_version_id', 'line_number', 'description', 'scheduled_value', 'line_type']],
      ['billing_format_config', billing_format_config, ['billing_config_id', 'engagement_id', 'billing_format', 'retainage_pct', 'notarization_required']],
      ['deposit_terms', deposit_terms, ['deposit_terms_id', 'engagement_id', 'deposit_pattern', 'deposit_amount']],
      ['tm_authorizations', tm_authorizations, ['tm_auth_id', 'engagement_id', 'authorization_number', 'status', 'rate_structure']],
      ['pay_applications', pay_applications, ['pay_app_id', 'engagement_id', 'pay_app_number', 'state', 'period_start', 'period_end']],
      ['pay_app_line_items', pay_app_line_items, ['pay_app_line_id', 'pay_app_id', 'line_number', 'scheduled_value', 'work_completed_this_period', 'stored_materials']],
      ['pay_app_states', pay_app_states, ['state_change_id', 'pay_app_id', 'from_state', 'to_state', 'changed_by']],
      ['notarization_sessions', notarization_sessions, ['session_id', 'engagement_id', 'provider', 'state', 'notary_cert_ref']],
      ['lien_waivers', lien_waivers, ['waiver_id', 'engagement_id', 'waiver_type', 'state', 'notarization_session_id']],
      ['cash_receipts', cash_receipts, ['receipt_id', 'engagement_id', 'pay_app_id', 'receipt_date', 'amount', 'reconciliation_status']],
      ['retainage_holdings', retainage_holdings, ['holding_id', 'pay_app_id', 'amount_held', 'release_trigger', 'released_at']],
      ['handoff_validations', handoff_validations, ['validation_id', 'engagement_id', 'mode', 'sov_version_id', 'missing_fields', 'exceptions']],
      ['tm_tickets', tm_tickets, ['ticket_id', 'tm_auth_id', 'engagement_id', 'ticket_number', 'status', 'ticket_total']],
      ['textura_submissions', textura_submissions, ['submission_id', 'pay_app_id', 'csv_file_ref', 'submission_status']],
    ];

    expect(entities).toHaveLength(15);

    const APPEND_ONLY = new Set(['pay_app_states']);

    it.each(entities)('table %s has timestamp + tenant + required columns', (name, table, required) => {
      expect((table as Record<string, unknown>).tenant_id).toBeDefined();
      expect((table as Record<string, unknown>).created_at).toBeDefined();
      if (!APPEND_ONLY.has(name)) {
        expect((table as Record<string, unknown>).updated_at).toBeDefined();
      }
      for (const col of required) {
        expect((table as Record<string, unknown>)[col]).toBeDefined();
      }
    });
  });

  it('keeps no per-entity test_data column on AIA tables (TPA §4.2 + AIA §14.2 inheritance)', () => {
    const aiaTables: Array<Record<string, unknown>> = [
      sov_versions,
      schedule_of_values,
      billing_format_config,
      deposit_terms,
      tm_authorizations,
      pay_applications,
      pay_app_line_items,
      pay_app_states,
      notarization_sessions,
      lien_waivers,
      cash_receipts,
      retainage_holdings,
      handoff_validations,
      tm_tickets,
      textura_submissions,
    ];
    for (const table of aiaTables) {
      expect(table.test_data).toBeUndefined();
    }
  });
});
