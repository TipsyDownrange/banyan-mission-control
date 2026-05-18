/**
 * BAN-329 — aggregator GET /api/aia/tm-tickets/by-kid/[kid]
 *
 * Mirrors the BAN-322 billing aggregator test harness — DB is mocked,
 * each db.select(...).from(table) chain resolves to rows stashed by
 * label.
 */

export {};

type Row = Record<string, unknown>;

const rowsByLabel: Record<string, Row[]> = {};
const fromCalls: string[] = [];

function tbl(label: string) {
  return {
    _label: label,
    tenant_id: { name: 'tenant_id' },
    engagement_id: { name: 'engagement_id' },
    kid: { name: 'kid' },
    pay_app_id: { name: 'pay_app_id' },
    pay_app_number: { name: 'pay_app_number' },
    tm_auth_id: { name: 'tm_auth_id' },
    ticket_id: { name: 'ticket_id' },
    work_date: { name: 'work_date' },
    created_at: { name: 'created_at' },
  } as Record<string, unknown> & { _label: string };
}

jest.mock('drizzle-orm', () => ({
  __esModule: true,
  and: (...args: unknown[]) => ({ _and: args }),
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  desc: (a: unknown) => ({ _desc: a }),
  asc: (a: unknown) => ({ _asc: a }),
}));

jest.mock('@/db', () => {
  function makeChain(label: string) {
    const chain: Record<string, unknown> = {};
    chain.where = jest.fn(() => chain);
    chain.orderBy = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.offset = jest.fn(() => chain);
    chain.then = (resolve: (rows: Row[]) => unknown) => {
      const rows = rowsByLabel[label] ?? [];
      return Promise.resolve(resolve(rows));
    };
    return chain;
  }

  const select = jest.fn(() => ({
    from: (handle: { _label: string }) => {
      fromCalls.push(handle._label);
      return makeChain(handle._label);
    },
  }));

  return {
    __esModule: true,
    db: { select },
    engagements: tbl('engagements'),
    tm_tickets: tbl('tm_tickets'),
    tm_authorizations: tbl('tm_authorizations'),
    pay_applications: tbl('pay_applications'),
  };
});

const mockCheckPermission: jest.Mock = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => TENANT_ID,
}));

const ENG_ID = '00000000-0000-4000-8000-0000000000aa';

function get(kid: string): Request {
  return new Request(`https://mc.local/api/aia/tm-tickets/by-kid/${encodeURIComponent(kid)}`);
}

function ctx(kid: string) {
  return { params: Promise.resolve({ kid }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(rowsByLabel)) delete rowsByLabel[k];
  fromCalls.length = 0;
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'kai@kulaglass.com' });
});

describe('BAN-329 GET /api/aia/tm-tickets/by-kid/[kid]', () => {
  it('returns 403 when permission check fails', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false, role: 'guest', email: null });
    const route = require('@/app/api/aia/tm-tickets/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-26-0001'), ctx('PRJ-26-0001'));
    expect(res.status).toBe(403);
  });

  it('returns kIDFound:false with empty payload when kid does not resolve', async () => {
    rowsByLabel.engagements = [];
    const route = require('@/app/api/aia/tm-tickets/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-99-9999'), ctx('PRJ-99-9999'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kIDFound).toBe(false);
    expect(body.engagement).toBeNull();
    expect(body.tickets).toEqual([]);
    expect(body.summary.total_count).toBe(0);
    expect(body.summary.total_value_usd).toBe(0);
    // Should NOT have fanned out beyond the engagement lookup
    expect(fromCalls).toEqual(['engagements']);
  });

  it('returns 400 when kid path param is empty after decoding', async () => {
    const route = require('@/app/api/aia/tm-tickets/by-kid/[kid]/route');
    const res = await route.GET(get(' '), ctx(' '));
    expect(res.status).toBe(400);
  });

  it('returns kIDFound:true with the full payload, joining auth + pay app references', async () => {
    rowsByLabel.engagements = [{
      engagement_id: ENG_ID,
      kid: 'PRJ-26-0001',
      status: 'active',
      engagement_type: 'project',
      pm_handoff_state: 'active',
      is_test_project: false,
    }];
    rowsByLabel.tm_tickets = [
      {
        ticket_id: 't1',
        tm_auth_id: 'auth-A',
        engagement_id: ENG_ID,
        ticket_number: 'TM-001',
        work_date: '2026-04-01',
        description: 'Patch grout',
        labor: [],
        materials: [],
        equipment: [],
        labor_total: '380',
        materials_total: '76',
        equipment_total: '0',
        ticket_total: '456',
        status: 'GC_APPROVED',
        pay_app_id: null,
        billed_at: null,
      },
      {
        ticket_id: 't2',
        tm_auth_id: 'auth-A',
        engagement_id: ENG_ID,
        ticket_number: 'TM-002',
        work_date: '2026-03-22',
        description: 'Reset stone',
        labor: [],
        materials: [],
        equipment: [],
        labor_total: '500',
        materials_total: '0',
        equipment_total: '0',
        ticket_total: '500',
        status: 'BILLED',
        pay_app_id: 'p3',
        billed_at: '2026-04-15T00:00:00Z',
      },
    ];
    rowsByLabel.tm_authorizations = [
      {
        tm_auth_id: 'auth-A',
        authorization_number: '7',
        authorization_method: 'EMAIL',
        authorized_by_name: 'Sean Daniels',
        not_to_exceed_amount: '5000',
      },
    ];
    rowsByLabel.pay_applications = [
      { pay_app_id: 'p3', pay_app_number: 3, period_end: '2026-04-30' },
    ];

    const route = require('@/app/api/aia/tm-tickets/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-26-0001'), ctx('PRJ-26-0001'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.kIDFound).toBe(true);
    expect(body.engagement.engagement_id).toBe(ENG_ID);
    expect(body.tickets).toHaveLength(2);

    const billed = body.tickets.find((t: { ticket_id: string }) => t.ticket_id === 't2');
    expect(billed.billing_reference).toEqual({
      pay_app_id: 'p3',
      pay_app_number: 3,
      period_end: '2026-04-30',
    });
    expect(billed.authorization_reference.authorization_number).toBe('7');

    const draft = body.tickets.find((t: { ticket_id: string }) => t.ticket_id === 't1');
    expect(draft.billing_reference).toBeNull();
    expect(draft.authorization_reference.authorized_by_name).toBe('Sean Daniels');

    expect(body.summary.total_count).toBe(2);
    expect(body.summary.total_value_usd).toBe(956);
    expect(body.summary.billed_value_usd).toBe(500);
    expect(body.summary.unbilled_value_usd).toBe(456);
    expect(body.summary.by_state.GC_APPROVED).toBe(1);
    expect(body.summary.by_state.BILLED).toBe(1);

    // All 4 tables hit
    expect(fromCalls).toEqual(expect.arrayContaining([
      'engagements', 'tm_tickets', 'tm_authorizations', 'pay_applications',
    ]));
  });

  it('counts PAID tickets toward billed_value_usd (terminal billing-state rollup)', async () => {
    rowsByLabel.engagements = [{
      engagement_id: ENG_ID,
      kid: 'PRJ-26-0001',
      status: 'active',
      engagement_type: 'project',
      pm_handoff_state: 'active',
      is_test_project: true,
    }];
    rowsByLabel.tm_tickets = [
      {
        ticket_id: 't-paid',
        tm_auth_id: null,
        engagement_id: ENG_ID,
        ticket_number: 'TM-100',
        work_date: '2026-01-15',
        labor: [], materials: [], equipment: [],
        labor_total: '0', materials_total: '0', equipment_total: '0',
        ticket_total: '1234',
        status: 'PAID',
        pay_app_id: null,
      },
    ];

    const route = require('@/app/api/aia/tm-tickets/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-26-0001'), ctx('PRJ-26-0001'));
    const body = await res.json();
    expect(body.engagement.is_test_project).toBe(true);
    expect(body.summary.billed_value_usd).toBe(1234);
    expect(body.summary.unbilled_value_usd).toBe(0);
    expect(body.summary.by_state.PAID).toBe(1);
  });
});
