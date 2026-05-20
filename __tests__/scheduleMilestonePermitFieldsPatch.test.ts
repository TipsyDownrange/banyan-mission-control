/**
 * BAN-374 P6 — PATCH /api/schedule/milestones/[id] accepts milestone_kind +
 * permit_* fields.  Covers:
 *   1. Permit-kind mutation with all permit_* fields persisted.
 *   2. milestone_kind enum validation on update path.
 *   3. ISO date enforcement on permit_* fields.
 *   4. Explicit null mutation clears a permit_* field.
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const MS_ID = '00000000-0000-4000-8000-000000000500';

const updateSetSpy = jest.fn();

const mockDb = {
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: () => ({
          returning: async () => [{ id: MS_ID, ...vals }],
        }),
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
    'created_at', 'updated_at',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  schedule_milestones: tbl('schedule_milestones'),
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
  mockGetServerSession.mockResolvedValue({
    user: { email: 'pm@kulaglass.com', role: 'pm' },
  });
});

describe('PATCH /api/schedule/milestones/[id] — permit-field body extension (P6)', () => {
  it('mutates milestone_kind + permit_authority + permit_actual_approval_date', async () => {
    const { PATCH } = await import('@/app/api/schedule/milestones/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/milestones/${MS_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          milestone_kind: 'permit',
          permit_authority: 'County of Maui DPW',
          permit_actual_approval_date: '2026-08-15',
        }),
      }),
      { params: Promise.resolve({ id: MS_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        milestone_kind: 'permit',
        permit_authority: 'County of Maui DPW',
        permit_actual_approval_date: '2026-08-15',
      }),
    );
  });

  it('rejects unknown milestone_kind with 400 on update', async () => {
    const { PATCH } = await import('@/app/api/schedule/milestones/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/milestones/${MS_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ milestone_kind: 'made_up' }),
      }),
      { params: Promise.resolve({ id: MS_ID }) },
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/milestone_kind/);
    expect(updateSetSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed permit_estimated_approval_date', async () => {
    const { PATCH } = await import('@/app/api/schedule/milestones/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/milestones/${MS_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ permit_estimated_approval_date: 'August 2026' }),
      }),
      { params: Promise.resolve({ id: MS_ID }) },
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/permit_estimated_approval_date/);
  });

  it('clears a permit_* field when sent as null', async () => {
    const { PATCH } = await import('@/app/api/schedule/milestones/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/milestones/${MS_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          permit_actual_approval_date: null,
          permit_authority: '',
        }),
      }),
      { params: Promise.resolve({ id: MS_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        permit_actual_approval_date: null,
        permit_authority: null,
      }),
    );
  });
});
