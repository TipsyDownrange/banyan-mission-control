import {
  postgresShadowRowToServiceWorkOrder,
  postgresStatusToServiceStatus,
  shouldReadServiceWorkOrdersFromPostgres,
} from '@/lib/service-work-orders/postgres-read';

jest.mock('@/lib/env', () => ({
  isStaging: jest.fn(() => process.env.VERCEL_TARGET_ENV === 'staging'),
}));

describe('service work order Postgres read mapping', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('only enables the read path when explicitly enabled on staging', () => {
    process.env.WO_POSTGRES_READ_ENABLED = 'true';
    process.env.VERCEL_TARGET_ENV = 'staging';
    expect(shouldReadServiceWorkOrdersFromPostgres()).toBe(true);

    process.env.VERCEL_TARGET_ENV = 'production';
    expect(shouldReadServiceWorkOrdersFromPostgres()).toBe(false);

    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.WO_POSTGRES_READ_ENABLED = 'false';
    expect(shouldReadServiceWorkOrdersFromPostgres()).toBe(false);
  });

  it('maps legacy shadow rows to the existing Service API shape without UUID assignment leakage', () => {
    const wo = postgresShadowRowToServiceWorkOrder({
      wo_id: '11111111-1111-4111-8111-111111111111',
      wo_number: '26-8484',
      kid: 'WO-26-8484',
      name: 'Joey Rescue Smoke Test',
      description: 'Shadow row',
      status: 'declined',
      island: 'maui',
      org_id: null,
      system_type: 'Shower Door',
      scheduled_date: '2026-05-09',
      quote_total: '1234.50',
      folder_url: 'https://drive.google.com/drive/folders/abc123',
      legacy_wo_ids: null,
      legacy_customer_id: 'CUST-1',
      legacy_payload: {
        address_raw: 'Kihei, HI',
        assigned_to_raw: 'Joey Ritthaler',
        assigned_tokens: ['Joey Ritthaler'],
        assigned_user_ids: ['USR-030'],
        legacy_flag_raw: 'true',
      },
      metadata: {
        import_mode: 'legacy_payload_shadow',
        assigned_user_ids_raw_preserved: ['USR-030'],
        assigned_db_user_ids: [],
      },
      created_at: '2026-05-09T00:00:00.000Z',
      updated_at: '2026-05-09T00:00:00.000Z',
    });

    expect(wo).toMatchObject({
      id: 'WO-26-8484',
      wo_id: 'WO-26-8484',
      wo_number: '26-8484',
      name: 'Joey Rescue Smoke Test',
      status: 'lost',
      rawStatus: 'declined',
      island: 'Maui',
      assignedTo: 'Joey Ritthaler',
      folderUrl: 'https://drive.google.com/drive/folders/abc123',
      customer_id: 'CUST-1',
      requires_org_assignment: true,
      source: 'postgres_shadow',
      postgres_shadow: true,
    });
  });

  it('keeps Postgres statuses compatible with the existing UI stage model', () => {
    expect(postgresStatusToServiceStatus('declined')).toBe('lost');
    expect(postgresStatusToServiceStatus('quoted')).toBe('quoted');
    expect(postgresStatusToServiceStatus(null)).toBe('lead');
  });
});
