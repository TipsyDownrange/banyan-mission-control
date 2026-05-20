/**
 * BAN-374 P6 — POST /api/schedule/milestones accepts milestone_kind +
 * permit_* fields.  Covers:
 *   1. Accepted permit-kind happy path with all permit_* fields.
 *   2. milestone_kind enum validation rejects unknown kinds with 400.
 *   3. permit_* date fields enforce ISO YYYY-MM-DD format.
 *   4. Backward compatibility: omitting milestone_kind still writes
 *      'standard' (existing P4 callers unbroken).
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const MS_ID = '00000000-0000-4000-8000-000000000500';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const insertValuesSpy = jest.fn();

const mockDb = {
  select: jest.fn(() => {
    const limit = jest.fn(async () => selectResultQueue.shift() ?? []);
    const where = jest.fn(() => ({ limit }));
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

describe('POST /api/schedule/milestones — permit-field body extension (P6)', () => {
  it('accepts milestone_kind=permit + permit_* fields and persists them', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]);
    const { POST } = await import('@/app/api/schedule/milestones/route');
    const res = await POST(new Request('http://localhost/api/schedule/milestones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        name: 'Maui DPW Building Permit',
        type: 'permit',
        milestone_kind: 'permit',
        planned_date: '2026-08-01',
        permit_authority: 'County of Maui DPW',
        permit_application_date: '2026-07-01',
        permit_estimated_approval_date: '2026-08-01',
      }),
    }));
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'schedule_milestones',
      expect.objectContaining({
        tenant_id: TENANT_ID,
        engagement_id: ENG_ID,
        type: 'permit',
        milestone_kind: 'permit',
        permit_authority: 'County of Maui DPW',
        permit_application_date: '2026-07-01',
        permit_estimated_approval_date: '2026-08-01',
        permit_actual_approval_date: null,
      }),
    );
  });

  it('rejects unknown milestone_kind with 400', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]);
    const { POST } = await import('@/app/api/schedule/milestones/route');
    const res = await POST(new Request('http://localhost/api/schedule/milestones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        name: 'X',
        type: 'permit',
        milestone_kind: 'bogus',
      }),
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/milestone_kind/);
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed permit_application_date with 400', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]);
    const { POST } = await import('@/app/api/schedule/milestones/route');
    const res = await POST(new Request('http://localhost/api/schedule/milestones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        name: 'X',
        type: 'permit',
        milestone_kind: 'permit',
        permit_application_date: '2026/07/01', // wrong separator
      }),
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/permit_application_date/);
  });

  it('preserves backward compatibility: omitted milestone_kind defaults to standard', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]);
    const { POST } = await import('@/app/api/schedule/milestones/route');
    const res = await POST(new Request('http://localhost/api/schedule/milestones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        name: 'Substantial Completion',
        type: 'substantial_completion',
        planned_date: '2026-09-01',
      }),
    }));
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'schedule_milestones',
      expect.objectContaining({
        milestone_kind: 'standard',
        permit_authority: null,
        permit_application_date: null,
        permit_estimated_approval_date: null,
        permit_actual_approval_date: null,
      }),
    );
  });

  it('treats empty-string permit_authority as null', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]);
    const { POST } = await import('@/app/api/schedule/milestones/route');
    const res = await POST(new Request('http://localhost/api/schedule/milestones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        name: 'Permit',
        type: 'permit',
        milestone_kind: 'permit',
        permit_authority: '   ',
      }),
    }));
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'schedule_milestones',
      expect.objectContaining({ permit_authority: null }),
    );
  });
});
