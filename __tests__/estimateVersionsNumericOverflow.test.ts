import { readFileSync } from 'fs';
import path from 'path';

const mockRequireKulaSession = jest.fn();
const mockGetBusinessRule = jest.fn();
const mockEmitMCEvent = jest.fn();
const mockQueryOne = jest.fn();

jest.mock('@/lib/work-records/authz', () => ({
  requireKulaSession: mockRequireKulaSession,
}));

jest.mock('@/lib/business_rules', () => ({
  getBusinessRule: mockGetBusinessRule,
}));

jest.mock('@/lib/events', () => ({
  emitMCEvent: mockEmitMCEvent,
}));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

jest.mock('@/lib/work-records/db', () => ({
  query: jest.fn(),
  queryOne: mockQueryOne,
}));

function jsonRequest(body: Record<string, unknown>) {
  return new Request('https://example.test/api/estimate-versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('BAN-236 estimate version numeric overflow regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockRequireKulaSession.mockResolvedValue({
      email: 'kai@kulaglass.com',
      role: 'estimator',
      user: { user_id: '00000000-0000-4000-8000-000000000123' },
    });
    mockEmitMCEvent.mockResolvedValue(undefined);
  });

  it('widens percentage snapshot columns to hold whole-percent business rules', () => {
    const migration = readFileSync(
      path.join(process.cwd(), 'db/migrations/0010_fix_estimate_versions_numeric_precision.sql'),
      'utf8',
    );

    expect(migration).toContain('ALTER COLUMN "snapshot_get_rate" TYPE numeric(7,4)');
    expect(migration).toContain('ALTER COLUMN "snapshot_overhead_markup_pct" TYPE numeric(7,4)');
    expect(migration).toContain('ALTER COLUMN "snapshot_profit_markup_pct" TYPE numeric(7,4)');
    expect(migration).toContain('ALTER COLUMN "snapshot_profit_markup_pct" TYPE numeric(5,4)');
  });

  it('POST snapshots the BG1 BID-26-0001 business-rule values without route conversion', async () => {
    mockGetBusinessRule.mockImplementation(async (key: string) => {
      const values: Record<string, unknown> = {
        default_get_rate_pct: '4.712',
        glazier_journeyman_burdened_rate_hourly: '106.88',
        default_profit_pct: '10.0',
      };
      return {
        rule_id: `rule-${key}`,
        kid: `BRL-${key}`,
        rule_key: key,
        rule_value: values[key],
        value_type: key.includes('pct') ? 'percentage' : 'currency',
        effective_start: '2026-01-01',
        effective_end: null,
      };
    });
    mockQueryOne
      .mockResolvedValueOnce({ next_version: 1 })
      .mockResolvedValueOnce({
        estimate_version_id: '10000000-0000-4000-8000-000000000001',
        estimate_id: '20000000-0000-4000-8000-000000000001',
        version_number: 1,
      });

    const { POST } = await import('@/app/api/estimate-versions/route');
    const res = await POST(jsonRequest({
      estimate_id: '20000000-0000-4000-8000-000000000001',
      effective_date: '2026-05-13',
      total_amount: '123456.78',
      synthetic_flow: 'BID-26-0001 -> estimate -> estimate_version',
    }) as never);

    expect(res.status).toBe(201);
    expect(mockQueryOne).toHaveBeenCalledTimes(2);
    const insertParams = mockQueryOne.mock.calls[1][1];
    expect(insertParams).toEqual([
      '20000000-0000-4000-8000-000000000001',
      1,
      null,
      4.712,
      106.88,
      null,
      10,
      '123456.78',
      null,
      expect.any(String),
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000123',
    ]);
    expect(mockEmitMCEvent).toHaveBeenCalledWith(expect.objectContaining({
      entity_kid: '10000000-0000-4000-8000-000000000001',
      entity_type: 'estimate',
      event_type: 'ESTIMATE_VERSION_FROZEN',
      submitted_by: 'kai@kulaglass.com',
      origin: 'office',
    }));
  });
});

export {};
