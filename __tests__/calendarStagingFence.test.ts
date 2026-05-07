// BAN-170: Calendar route staging fence — POST/PATCH/DELETE must skip Google
// Calendar writes in staging (and when DISABLE_CALENDAR_WRITES=true) so a
// staging deploy cannot create/patch/delete events on real `@kulaglass.com`
// user calendars.

const mockGetGoogleAuth = jest.fn();
const mockGoogleCalendar = jest.fn();

jest.mock('@/lib/gauth', () => ({ getGoogleAuth: mockGetGoogleAuth }));
jest.mock('googleapis', () => ({
  google: { calendar: mockGoogleCalendar },
}));

function buildCalendarMock() {
  const eventsInsert = jest.fn().mockResolvedValue({ data: { id: 'evt-id', htmlLink: 'https://x' } });
  const eventsPatch = jest.fn().mockResolvedValue({ data: {} });
  const eventsDelete = jest.fn().mockResolvedValue({ data: {} });
  mockGoogleCalendar.mockReturnValue({
    events: { insert: eventsInsert, patch: eventsPatch, delete: eventsDelete },
  });
  return { eventsInsert, eventsPatch, eventsDelete };
}

function postReq() {
  return new Request('https://example.test/api/calendar', {
    method: 'POST',
    body: JSON.stringify({ title: 'Site visit', start: '2026-05-08T10:00:00-10:00', end: '2026-05-08T11:00:00-10:00' }),
    headers: { 'Content-Type': 'application/json' },
  });
}

function patchReq() {
  return new Request('https://example.test/api/calendar', {
    method: 'PATCH',
    body: JSON.stringify({ eventId: 'evt-1', title: 'Updated' }),
    headers: { 'Content-Type': 'application/json' },
  });
}

function deleteReq() {
  return new Request('https://example.test/api/calendar?eventId=evt-1', { method: 'DELETE' });
}

describe('Mission Control calendar — staging fence', () => {
  let prevTargetEnv: string | undefined;
  let prevKill: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockGetGoogleAuth.mockReturnValue({});
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevKill = process.env.DISABLE_CALENDAR_WRITES;
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevKill === undefined) delete process.env.DISABLE_CALENDAR_WRITES;
    else process.env.DISABLE_CALENDAR_WRITES = prevKill;
  });

  describe('VERCEL_TARGET_ENV=staging', () => {
    beforeEach(() => { process.env.VERCEL_TARGET_ENV = 'staging'; });

    it('POST skips events.insert and returns ok+skipped+staging', async () => {
      const m = buildCalendarMock();
      const { POST } = await import('@/app/api/calendar/route');
      const res = await POST(postReq());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ ok: true, skipped: true, skip_reason: 'staging' });
      expect(m.eventsInsert).not.toHaveBeenCalled();
      expect(mockGetGoogleAuth).not.toHaveBeenCalled();
    });

    it('PATCH skips events.patch and returns ok+skipped+staging', async () => {
      const m = buildCalendarMock();
      const { PATCH } = await import('@/app/api/calendar/route');
      const res = await PATCH(patchReq());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ ok: true, skipped: true, skip_reason: 'staging' });
      expect(m.eventsPatch).not.toHaveBeenCalled();
      expect(mockGetGoogleAuth).not.toHaveBeenCalled();
    });

    it('DELETE skips events.delete and returns ok+skipped+staging', async () => {
      const m = buildCalendarMock();
      const { DELETE } = await import('@/app/api/calendar/route');
      const res = await DELETE(deleteReq());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ ok: true, skipped: true, skip_reason: 'staging' });
      expect(m.eventsDelete).not.toHaveBeenCalled();
      expect(mockGetGoogleAuth).not.toHaveBeenCalled();
    });

    it('POST still validates body before short-circuit (returns 400 on missing title)', async () => {
      const m = buildCalendarMock();
      const { POST } = await import('@/app/api/calendar/route');
      const res = await POST(new Request('https://example.test/api/calendar', {
        method: 'POST',
        body: JSON.stringify({ title: '', start: '' }),
        headers: { 'Content-Type': 'application/json' },
      }));
      expect(res.status).toBe(400);
      expect(m.eventsInsert).not.toHaveBeenCalled();
    });
  });

  describe('production with DISABLE_CALENDAR_WRITES=true', () => {
    beforeEach(() => {
      delete process.env.VERCEL_TARGET_ENV;
      process.env.DISABLE_CALENDAR_WRITES = 'true';
    });

    it('POST skips with reason=disable_calendar_writes', async () => {
      const m = buildCalendarMock();
      const { POST } = await import('@/app/api/calendar/route');
      const res = await POST(postReq());
      const json = await res.json();
      expect(json.skipped).toBe(true);
      expect(json.skip_reason).toBe('disable_calendar_writes');
      expect(m.eventsInsert).not.toHaveBeenCalled();
    });
  });

  describe('production without flags — calendar writes still attempt', () => {
    beforeEach(() => {
      delete process.env.VERCEL_TARGET_ENV;
      delete process.env.DISABLE_CALENDAR_WRITES;
    });

    it('POST calls events.insert in production', async () => {
      const m = buildCalendarMock();
      const { POST } = await import('@/app/api/calendar/route');
      const res = await POST(postReq());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.skipped).toBeUndefined();
      expect(m.eventsInsert).toHaveBeenCalledTimes(1);
    });

    it('PATCH calls events.patch in production', async () => {
      const m = buildCalendarMock();
      const { PATCH } = await import('@/app/api/calendar/route');
      const res = await PATCH(patchReq());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.skipped).toBeUndefined();
      expect(m.eventsPatch).toHaveBeenCalledTimes(1);
    });

    it('DELETE calls events.delete in production', async () => {
      const m = buildCalendarMock();
      const { DELETE } = await import('@/app/api/calendar/route');
      const res = await DELETE(deleteReq());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.skipped).toBeUndefined();
      expect(m.eventsDelete).toHaveBeenCalledTimes(1);
    });
  });
});

export {};
