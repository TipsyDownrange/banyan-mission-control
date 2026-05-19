/**
 * BAN-345 PM-V1.0-F — Route-level tests for the Document Hub API surface.
 *
 * Mocks @/db + permissions + env to exercise:
 *   - POST   /api/documents                          (create + emit UPLOADED, optional LINKED)
 *   - GET    /api/documents                          (cross-project list)
 *   - GET    /api/documents/by-kid/[kid]             (project-scoped list)
 *   - GET    /api/documents/by-entity/[type]/[id]    (cross-trunk lookup)
 *   - GET    /api/documents/[id]
 *   - PATCH  /api/documents/[id]                     (allowed-field updates + LINKED on link change)
 *   - POST   /api/documents/[id]/supersede           (new version + dual emit)
 *
 * Pattern mirrors ban344PmActionItemsRoutes.test.ts.
 */

const DOC_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const DOC_ENG_ID = '00000000-0000-4000-8000-000000000099';
const DOC_ID = '00000000-0000-4000-8000-000000000333';
const DOC_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000666';
const DOC_LINK_ID = '00000000-0000-4000-8000-000000000444';

const docSelectResultQueue: Array<Array<Record<string, unknown>>> = [];
const docInsertValuesSpy = jest.fn();
const docUpdateSetSpy = jest.fn();

function docMakeTx() {
  const insert = jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
      const label = tableHandle._label ?? 'unknown';
      docInsertValuesSpy(label, vals);
      return {
        returning: async () => {
          if (label === 'field_events') return [{ event_id: 'evt-' + Math.random().toString(36).slice(2, 8) }];
          if (label === 'document_hub_entries') {
            const v = vals as Record<string, unknown>;
            return [{
              document_id: DOC_ID,
              version: v.version ?? 1,
              is_current: true,
              ...v,
            }];
          }
          return [vals];
        },
      };
    },
  }));

  const updateSet = jest.fn((vals: Record<string, unknown>) => {
    docUpdateSetSpy(vals);
    return {
      where: () => ({
        returning: async () => [{ document_id: DOC_ID, ...vals }],
      }),
    };
  });
  const update = jest.fn(() => ({ set: updateSet }));

  const txSelectChain = () => {
    const limit = jest.fn(async () => docSelectResultQueue.shift() ?? []);
    const orderBy = jest.fn(async () => docSelectResultQueue.shift() ?? []);
    const where = jest.fn(() => {
      const chain = { limit, orderBy } as Record<string, unknown>;
      (chain as { then?: (resolve: (rows: unknown[]) => void) => void }).then = (resolve) => {
        resolve(docSelectResultQueue.shift() ?? []);
      };
      return chain;
    });
    const innerJoin = jest.fn(() => ({ where }));
    const leftJoin = jest.fn(() => ({ where }));
    const from = jest.fn(() => ({ where, innerJoin, leftJoin }));
    return { from };
  };
  const select = jest.fn(() => txSelectChain());

  return { insert, update, select };
}

const docMockTransaction = jest.fn(async (cb: (tx: ReturnType<typeof docMakeTx>) => Promise<unknown>) => {
  return cb(docMakeTx());
});

function docMakeSelectChain() {
  const limit = jest.fn(async () => docSelectResultQueue.shift() ?? []);
  const orderBy = jest.fn(() => {
    const chain = { limit } as Record<string, unknown>;
    (chain as { then?: (resolve: (rows: unknown[]) => void) => void }).then = (resolve) => {
      resolve(docSelectResultQueue.shift() ?? []);
    };
    return chain;
  });
  const where = jest.fn(() => {
    const chain = { limit, orderBy } as Record<string, unknown>;
    (chain as { then?: (resolve: (rows: unknown[]) => void) => void }).then = (resolve) => {
      resolve(docSelectResultQueue.shift() ?? []);
    };
    return chain;
  });
  const innerJoin = jest.fn(() => ({ where, leftJoin, innerJoin }));
  const leftJoin = jest.fn(() => ({ where, leftJoin, innerJoin }));
  const from = jest.fn(() => ({ where, leftJoin, innerJoin }));
  return { from };
}

const docMockDb = {
  transaction: (cb: never) => docMockTransaction(cb),
  select: jest.fn(() => docMakeSelectChain()),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      const label = tableHandle._label ?? 'unknown';
      docInsertValuesSpy(label, vals);
      return {
        returning: async () => [{ document_id: DOC_ID, ...vals }],
      };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      docUpdateSetSpy(vals);
      return { where: () => ({ returning: async () => [{ document_id: DOC_ID, ...vals }] }) };
    },
  })),
};

function docTbl(label: string) {
  const cols = [
    'document_id', 'tenant_id', 'engagement_id', 'kid', 'drive_file_id',
    'filename', 'kind', 'subkind', 'linked_entity_type', 'linked_entity_id',
    'external_visible', 'version', 'superseded_by_document_id', 'is_current',
    'uploaded_by', 'uploaded_at', 'notes', 'is_test_project',
    'email', 'user_id',
    'event_id',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: docMockDb,
  document_hub_entries: docTbl('document_hub_entries'),
  engagements: docTbl('engagements'),
  users: docTbl('users'),
  field_events: docTbl('field_events'),
}));

// PM-DOCUMENTS-PERMISSIONS dispatch (2026-05-19): pm-documents gates now
// resolve role via next-auth's getServerSession + passPermissionGate(
// PM_DOCUMENT_*).  Tests drive sessions directly; the real passPermissionGate
// runs against ROLE_PERMISSIONS_DEFAULTS.
const docMockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => docMockGetServerSession(...args),
}));

jest.mock('@/lib/service-work-orders/postgres-read-guard', () => ({
  blockWOStagingPostgresReadOnlyMutation: () => null,
}));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => DOC_TENANT_ID,
  isPostgresWriteEnabled: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
  docSelectResultQueue.length = 0;
  docMockGetServerSession.mockResolvedValue({ user: { email: 'pm@kulaglass.com', role: 'pm' } });
  delete process.env.ROLE_PERMISSIONS_JSON;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const perms = require('@/lib/permissions');
  perms.resetRolePermissionsCacheForTests();
});

// ═══ POST /api/documents ════════════════════════════════════════════════════

describe('POST /api/documents', () => {
  it('rejects when drive_file_id is missing', async () => {
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: 'x.pdf', kind: 'OTHER' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects when filename is missing', async () => {
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drive_file_id: 'abc', kind: 'OTHER' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects unknown kind', async () => {
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drive_file_id: 'abc', filename: 'x.pdf', kind: 'BOGUS' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects half-pair linked entity (type without id)', async () => {
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        drive_file_id: 'abc', filename: 'x.pdf', kind: 'SHOP_DRAWING',
        linked_entity_type: 'SUBMITTAL',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('creates an internal-scope document and emits DOCUMENT_UPLOADED', async () => {
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        drive_file_id: 'driveId-1',
        filename: 'NOC-2026-001.pdf',
        kind: 'NOC',
      }),
    }));
    expect(res.status).toBe(201);
    const labels = docInsertValuesSpy.mock.calls.map((c) => c[0]);
    expect(labels).toContain('document_hub_entries');
    expect(labels).toContain('field_events');
    const ev = docInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect(ev?.[1]).toMatchObject({ event_type: 'DOCUMENT_UPLOADED', entity_type: 'internal' });
    const meta = (ev?.[1] as { metadata: Record<string, unknown> }).metadata;
    expect(meta.entity_kind).toBe('document');
    expect(meta.filename).toBe('NOC-2026-001.pdf');
  });

  it('creates a project-scoped document when engagement_kid resolves', async () => {
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    docSelectResultQueue.push([{ engagement_id: DOC_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false }]);
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        drive_file_id: 'driveId-2',
        filename: 'A1.01.pdf',
        kind: 'SHOP_DRAWING',
        subkind: 'A1.01 Floor Plan',
      }),
    }));
    expect(res.status).toBe(201);
    const insertedDoc = docInsertValuesSpy.mock.calls.find((c) => c[0] === 'document_hub_entries');
    expect(insertedDoc?.[1]).toMatchObject({
      engagement_id: DOC_ENG_ID,
      kid: 'PRJ-26-0001',
      drive_file_id: 'driveId-2',
      filename: 'A1.01.pdf',
      kind: 'SHOP_DRAWING',
      subkind: 'A1.01 Floor Plan',
    });
    const ev = docInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect(ev?.[1]).toMatchObject({
      event_type: 'DOCUMENT_UPLOADED',
      entity_type: 'project',
      entity_id: DOC_ENG_ID,
      kid: 'PRJ-26-0001',
    });
  });

  it('emits DOCUMENT_LINKED in the same tx when an entity link is supplied', async () => {
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    docSelectResultQueue.push([{ engagement_id: DOC_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false }]);
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        drive_file_id: 'driveId-3',
        filename: 'CO-3.pdf',
        kind: 'CO_DOCUMENT',
        linked_entity_type: 'CO',
        linked_entity_id: DOC_LINK_ID,
      }),
    }));
    expect(res.status).toBe(201);
    const events = docInsertValuesSpy.mock.calls.filter((c) => c[0] === 'field_events');
    const types = events.map((e) => (e[1] as { event_type: string }).event_type);
    expect(types).toContain('DOCUMENT_UPLOADED');
    expect(types).toContain('DOCUMENT_LINKED');
  });

  it('returns 404 when engagement_kid does not resolve', async () => {
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    docSelectResultQueue.push([]); // engagement lookup empty
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-99-9999',
        drive_file_id: 'x',
        filename: 'x.pdf',
        kind: 'OTHER',
      }),
    }));
    expect(res.status).toBe(404);
  });

  it('forbids field_super from uploading non-PHOTO_PACKAGE kinds', async () => {
    docMockGetServerSession.mockResolvedValueOnce({ user: { email: 'super@kulaglass.com', role: 'field_super' } });
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drive_file_id: 'd', filename: 'x.pdf', kind: 'CONTRACT' }),
    }));
    expect(res.status).toBe(403);
  });

  it('allows field_super to upload PHOTO_PACKAGE', async () => {
    docMockGetServerSession.mockResolvedValueOnce({ user: { email: 'super@kulaglass.com', role: 'field_super' } });
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drive_file_id: 'd', filename: 'photos.zip', kind: 'PHOTO_PACKAGE' }),
    }));
    expect(res.status).toBe(201);
  });

  it('rejects unauthorized roles outright', async () => {
    docMockGetServerSession.mockResolvedValueOnce({ user: { email: 'crew@kulaglass.com', role: 'crew' } });
    const { POST } = await import('@/app/api/documents/route');
    const res = await POST(new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drive_file_id: 'd', filename: 'x.pdf', kind: 'OTHER' }),
    }));
    expect(res.status).toBe(403);
  });
});

// ═══ GET /api/documents (cross-project) ════════════════════════════════════

describe('GET /api/documents', () => {
  it('returns items for senior PM', async () => {
    docSelectResultQueue.push([
      { document_id: DOC_ID, filename: 'A.pdf', kind: 'SHOP_DRAWING' },
    ]);
    const { GET } = await import('@/app/api/documents/route');
    const res = await GET(new Request('http://localhost/api/documents'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('rejects unauthorized roles', async () => {
    docMockGetServerSession.mockResolvedValueOnce({ user: { email: 'crew@kulaglass.com', role: 'crew' } });
    const { GET } = await import('@/app/api/documents/route');
    const res = await GET(new Request('http://localhost/api/documents'));
    expect(res.status).toBe(403);
  });
});

// ═══ GET /api/documents/by-kid/[kid] ═══════════════════════════════════════

describe('GET /api/documents/by-kid/[kid]', () => {
  it('returns kIDFound:false when engagement does not exist', async () => {
    docSelectResultQueue.push([]); // engagement lookup
    const { GET } = await import('@/app/api/documents/by-kid/[kid]/route');
    const res = await GET(
      new Request('http://localhost/api/documents/by-kid/PRJ-99-9999'),
      { params: Promise.resolve({ kid: 'PRJ-99-9999' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kIDFound).toBe(false);
    expect(body.items).toEqual([]);
    expect(body.summary.total).toBe(0);
  });

  it('returns items + summary when engagement exists', async () => {
    docSelectResultQueue.push([{ engagement_id: DOC_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false }]);
    docSelectResultQueue.push([
      { document_id: 'd1', filename: 'A.pdf', kind: 'SHOP_DRAWING', linked_entity_type: 'SUBMITTAL', is_current: true },
      { document_id: 'd2', filename: 'B.pdf', kind: 'CONTRACT', linked_entity_type: null, is_current: true },
    ]);
    const { GET } = await import('@/app/api/documents/by-kid/[kid]/route');
    const res = await GET(
      new Request('http://localhost/api/documents/by-kid/PRJ-26-0001'),
      { params: Promise.resolve({ kid: 'PRJ-26-0001' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kIDFound).toBe(true);
    expect(body.items).toHaveLength(2);
    expect(body.summary.total).toBe(2);
    expect(body.summary.current_count).toBe(2);
    expect(body.summary.linked_count).toBe(1);
    expect(body.summary.by_kind.SHOP_DRAWING).toBe(1);
    expect(body.summary.by_kind.CONTRACT).toBe(1);
    expect(body.summary.by_linked_entity.SUBMITTAL).toBe(1);
  });
});

// ═══ GET /api/documents/by-entity/[type]/[id] ══════════════════════════════

describe('GET /api/documents/by-entity/[type]/[id]', () => {
  it('rejects unknown linked_entity_type', async () => {
    const { GET } = await import('@/app/api/documents/by-entity/[type]/[id]/route');
    const res = await GET(
      new Request('http://localhost/api/documents/by-entity/UNKNOWN/' + DOC_LINK_ID),
      { params: Promise.resolve({ type: 'UNKNOWN', id: DOC_LINK_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('rejects malformed id', async () => {
    const { GET } = await import('@/app/api/documents/by-entity/[type]/[id]/route');
    const res = await GET(
      new Request('http://localhost/api/documents/by-entity/SUBMITTAL/not-a-uuid'),
      { params: Promise.resolve({ type: 'SUBMITTAL', id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns linked documents', async () => {
    docSelectResultQueue.push([
      { document_id: 'd1', filename: 'submittal.pdf', kind: 'SUBMITTAL_PACKAGE' },
    ]);
    const { GET } = await import('@/app/api/documents/by-entity/[type]/[id]/route');
    const res = await GET(
      new Request('http://localhost/api/documents/by-entity/SUBMITTAL/' + DOC_LINK_ID),
      { params: Promise.resolve({ type: 'SUBMITTAL', id: DOC_LINK_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});

// ═══ GET / PATCH /api/documents/[id] ═══════════════════════════════════════

describe('GET /api/documents/[id]', () => {
  it('rejects non-uuid path', async () => {
    const { GET } = await import('@/app/api/documents/[id]/route');
    const res = await GET(
      new Request('http://localhost/api/documents/abc'),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when not found', async () => {
    docSelectResultQueue.push([]); // getDocumentForTenant returns empty
    const { GET } = await import('@/app/api/documents/[id]/route');
    const res = await GET(
      new Request('http://localhost/api/documents/' + DOC_ID),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns the document when found', async () => {
    docSelectResultQueue.push([{
      document_id: DOC_ID,
      filename: 'A.pdf',
      kind: 'SHOP_DRAWING',
      is_current: true,
      version: 1,
      linked_entity_type: null,
      linked_entity_id: null,
    }]);
    const { GET } = await import('@/app/api/documents/[id]/route');
    const res = await GET(
      new Request('http://localhost/api/documents/' + DOC_ID),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document.document_id).toBe(DOC_ID);
  });
});

describe('PATCH /api/documents/[id]', () => {
  it('rejects empty body (no allowed fields)', async () => {
    docSelectResultQueue.push([{ document_id: DOC_ID, filename: 'A.pdf', kind: 'OTHER', is_current: true, linked_entity_type: null, linked_entity_id: null, engagement_id: null, kid: null, is_test_project: false }]);
    const { PATCH } = await import('@/app/api/documents/[id]/route');
    const res = await PATCH(
      new Request('http://localhost/api/documents/' + DOC_ID, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: 99 }), // forbidden field
      }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('updates allowed fields and emits DOCUMENT_LINKED on link change', async () => {
    docSelectResultQueue.push([{
      document_id: DOC_ID,
      filename: 'A.pdf',
      kind: 'OTHER',
      is_current: true,
      linked_entity_type: null,
      linked_entity_id: null,
      engagement_id: DOC_ENG_ID,
      kid: 'PRJ-26-0001',
      is_test_project: false,
    }]);
    const { PATCH } = await import('@/app/api/documents/[id]/route');
    const res = await PATCH(
      new Request('http://localhost/api/documents/' + DOC_ID, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: 'A-v2.pdf',
          linked_entity_type: 'SUBMITTAL',
          linked_entity_id: DOC_LINK_ID,
        }),
      }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(200);
    expect(docUpdateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'A-v2.pdf',
      linked_entity_type: 'SUBMITTAL',
      linked_entity_id: DOC_LINK_ID,
    }));
    const events = docInsertValuesSpy.mock.calls.filter((c) => c[0] === 'field_events');
    const types = events.map((e) => (e[1] as { event_type: string }).event_type);
    expect(types).toContain('DOCUMENT_LINKED');
  });

  it('rejects half-pair link (type without id) in PATCH', async () => {
    docSelectResultQueue.push([{
      document_id: DOC_ID, filename: 'A.pdf', kind: 'OTHER', is_current: true,
      linked_entity_type: null, linked_entity_id: null,
      engagement_id: null, kid: null, is_test_project: false,
    }]);
    const { PATCH } = await import('@/app/api/documents/[id]/route');
    const res = await PATCH(
      new Request('http://localhost/api/documents/' + DOC_ID, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ linked_entity_type: 'SUBMITTAL' }),
      }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(400);
  });
});

// ═══ POST /api/documents/[id]/supersede ════════════════════════════════════

describe('POST /api/documents/[id]/supersede', () => {
  it('rejects when drive_file_id is missing', async () => {
    const { POST } = await import('@/app/api/documents/[id]/supersede/route');
    const res = await POST(
      new Request('http://localhost/api/documents/' + DOC_ID + '/supersede', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('rejects when predecessor is already superseded', async () => {
    docSelectResultQueue.push([{
      document_id: DOC_ID, filename: 'A.pdf', kind: 'CONTRACT',
      version: 1, is_current: false,
      linked_entity_type: null, linked_entity_id: null,
      engagement_id: null, kid: null, is_test_project: false,
    }]);
    const { POST } = await import('@/app/api/documents/[id]/supersede/route');
    const res = await POST(
      new Request('http://localhost/api/documents/' + DOC_ID + '/supersede', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ drive_file_id: 'newDriveId' }),
      }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(409);
  });

  it('returns 404 when predecessor not found', async () => {
    docSelectResultQueue.push([]); // predecessor lookup empty
    const { POST } = await import('@/app/api/documents/[id]/supersede/route');
    const res = await POST(
      new Request('http://localhost/api/documents/' + DOC_ID + '/supersede', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ drive_file_id: 'newDriveId' }),
      }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it('creates new version, emits DOCUMENT_SUPERSEDED + DOCUMENT_UPLOADED', async () => {
    docSelectResultQueue.push([{
      document_id: DOC_ID, filename: 'A.pdf', kind: 'CONTRACT',
      version: 1, is_current: true,
      linked_entity_type: null, linked_entity_id: null,
      engagement_id: DOC_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false,
      subkind: null, notes: null, external_visible: false,
    }]);
    docSelectResultQueue.push([{ user_id: DOC_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/documents/[id]/supersede/route');
    const res = await POST(
      new Request('http://localhost/api/documents/' + DOC_ID + '/supersede', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ drive_file_id: 'newDriveId', filename: 'A-v2.pdf' }),
      }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(201);
    const docInsert = docInsertValuesSpy.mock.calls.find((c) => c[0] === 'document_hub_entries');
    expect(docInsert?.[1]).toMatchObject({
      version: 2,
      drive_file_id: 'newDriveId',
      filename: 'A-v2.pdf',
      kind: 'CONTRACT',
    });
    const events = docInsertValuesSpy.mock.calls.filter((c) => c[0] === 'field_events');
    const types = events.map((e) => (e[1] as { event_type: string }).event_type);
    expect(types).toContain('DOCUMENT_SUPERSEDED');
    expect(types).toContain('DOCUMENT_UPLOADED');
    expect(docUpdateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      superseded_by_document_id: DOC_ID,
    }));
  });
});
