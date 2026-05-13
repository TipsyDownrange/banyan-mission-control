const mockRequireKulaSession = jest.fn();
const mockEmitMCEvent = jest.fn();
const mockQueryOne = jest.fn();
const mockQuery = jest.fn();

jest.mock('@/lib/work-records/authz', () => ({
  requireKulaSession: mockRequireKulaSession,
  ROUTING_ROLES: new Set(['super_admin', 'owner', 'gm', 'business_admin']),
  PM_ROLES: ['pm', 'service_pm'],
  canRoute: (role: string) =>
    new Set(['super_admin', 'owner', 'gm', 'business_admin']).has(role),
}));

jest.mock('@/lib/events', () => ({
  emitMCEvent: mockEmitMCEvent,
}));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: jest.fn(() => 'tenant-aaa'),
}));

jest.mock('@/lib/work-records/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

jest.mock('@/lib/engagements/drive-templates', () => ({
  createEngagementDriveFolder: jest.fn(),
}));

jest.mock('@/lib/work-records/engagement-mapping', () => ({
  driveTemplateForEngagement: jest.fn(() => 'wo_small'),
  engagementTypeToRoutingDecision: jest.fn(() => null),
}));

jest.mock('@/lib/work-records/ids', () => ({
  nextKid: jest.fn(),
}));

function patchRequest(body: Record<string, unknown>) {
  return new Request('https://example.test/api/engagements', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('BAN-240 — /api/engagements PATCH handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireKulaSession.mockResolvedValue({
      email: 'sean@kulaglass.com',
      role: 'owner',
      user: { user_id: 'user-1' },
    });
    mockEmitMCEvent.mockResolvedValue(undefined);
  });

  it('returns 401 when session is not a Kula session', async () => {
    mockRequireKulaSession.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });
    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ engagement_id: 'eng-1', status: 'closed' }) as never);
    expect(res.status).toBe(401);
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when engagement_id is missing', async () => {
    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ status: 'closed' }) as never);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/engagement_id/);
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });

  it('returns 404 when engagement not found', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ engagement_id: 'eng-missing', status: 'closed' }) as never);
    expect(res.status).toBe(404);
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });

  it('returns 403 when tenant boundary is violated', async () => {
    mockQueryOne.mockResolvedValueOnce({
      kid: 'ENG-2026-0001',
      status: 'active',
      tenant_id: 'tenant-other',
    });
    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ engagement_id: 'eng-1', status: 'closed' }) as never);
    expect(res.status).toBe(403);
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });

  it('returns 200 and emits ENGAGEMENT_STATUS_CHANGED when status transitions', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ kid: 'ENG-2026-0001', status: 'active', tenant_id: 'tenant-aaa' })
      .mockResolvedValueOnce({ engagement_id: 'eng-1', kid: 'ENG-2026-0001', status: 'closed' });

    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ engagement_id: 'eng-1', status: 'closed' }) as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe('closed');
    expect(mockEmitMCEvent).toHaveBeenCalledTimes(1);
    expect(mockEmitMCEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_kid: 'ENG-2026-0001',
        entity_type: 'engagement',
        event_type: 'ENGAGEMENT_STATUS_CHANGED',
        notes: 'active → closed',
        submitted_by: 'sean@kulaglass.com',
        origin: 'office',
      }),
    );
  });

  it('returns 200 and does NOT emit ENGAGEMENT_STATUS_CHANGED when status is unchanged', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ kid: 'ENG-2026-0001', status: 'active', tenant_id: 'tenant-aaa' })
      .mockResolvedValueOnce({ engagement_id: 'eng-1', kid: 'ENG-2026-0001', status: 'active', pm_handoff_state: 'pm_assigned' });

    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({
      engagement_id: 'eng-1',
      status: 'active',
      pm_handoff_state: 'pm_assigned',
    }) as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when no allowed fields are present in the body', async () => {
    mockQueryOne.mockResolvedValueOnce({
      kid: 'ENG-2026-0001',
      status: 'active',
      tenant_id: 'tenant-aaa',
    });
    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({
      engagement_id: 'eng-1',
      not_a_real_field: 'whatever',
    }) as never);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/no allowed fields/);
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });
});

export {};
