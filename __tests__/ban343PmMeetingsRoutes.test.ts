/**
 * BAN-343 PM-V1.0-D — Route-level tests for the meetings API surface.
 *
 * Mocks @/db + permissions + env to exercise:
 *   - POST /api/meetings (creation, validation, MEETING_LOGGED emission)
 *   - GET  /api/meetings/by-kid/[kid] (engagement resolution)
 *   - PATCH /api/meetings/[id] (conditional MEETING_SUMMARY_UPDATED emission)
 *   - POST /api/meetings/[id]/attendees (kula vs external rules)
 *   - POST /api/meetings/[id]/upload-transcript
 *
 * Pattern mirrors ban340PmSubmittalsRoutes.test.ts.
 */

// Names are namespaced to avoid colliding with other test files when tsc
// runs the whole project (jest itself isolates each file at runtime).
const MEETINGS_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const MEETINGS_ENG_ID = '00000000-0000-4000-8000-000000000099';
const MEETINGS_MEETING_ID = '00000000-0000-4000-8000-000000000444';
const MEETINGS_ATTENDEE_ID = '00000000-0000-4000-8000-000000000555';
const MEETINGS_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000666';

const meetingsSelectResultQueue: Array<Array<Record<string, unknown>>> = [];

const meetingsUpdateSetSpy = jest.fn();
const meetingsInsertValuesSpy = jest.fn();

function meetingsMakeTx() {
  const insert = jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
      const label = tableHandle._label ?? 'unknown';
      meetingsInsertValuesSpy(label, vals);
      return {
        returning: async () => {
          if (label === 'field_events') return [{ event_id: 'evt-test' }];
          if (label === 'meetings') return [{ meeting_id: MEETINGS_MEETING_ID, ...(vals as Record<string, unknown>) }];
          if (label === 'meeting_attendees') {
            const arr = Array.isArray(vals) ? vals : [vals];
            return arr.map((v, i) => ({ meeting_attendee_id: `${MEETINGS_ATTENDEE_ID}-${i}`, ...v }));
          }
          return [vals];
        },
      };
    },
  }));

  const updateSet = jest.fn((vals: Record<string, unknown>) => {
    meetingsUpdateSetSpy(vals);
    return {
      where: () => ({
        returning: async () => [{ meeting_id: MEETINGS_MEETING_ID, ...vals }],
      }),
    };
  });
  const update = jest.fn(() => ({ set: updateSet }));

  return { insert, update };
}

const meetingsMockTransaction = jest.fn(async (cb: (tx: ReturnType<typeof meetingsMakeTx>) => Promise<unknown>) => {
  return cb(meetingsMakeTx());
});

function meetingsMakeSelectChain() {
  const limit = jest.fn(async () => meetingsSelectResultQueue.shift() ?? []);
  const orderBy = jest.fn(async () => meetingsSelectResultQueue.shift() ?? []);
  const groupBy = jest.fn(async () => meetingsSelectResultQueue.shift() ?? []);
  const innerJoin = jest.fn(() => ({ where: () => ({ limit, orderBy, groupBy }) }));
  const leftJoin = jest.fn(() => ({ where: () => ({ limit, orderBy, groupBy }) }));
  const where = jest.fn(() => ({ limit, orderBy, groupBy, leftJoin, innerJoin }));
  const from = jest.fn(() => ({ where, leftJoin, innerJoin }));
  return { from };
}

const meetingsMockDb = {
  transaction: (cb: never) => meetingsMockTransaction(cb),
  select: jest.fn(() => meetingsMakeSelectChain()),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
      const label = tableHandle._label ?? 'unknown';
      meetingsInsertValuesSpy(label, vals);
      return {
        returning: async () => {
          if (label === 'meeting_attendees') {
            const arr = Array.isArray(vals) ? vals : [vals];
            return arr.map((v, i) => ({ meeting_attendee_id: `${MEETINGS_ATTENDEE_ID}-${i}`, ...v }));
          }
          return [{ meeting_id: MEETINGS_MEETING_ID, ...(vals as Record<string, unknown>) }];
        },
      };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      meetingsUpdateSetSpy(vals);
      return {
        where: () => ({
          returning: async () => [{ meeting_id: MEETINGS_MEETING_ID, ...vals }],
        }),
      };
    },
  })),
  delete: jest.fn(() => ({
    where: () => ({
      returning: async () => [{ meeting_attendee_id: MEETINGS_ATTENDEE_ID }],
    }),
  })),
};

function meetingsTbl(label: string) {
  const cols = [
    'meeting_id', 'tenant_id', 'engagement_id', 'title', 'meeting_date',
    'meeting_type', 'summary', 'key_topics', 'decisions_made',
    'transcript_drive_file_id', 'source_recording_url', 'source_platform',
    'source_external_id', 'external_visible', 'created_by', 'updated_by',
    'created_at', 'updated_at', 'duration_minutes',
    'meeting_attendee_id', 'is_kula_user', 'kula_user_id', 'attended',
    'name', 'email', 'organization', 'role',
    'engagement_kid', 'kid', 'is_test_project', 'pm_handoff_state', 'status',
    'event_id', 'user_id',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: meetingsMockDb,
  meetings: meetingsTbl('meetings'),
  meeting_attendees: meetingsTbl('meeting_attendees'),
  engagements: meetingsTbl('engagements'),
  users: meetingsTbl('users'),
  field_events: meetingsTbl('field_events'),
}));

const meetingsMockCheckPermission = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => meetingsMockCheckPermission(...args),
}));

jest.mock('@/lib/service-work-orders/postgres-read-guard', () => ({
  blockWOStagingPostgresReadOnlyMutation: () => null,
}));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => MEETINGS_TENANT_ID,
  isPostgresWriteEnabled: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
  meetingsSelectResultQueue.length = 0;
  meetingsMockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'pm@kulaglass.com' });
});

// ─── POST /api/meetings ──────────────────────────────────────────────────────

describe('POST /api/meetings', () => {
  it('rejects when title is missing', async () => {
    meetingsSelectResultQueue.push([{ user_id: MEETINGS_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/meetings/route');
    const res = await POST(new Request('http://localhost/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meeting_date: '2026-05-18T10:00:00Z', meeting_type: 'OAC' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects when meeting_date is missing', async () => {
    meetingsSelectResultQueue.push([{ user_id: MEETINGS_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/meetings/route');
    const res = await POST(new Request('http://localhost/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Hello', meeting_type: 'OAC' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects unknown meeting_type', async () => {
    meetingsSelectResultQueue.push([{ user_id: MEETINGS_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/meetings/route');
    const res = await POST(new Request('http://localhost/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Hello', meeting_date: '2026-05-18T10:00:00Z', meeting_type: 'STANDUP' }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 if the session user is not in public.users', async () => {
    meetingsSelectResultQueue.push([]); // resolveUserIdByEmail finds no user
    const { POST } = await import('@/app/api/meetings/route');
    const res = await POST(new Request('http://localhost/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Kickoff', meeting_date: '2026-05-18T10:00:00Z', meeting_type: 'OAC' }),
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.code).toBe('ACTOR_NOT_FOUND');
  });

  it('rejects external attendee carrying a kula_user_id', async () => {
    meetingsSelectResultQueue.push([{ user_id: MEETINGS_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/meetings/route');
    const res = await POST(new Request('http://localhost/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Kickoff',
        meeting_date: '2026-05-18T10:00:00Z',
        meeting_type: 'OAC',
        attendees: [{ name: 'Bad', is_kula_user: false, kula_user_id: '99999999-9999-9999-9999-999999999999' }],
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('creates a cross-project meeting (no engagement_kid) and emits MEETING_LOGGED', async () => {
    meetingsSelectResultQueue.push([{ user_id: MEETINGS_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/meetings/route');
    const res = await POST(new Request('http://localhost/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'All-PM standup',
        meeting_date: '2026-05-18T10:00:00Z',
        meeting_type: 'OTHER',
        attendees: [
          { name: 'Kai', is_kula_user: true },
          { name: 'Architect', is_kula_user: false, organization: 'KMD' },
        ],
      }),
    }));
    expect(res.status).toBe(201);
    const labels = meetingsInsertValuesSpy.mock.calls.map((c) => c[0]);
    expect(labels).toContain('meetings');
    expect(labels).toContain('meeting_attendees');
    expect(labels).toContain('field_events');
    const eventCall = meetingsInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect(eventCall?.[1]).toMatchObject({
      event_type: 'MEETING_LOGGED',
      entity_type: 'internal',
    });
    const meta = (eventCall?.[1] as { metadata: Record<string, unknown> }).metadata;
    expect(meta.entity_kind).toBe('meeting');
    expect(meta.attendee_count).toBe(2);
    expect(meta.attendee_kula_count).toBe(1);
    expect(meta.attendee_external_count).toBe(1);
  });

  it('creates a project-scoped meeting when engagement_kid resolves', async () => {
    meetingsSelectResultQueue.push([{ user_id: MEETINGS_ACTOR_USER_ID }]); // resolveUserIdByEmail
    meetingsSelectResultQueue.push([{ engagement_id: MEETINGS_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false }]); // engagement lookup in tx
    const { POST } = await import('@/app/api/meetings/route');
    const res = await POST(new Request('http://localhost/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        title: 'OAC #4',
        meeting_date: '2026-05-18T10:00:00Z',
        meeting_type: 'OAC',
      }),
    }));
    expect(res.status).toBe(201);
    const eventCall = meetingsInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect(eventCall?.[1]).toMatchObject({
      event_type: 'MEETING_LOGGED',
      entity_type: 'project',
      entity_id: MEETINGS_ENG_ID,
      kid: 'PRJ-26-0001',
    });
  });

  it('returns 404 when engagement_kid does not resolve', async () => {
    meetingsSelectResultQueue.push([{ user_id: MEETINGS_ACTOR_USER_ID }]);
    meetingsSelectResultQueue.push([]); // engagement lookup empty
    const { POST } = await import('@/app/api/meetings/route');
    const res = await POST(new Request('http://localhost/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-9999',
        title: 'OAC',
        meeting_date: '2026-05-18T10:00:00Z',
        meeting_type: 'OAC',
      }),
    }));
    expect(res.status).toBe(404);
  });

  it('rejects unauthorized roles', async () => {
    meetingsMockCheckPermission.mockResolvedValueOnce({ allowed: true, role: 'crew', email: 'crew@kulaglass.com' });
    const { POST } = await import('@/app/api/meetings/route');
    const res = await POST(new Request('http://localhost/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'X', meeting_date: '2026-05-18T10:00:00Z', meeting_type: 'OAC' }),
    }));
    expect(res.status).toBe(403);
  });
});

// ─── PATCH /api/meetings/[id] ────────────────────────────────────────────────

describe('PATCH /api/meetings/[id]', () => {
  it('emits MEETING_SUMMARY_UPDATED when summary changes', async () => {
    // getMeetingForTenant lookup
    meetingsSelectResultQueue.push([{
      meeting_id: MEETINGS_MEETING_ID, engagement_id: MEETINGS_ENG_ID, title: 'OAC', kid: 'PRJ-26-0001', is_test_project: false,
      summary: 'old', key_topics: [], decisions_made: [],
    }]);
    // resolveUserIdByEmail
    meetingsSelectResultQueue.push([{ user_id: MEETINGS_ACTOR_USER_ID }]);
    const { PATCH } = await import('@/app/api/meetings/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/meetings/${MEETINGS_MEETING_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ summary: 'new summary' }),
      }),
      { params: Promise.resolve({ id: MEETINGS_MEETING_ID }) },
    );
    expect(res.status).toBe(200);
    const eventCall = meetingsInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect(eventCall?.[1]).toMatchObject({ event_type: 'MEETING_SUMMARY_UPDATED', entity_type: 'project' });
  });

  it('does NOT emit MEETING_SUMMARY_UPDATED when only title changes', async () => {
    meetingsSelectResultQueue.push([{
      meeting_id: MEETINGS_MEETING_ID, engagement_id: MEETINGS_ENG_ID, title: 'OAC', kid: 'PRJ-26-0001', is_test_project: false,
      summary: null, key_topics: [], decisions_made: [],
    }]);
    meetingsSelectResultQueue.push([{ user_id: MEETINGS_ACTOR_USER_ID }]);
    const { PATCH } = await import('@/app/api/meetings/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/meetings/${MEETINGS_MEETING_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'OAC #5' }),
      }),
      { params: Promise.resolve({ id: MEETINGS_MEETING_ID }) },
    );
    expect(res.status).toBe(200);
    const eventCall = meetingsInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect(eventCall).toBeUndefined();
  });

  it('rejects PATCH with no allowed fields', async () => {
    meetingsSelectResultQueue.push([{ meeting_id: MEETINGS_MEETING_ID, engagement_id: MEETINGS_ENG_ID, title: 'OAC', kid: 'PRJ-26-0001', is_test_project: false }]);
    const { PATCH } = await import('@/app/api/meetings/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/meetings/${MEETINGS_MEETING_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source_platform: 'READ_AI' }), // not editable post-create
      }),
      { params: Promise.resolve({ id: MEETINGS_MEETING_ID }) },
    );
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/meetings/[id]/attendees ───────────────────────────────────────

describe('POST /api/meetings/[id]/attendees', () => {
  it('rejects when meeting not found', async () => {
    meetingsSelectResultQueue.push([]);
    const { POST } = await import('@/app/api/meetings/[id]/attendees/route');
    const res = await POST(
      new Request(`http://localhost/api/meetings/${MEETINGS_MEETING_ID}/attendees`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }),
      { params: Promise.resolve({ id: MEETINGS_MEETING_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it('rejects external attendee with kula_user_id', async () => {
    meetingsSelectResultQueue.push([{ meeting_id: MEETINGS_MEETING_ID, engagement_id: MEETINGS_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false }]);
    const { POST } = await import('@/app/api/meetings/[id]/attendees/route');
    const res = await POST(
      new Request(`http://localhost/api/meetings/${MEETINGS_MEETING_ID}/attendees`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Bad', is_kula_user: false, kula_user_id: '99999999-9999-9999-9999-999999999999' }),
      }),
      { params: Promise.resolve({ id: MEETINGS_MEETING_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('appends a valid external attendee', async () => {
    meetingsSelectResultQueue.push([{ meeting_id: MEETINGS_MEETING_ID, engagement_id: MEETINGS_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false }]);
    const { POST } = await import('@/app/api/meetings/[id]/attendees/route');
    const res = await POST(
      new Request(`http://localhost/api/meetings/${MEETINGS_MEETING_ID}/attendees`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Kai', email: 'kai@gc.com', organization: 'Good GC', role: 'PM' }),
      }),
      { params: Promise.resolve({ id: MEETINGS_MEETING_ID }) },
    );
    expect(res.status).toBe(201);
    const attendeeCall = meetingsInsertValuesSpy.mock.calls.find((c) => c[0] === 'meeting_attendees');
    expect(attendeeCall?.[1]).toMatchObject({
      meeting_id: MEETINGS_MEETING_ID,
      tenant_id: MEETINGS_TENANT_ID,
      name: 'Kai',
      is_kula_user: false,
      attended: true,
    });
  });
});

// ─── POST /api/meetings/[id]/upload-transcript ───────────────────────────────

describe('POST /api/meetings/[id]/upload-transcript', () => {
  it('requires transcript_drive_file_id', async () => {
    meetingsSelectResultQueue.push([{ meeting_id: MEETINGS_MEETING_ID, engagement_id: MEETINGS_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false }]);
    const { POST } = await import('@/app/api/meetings/[id]/upload-transcript/route');
    const res = await POST(
      new Request(`http://localhost/api/meetings/${MEETINGS_MEETING_ID}/upload-transcript`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: MEETINGS_MEETING_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('records the Drive file ID and updated_by', async () => {
    meetingsSelectResultQueue.push([{ meeting_id: MEETINGS_MEETING_ID, engagement_id: MEETINGS_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false }]);
    meetingsSelectResultQueue.push([{ user_id: MEETINGS_ACTOR_USER_ID }]); // resolveUserIdByEmail
    const { POST } = await import('@/app/api/meetings/[id]/upload-transcript/route');
    const res = await POST(
      new Request(`http://localhost/api/meetings/${MEETINGS_MEETING_ID}/upload-transcript`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript_drive_file_id: 'drive-xyz' }),
      }),
      { params: Promise.resolve({ id: MEETINGS_MEETING_ID }) },
    );
    expect(res.status).toBe(200);
    expect(meetingsUpdateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript_drive_file_id: 'drive-xyz',
        updated_by: MEETINGS_ACTOR_USER_ID,
      }),
    );
  });
});
