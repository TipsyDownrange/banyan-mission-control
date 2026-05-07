const mockCalendar = jest.fn();

jest.mock('@/lib/gauth', () => ({ getGoogleAuth: jest.fn(() => ({})) }));
jest.mock('googleapis', () => ({
  google: {
    calendar: mockCalendar,
  },
}));

describe('/api/calendar staging write fence', () => {
  let prevTargetEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
  });

  it.each([
    ['POST', () => new Request('https://example.test/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', start: '2026-05-07T08:00:00' }),
    })],
    ['PATCH', () => new Request('https://example.test/api/calendar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: 'event-1', title: 'Updated' }),
    })],
    ['DELETE', () => new Request('https://example.test/api/calendar?eventId=event-1', { method: 'DELETE' })],
  ])('blocks %s in staging before constructing a Google Calendar client', async (method, buildReq) => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    const route = await import('@/app/api/calendar/route');

    const res = await route[method as 'POST' | 'PATCH' | 'DELETE'](buildReq());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json).toEqual({ ok: false, skipped: true, reason: 'staging_calendar_write_blocked' });
    expect(mockCalendar).not.toHaveBeenCalled();
  });
});

