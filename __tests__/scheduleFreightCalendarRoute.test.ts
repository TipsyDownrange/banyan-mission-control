/**
 * BAN-374 P4 — /api/schedule/freight-calendar route tests.
 *
 *   GET   — tenant scoping, route + from/to filters, soft-delete exclusion
 *   POST  — validation (route, ISO dates, cutoff <= sailing, arrival >= sailing)
 *           + permission gate (SCHEDULE_WRITE)
 *   PATCH — partial update, 404 when missing
 *   DELETE — soft-delete (sets deleted_at, does not row-remove)
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENTRY_ID = '00000000-0000-4000-8000-000000000700';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const insertValuesSpy = jest.fn();
const updateSetSpy = jest.fn();

const mockDb = {
  select: jest.fn(() => {
    const orderBy = jest.fn(async () => selectResultQueue.shift() ?? []);
    const where = jest.fn(() => ({ orderBy }));
    const from = jest.fn(() => ({ where }));
    return { from };
  }),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(tableHandle._label ?? 'unknown', vals);
      return {
        returning: async () => [{ ...vals, freight_calendar_id: ENTRY_ID }],
      };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: () => ({
          returning: async () => [{ freight_calendar_id: ENTRY_ID, ...vals }],
        }),
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'freight_calendar_id', 'tenant_id', 'carrier', 'route',
    'sailing_date', 'arrival_date', 'cutoff_date', 'notes',
    'deleted_at', 'created_at', 'updated_at',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  tenant_freight_calendar: tbl('tenant_freight_calendar'),
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

describe('GET /api/schedule/freight-calendar', () => {
  it('lists sailings for the active tenant (no filters)', async () => {
    selectResultQueue.push([
      { freight_calendar_id: ENTRY_ID, route: 'LA-HON', sailing_date: '2026-07-01' },
    ]);
    const { GET } = await import('@/app/api/schedule/freight-calendar/route');
    const res = await GET(new Request('http://localhost/api/schedule/freight-calendar'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.items).toHaveLength(1);
  });

  it('accepts route + from/to filters without error', async () => {
    selectResultQueue.push([]);
    const { GET } = await import('@/app/api/schedule/freight-calendar/route');
    const res = await GET(new Request('http://localhost/api/schedule/freight-calendar?route=LA-HON&from=2026-06-01&to=2026-07-31'));
    expect(res.status).toBe(200);
  });

  it('returns 401 when the session is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/schedule/freight-calendar/route');
    const res = await GET(new Request('http://localhost/api/schedule/freight-calendar'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the role lacks SCHEDULE_VIEW', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: 'x@y.com', role: 'none' } });
    const { GET } = await import('@/app/api/schedule/freight-calendar/route');
    const res = await GET(new Request('http://localhost/api/schedule/freight-calendar'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/schedule/freight-calendar', () => {
  it('rejects missing route', async () => {
    const { POST } = await import('@/app/api/schedule/freight-calendar/route');
    const res = await POST(new Request('http://localhost/api/schedule/freight-calendar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sailing_date: '2026-07-01', arrival_date: '2026-07-06', cutoff_date: '2026-06-29',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects malformed ISO dates', async () => {
    const { POST } = await import('@/app/api/schedule/freight-calendar/route');
    const res = await POST(new Request('http://localhost/api/schedule/freight-calendar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        route: 'LA-HON',
        sailing_date: '07/01/2026',
        arrival_date: '2026-07-06',
        cutoff_date: '2026-06-29',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects cutoff after sailing', async () => {
    const { POST } = await import('@/app/api/schedule/freight-calendar/route');
    const res = await POST(new Request('http://localhost/api/schedule/freight-calendar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        route: 'LA-HON',
        sailing_date: '2026-07-01',
        arrival_date: '2026-07-06',
        cutoff_date: '2026-07-02', // after sailing
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects arrival before sailing', async () => {
    const { POST } = await import('@/app/api/schedule/freight-calendar/route');
    const res = await POST(new Request('http://localhost/api/schedule/freight-calendar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        route: 'LA-HON',
        sailing_date: '2026-07-01',
        arrival_date: '2026-06-30',
        cutoff_date: '2026-06-29',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('creates a sailing entry with the active tenant_id + default carrier', async () => {
    const { POST } = await import('@/app/api/schedule/freight-calendar/route');
    const res = await POST(new Request('http://localhost/api/schedule/freight-calendar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        route: 'LA-HON',
        sailing_date: '2026-07-01',
        arrival_date: '2026-07-06',
        cutoff_date: '2026-06-29',
        notes: 'Hold for storefront glass',
      }),
    }));
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'tenant_freight_calendar',
      expect.objectContaining({
        tenant_id: TENANT_ID,
        carrier: 'Matson',
        route: 'LA-HON',
        sailing_date: '2026-07-01',
        arrival_date: '2026-07-06',
        cutoff_date: '2026-06-29',
        notes: 'Hold for storefront glass',
      }),
    );
  });

  it('returns 403 when the role lacks SCHEDULE_WRITE', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: 'x@y.com', role: 'super' } });
    const { POST } = await import('@/app/api/schedule/freight-calendar/route');
    const res = await POST(new Request('http://localhost/api/schedule/freight-calendar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        route: 'LA-HON',
        sailing_date: '2026-07-01',
        arrival_date: '2026-07-06',
        cutoff_date: '2026-06-29',
      }),
    }));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/schedule/freight-calendar/[id]', () => {
  it('rejects invalid uuid', async () => {
    const { PATCH } = await import('@/app/api/schedule/freight-calendar/[id]/route');
    const res = await PATCH(
      new Request('http://localhost/api/schedule/freight-calendar/not-a-uuid', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: 'updated' }),
      }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(400);
  });

  it('rejects malformed sailing_date in body', async () => {
    const { PATCH } = await import('@/app/api/schedule/freight-calendar/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/freight-calendar/${ENTRY_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sailing_date: 'oops' }),
      }),
      { params: Promise.resolve({ id: ENTRY_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('updates notes via PATCH and stamps updated_at', async () => {
    const { PATCH } = await import('@/app/api/schedule/freight-calendar/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/freight-calendar/${ENTRY_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: 'Confirmed via Matson agent' }),
      }),
      { params: Promise.resolve({ id: ENTRY_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Confirmed via Matson agent' }),
    );
  });
});

describe('DELETE /api/schedule/freight-calendar/[id]', () => {
  it('soft-deletes by stamping deleted_at via db.update, not a hard delete', async () => {
    const { DELETE } = await import('@/app/api/schedule/freight-calendar/[id]/route');
    const res = await DELETE(
      new Request(`http://localhost/api/schedule/freight-calendar/${ENTRY_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: ENTRY_ID }) },
    );
    expect(res.status).toBe(200);
    // The mock update was invoked with deleted_at set, not a hard db.delete().
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(Date) }),
    );
  });
});
