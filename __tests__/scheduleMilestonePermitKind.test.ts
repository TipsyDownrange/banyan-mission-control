/**
 * BAN-374 P4 — Permit-kind milestone read-through.
 *
 * P4 adds the milestone_kind + permit_* fields to schedule_milestones via
 * migration 0037.  Per the dispatch ("Read-only in P4; CRUD endpoint
 * extensions in P5 or P6"), we do NOT modify the existing /api/schedule/
 * milestones route handlers.  This test verifies that:
 *
 *   1. GET /api/schedule/milestones returns the new fields when the data
 *      layer surfaces them (Drizzle `select()` returns all columns).
 *   2. POST defaults milestone_kind to 'standard' at the DB layer (no body
 *      field accepted yet) — verified by the absence of milestone_kind in
 *      the insert values payload.
 *   3. The schema constants enumerate the canonical kinds.
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const MS_ID = '00000000-0000-4000-8000-000000000500';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const insertValuesSpy = jest.fn();

const mockDb = {
  select: jest.fn(() => {
    const limit = jest.fn(async () => selectResultQueue.shift() ?? []);
    const orderBy = jest.fn(async () => selectResultQueue.shift() ?? []);
    const where = jest.fn(() => ({ limit, orderBy }));
    const from = jest.fn(() => ({ where }));
    return { from };
  }),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(tableHandle._label ?? 'unknown', vals);
      return {
        returning: async () => [{ ...vals, id: MS_ID }],
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'id', 'tenant_id', 'engagement_id', 'name', 'type',
    'planned_date', 'actual_date', 'status', 'milestone_kind',
    'permit_authority', 'permit_application_date',
    'permit_estimated_approval_date', 'permit_actual_approval_date',
    'kid', 'created_at', 'updated_at',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  schedule_milestones: tbl('schedule_milestones'),
  engagements: tbl('engagements'),
  SCHEDULE_MILESTONE_TYPES: ['substantial_completion', 'permit', 'inspection', 'owner_walkthrough', 'retainage_release', 'custom'],
  SCHEDULE_MILESTONE_STATUSES: ['pending', 'met', 'missed', 'waived'],
  SCHEDULE_MILESTONE_KINDS: ['standard', 'permit', 'inspection', 'gc_clearance', 'matson_freight'],
}));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  __esModule: true,
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => TENANT_ID,
  isPostgresWriteEnabled: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
  selectResultQueue.length = 0;
  mockGetServerSession.mockResolvedValue({
    user: { email: 'pm@kulaglass.com', role: 'pm' },
  });
});

describe('schema constants — milestone_kind', () => {
  it('enumerates the five canonical milestone kinds', async () => {
    // Lazy import to keep the @/db mock factory's mockDb reference initialized.
    const dbModule = await import('@/db');
    expect((dbModule as unknown as { SCHEDULE_MILESTONE_KINDS: string[] }).SCHEDULE_MILESTONE_KINDS).toEqual([
      'standard', 'permit', 'inspection', 'gc_clearance', 'matson_freight',
    ]);
  });
});

describe('GET /api/schedule/milestones — permit-kind read-through', () => {
  it('surfaces milestone_kind + permit_* fields when the data layer returns them', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]);
    selectResultQueue.push([
      {
        id: MS_ID,
        name: 'County Building Permit',
        type: 'permit',
        status: 'pending',
        planned_date: '2026-07-15',
        actual_date: null,
        milestone_kind: 'permit',
        permit_authority: 'County of Maui DPW',
        permit_application_date: '2026-06-01',
        permit_estimated_approval_date: '2026-07-15',
        permit_actual_approval_date: null,
      },
    ]);
    const { GET } = await import('@/app/api/schedule/milestones/route');
    const res = await GET(new Request('http://localhost/api/schedule/milestones?engagement_kid=PRJ-26-0001'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.items).toHaveLength(1);
    expect(j.items[0]).toMatchObject({
      milestone_kind: 'permit',
      permit_authority: 'County of Maui DPW',
      permit_application_date: '2026-06-01',
      permit_estimated_approval_date: '2026-07-15',
      permit_actual_approval_date: null,
    });
  });
});

describe('POST /api/schedule/milestones — milestone_kind default behavior', () => {
  // BAN-374 P6 — POST now accepts milestone_kind in the request body.  The
  // P4-era contract (kind ignored, DB default 'standard' applied) shifted in
  // P6 to land permit-field CRUD; backward compatibility is preserved because
  // callers that omit milestone_kind still get 'standard' written explicitly.
  it('defaults milestone_kind to standard when caller omits the field', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]);
    const { POST } = await import('@/app/api/schedule/milestones/route');
    const res = await POST(new Request('http://localhost/api/schedule/milestones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        name: 'Substantial Completion',
        type: 'substantial_completion',
      }),
    }));
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalled();
    const payload = insertValuesSpy.mock.calls[0][1];
    expect(payload).toMatchObject({ milestone_kind: 'standard' });
  });
});
