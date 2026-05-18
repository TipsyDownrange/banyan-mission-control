/**
 * BAN-322 — aggregator GET /api/aia/billing/by-kid/[kid]
 *
 * DB layer is mocked: each db.select(...).from(table)...await resolves to
 * the rows stashed in rowsByLabel[label]. The chain is fluent + thenable so
 * the route's mix of .orderBy / .limit calls just work.
 */

type Row = Record<string, unknown>;

const rowsByLabel: Record<string, Row[]> = {};
const fromCalls: string[] = [];

function tbl(label: string) {
  // Provide just enough column placeholders for drizzle's `eq` helper. The
  // mocked eq/and/desc don't introspect their arguments — they're no-ops —
  // so empty objects are fine here.
  return {
    _label: label,
    tenant_id: { name: 'tenant_id' },
    engagement_id: { name: 'engagement_id' },
    kid: { name: 'kid' },
    pay_app_id: { name: 'pay_app_id' },
    pay_app_number: { name: 'pay_app_number' },
    sov_version_id: { name: 'sov_version_id' },
    version_number: { name: 'version_number' },
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
    pay_applications: tbl('pay_applications'),
    sov_versions: tbl('sov_versions'),
    schedule_of_values: tbl('schedule_of_values'),
    retainage_holdings: tbl('retainage_holdings'),
    notarization_sessions: tbl('notarization_sessions'),
    billing_format_config: tbl('billing_format_config'),
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
  return new Request(`https://mc.local/api/aia/billing/by-kid/${encodeURIComponent(kid)}`);
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

describe('BAN-322 GET /api/aia/billing/by-kid/[kid]', () => {
  it('returns 403 when permission check fails', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false, role: 'guest', email: null });
    const route = require('@/app/api/aia/billing/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-26-0001'), ctx('PRJ-26-0001'));
    expect(res.status).toBe(403);
  });

  it('returns the empty payload (200) when kid does not resolve to an engagement', async () => {
    rowsByLabel.engagements = [];
    const route = require('@/app/api/aia/billing/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-99-9999'), ctx('PRJ-99-9999'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.engagement).toBeNull();
    expect(body.payApps).toEqual([]);
    expect(body.sovVersions).toEqual([]);
    expect(body.sovLines).toEqual([]);
    expect(body.retainage).toEqual([]);
    expect(body.latestNotarization).toBeNull();
    expect(body.billingFormatConfig).toBeNull();
    // Should NOT have fanned out to per-table reads
    expect(fromCalls).toEqual(['engagements']);
  });

  it('returns the full payload when engagement resolves', async () => {
    rowsByLabel.engagements = [{
      engagement_id: ENG_ID,
      kid: 'PRJ-26-0001',
      status: 'active',
      engagement_type: 'project',
      pm_handoff_state: 'active',
      is_test_project: false,
    }];
    rowsByLabel.pay_applications = [
      { pay_app_id: 'p3', pay_app_number: 3, state: 'SUBMITTED', current_amount_due: '125000' },
      { pay_app_id: 'p2', pay_app_number: 2, state: 'PAID_FULL', current_amount_due: '75000' },
    ];
    rowsByLabel.sov_versions = [
      { sov_version_id: 'v2', version_number: 2, state: 'LOCKED', total_value: '500000' },
      { sov_version_id: 'v1', version_number: 1, state: 'RETIRED', total_value: '450000' },
    ];
    rowsByLabel.schedule_of_values = [
      { sov_line_id: 'l1', line_number: 1, scheduled_value: '300000', sov_version_id: 'v2' },
      { sov_line_id: 'l2', line_number: 2, scheduled_value: '200000', sov_version_id: 'v2' },
    ];
    rowsByLabel.retainage_holdings = [
      { holding_id: 'h1', amount_held: '10000', released_at: null },
    ];
    rowsByLabel.notarization_sessions = [
      { session_id: 's1', state: 'COMPLETED' },
    ];
    rowsByLabel.billing_format_config = [
      { billing_config_id: 'b1', notarization_required: true },
    ];

    const route = require('@/app/api/aia/billing/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-26-0001'), ctx('PRJ-26-0001'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.engagement.engagement_id).toBe(ENG_ID);
    expect(body.payApps).toHaveLength(2);
    expect(body.payApps[0].pay_app_number).toBe(3);
    expect(body.sovVersions).toHaveLength(2);
    expect(body.activeSovVersionId).toBe('v2');         // LOCKED wins
    expect(body.sovLines).toHaveLength(2);
    expect(body.retainage).toHaveLength(1);
    expect(body.latestNotarization?.state).toBe('COMPLETED');
    expect(body.billingFormatConfig?.notarization_required).toBe(true);

    // All 7 tables hit (engagements first, then the 5 parallel reads + sov lines)
    expect(fromCalls).toEqual(expect.arrayContaining([
      'engagements', 'pay_applications', 'sov_versions',
      'retainage_holdings', 'notarization_sessions',
      'billing_format_config', 'schedule_of_values',
    ]));
  });

  it('skips schedule_of_values lookup when there is no SOV version', async () => {
    rowsByLabel.engagements = [{
      engagement_id: ENG_ID, kid: 'PRJ-26-0001', status: 'active',
      engagement_type: 'project', pm_handoff_state: 'active', is_test_project: true,
    }];
    rowsByLabel.sov_versions = [];

    const route = require('@/app/api/aia/billing/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-26-0001'), ctx('PRJ-26-0001'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeSovVersionId).toBeNull();
    expect(body.sovLines).toEqual([]);
    expect(body.engagement.is_test_project).toBe(true);
    expect(fromCalls).not.toContain('schedule_of_values');
  });

  it('returns 400 when kid path param is empty after decoding', async () => {
    const route = require('@/app/api/aia/billing/by-kid/[kid]/route');
    const res = await route.GET(get(' '), ctx(' '));
    expect(res.status).toBe(400);
  });
});
