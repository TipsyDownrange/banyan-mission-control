/**
 * BAN-328 — aggregator GET /api/closeout/punch-list/by-kid/[kid]
 *
 * DB layer mocked using the BAN-322 fluent/thenable chain pattern.
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
    item_number: { name: 'item_number' },
    punch_item_id: { name: 'punch_item_id' },
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
    punch_list_items: tbl('punch_list_items'),
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

const ENG_ID = '00000000-0000-4000-8000-0000000000ab';

function get(kid: string): Request {
  return new Request(`https://mc.local/api/closeout/punch-list/by-kid/${encodeURIComponent(kid)}`);
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

describe('BAN-328 GET /api/closeout/punch-list/by-kid/[kid]', () => {
  it('returns 403 when permission gate fails', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false, role: 'guest', email: null });
    const route = require('@/app/api/closeout/punch-list/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-26-0001'), ctx('PRJ-26-0001'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when kid is empty after decoding', async () => {
    const route = require('@/app/api/closeout/punch-list/by-kid/[kid]/route');
    const res = await route.GET(get(' '), ctx(' '));
    expect(res.status).toBe(400);
  });

  it('returns kIDFound:false + empty payload (200) when kid does not resolve', async () => {
    rowsByLabel.engagements = [];
    const route = require('@/app/api/closeout/punch-list/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-99-9999'), ctx('PRJ-99-9999'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kIDFound).toBe(false);
    expect(body.engagement).toBeNull();
    expect(body.items).toEqual([]);
    expect(body.summary.total).toBe(0);
    expect(body.summary.by_status).toEqual({
      NEW: 0, ASSIGNED: 0, IN_PROGRESS: 0, COMPLETED: 0,
      SIGNED_OFF: 0, DISPUTED: 0, DEFERRED_TO_WARRANTY: 0,
    });
    expect(body.summary.photos_present_count).toBe(0);
    // Should NOT have fanned out to punch_list_items when engagement absent
    expect(fromCalls).toEqual(['engagements']);
  });

  it('returns kIDFound:true with empty items + zeroed summary when engagement has no punch items', async () => {
    rowsByLabel.engagements = [{
      engagement_id: ENG_ID,
      kid: 'PRJ-26-0001',
      is_test_project: false,
    }];
    rowsByLabel.punch_list_items = [];

    const route = require('@/app/api/closeout/punch-list/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-26-0001'), ctx('PRJ-26-0001'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kIDFound).toBe(true);
    expect(body.engagement.engagement_id).toBe(ENG_ID);
    expect(body.items).toEqual([]);
    expect(body.summary.total).toBe(0);
    expect(fromCalls).toEqual(['engagements', 'punch_list_items']);
  });

  it('returns full payload with computed summary (by_status + photos_present_count)', async () => {
    rowsByLabel.engagements = [{
      engagement_id: ENG_ID,
      kid: 'PRJ-26-0001',
      is_test_project: true,
    }];
    rowsByLabel.punch_list_items = [
      { punch_item_id: 'i1', item_number: 1, status: 'NEW',                  photo_evidence: [] },
      { punch_item_id: 'i2', item_number: 2, status: 'IN_PROGRESS',          photo_evidence: ['drive1'] },
      { punch_item_id: 'i3', item_number: 3, status: 'COMPLETED',            photo_evidence: ['drive2', 'drive3'] },
      { punch_item_id: 'i4', item_number: 4, status: 'DISPUTED',             photo_evidence: [] },
      { punch_item_id: 'i5', item_number: 5, status: 'DEFERRED_TO_WARRANTY', photo_evidence: ['drive4'] },
    ];

    const route = require('@/app/api/closeout/punch-list/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-26-0001'), ctx('PRJ-26-0001'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.kIDFound).toBe(true);
    expect(body.engagement.is_test_project).toBe(true);
    expect(body.items).toHaveLength(5);
    expect(body.summary.total).toBe(5);
    expect(body.summary.by_status).toEqual({
      NEW: 1, ASSIGNED: 0, IN_PROGRESS: 1, COMPLETED: 1,
      SIGNED_OFF: 0, DISPUTED: 1, DEFERRED_TO_WARRANTY: 1,
    });
    expect(body.summary.photos_present_count).toBe(3);
    expect(fromCalls).toEqual(['engagements', 'punch_list_items']);
  });

  it('does NOT consume any gc_formal_signoff column from engagements (BAN-332 deferral)', async () => {
    rowsByLabel.engagements = [{
      engagement_id: ENG_ID,
      kid: 'PRJ-26-0001',
      is_test_project: false,
    }];
    rowsByLabel.punch_list_items = [];

    const route = require('@/app/api/closeout/punch-list/by-kid/[kid]/route');
    const res = await route.GET(get('PRJ-26-0001'), ctx('PRJ-26-0001'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.engagement).not.toHaveProperty('gc_formal_signoff');
    expect(body.engagement).not.toHaveProperty('gc_formal_signoff_at');
    // Aggregator must not have read substantial_completion_certs as a proxy
    expect(fromCalls).not.toContain('substantial_completion_certs');
  });
});
