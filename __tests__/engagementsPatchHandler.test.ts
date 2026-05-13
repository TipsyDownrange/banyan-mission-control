const mockRequireKulaSession = jest.fn();
const mockEmitMCEvent = jest.fn();
const mockQueryOne = jest.fn();

jest.mock('@/lib/work-records/authz', () => ({
  requireKulaSession: mockRequireKulaSession,
  canRoute: jest.fn(),
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

jest.mock('@/lib/engagements/drive-templates', () => ({
  createEngagementDriveFolder: jest.fn(),
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

const AUTH = {
  email: 'kai@kulaglass.com',
  role: 'gm',
  user: { user_id: '00000000-0000-4000-8000-000000000123' },
};

const CURRENT_ENGAGEMENT = {
  kid: 'ENG-26-0001',
  status: 'active',
  tenant_id: '00000000-0000-4000-8000-000000000001',
};

describe('/api/engagements PATCH', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockRequireKulaSession.mockResolvedValue(AUTH);
    mockEmitMCEvent.mockResolvedValue(undefined);
  });

  it('returns 401 when no session', async () => {
    mockRequireKulaSession.mockResolvedValue({ error: 'Unauthorized', status: 401 });

    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ engagement_id: 'eng-1', status: 'closed' }) as never);

    expect(res.status).toBe(401);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('returns 400 when no engagement_id', async () => {
    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ status: 'closed' }) as never);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('engagement_id required');
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('returns 404 when engagement not found', async () => {
    mockQueryOne.mockResolvedValueOnce(null);

    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ engagement_id: '00000000-0000-4000-8000-000000000240', status: 'closed' }) as never);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('engagement not found');
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });

  it('returns 403 when tenant boundary is violated', async () => {
    mockQueryOne.mockResolvedValueOnce({
      ...CURRENT_ENGAGEMENT,
      tenant_id: '00000000-0000-4000-8000-000000000999',
    });

    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ engagement_id: '00000000-0000-4000-8000-000000000240', status: 'closed' }) as never);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('tenant boundary');
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });

  it('returns 200 and emits ENGAGEMENT_STATUS_CHANGED when status changes', async () => {
    const updated = { ...CURRENT_ENGAGEMENT, status: 'closed' };
    mockQueryOne.mockResolvedValueOnce(CURRENT_ENGAGEMENT).mockResolvedValueOnce(updated);

    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ engagement_id: '00000000-0000-4000-8000-000000000240', status: 'closed' }) as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, data: updated });
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('update engagements set status = $1'),
      ['closed', AUTH.user.user_id, '00000000-0000-4000-8000-000000000240'],
    );
    expect(mockEmitMCEvent).toHaveBeenCalledWith({
      entity_kid: 'ENG-26-0001',
      entity_type: 'engagement',
      event_type: 'ENGAGEMENT_STATUS_CHANGED',
      notes: 'active → closed',
      submitted_by: 'kai@kulaglass.com',
      origin: 'office',
    });
  });

  it('returns 200 and does not emit ENGAGEMENT_STATUS_CHANGED when status is unchanged', async () => {
    mockQueryOne.mockResolvedValueOnce(CURRENT_ENGAGEMENT).mockResolvedValueOnce(CURRENT_ENGAGEMENT);

    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ engagement_id: '00000000-0000-4000-8000-000000000240', status: 'active' }) as never);

    expect(res.status).toBe(200);
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });

  it('rejects updates with no allowed fields', async () => {
    mockQueryOne.mockResolvedValueOnce(CURRENT_ENGAGEMENT);

    const { PATCH } = await import('@/app/api/engagements/route');
    const res = await PATCH(patchRequest({ engagement_id: '00000000-0000-4000-8000-000000000240', unknown: 'ignored' }) as never);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('no allowed fields to update');
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });
});

export {};
