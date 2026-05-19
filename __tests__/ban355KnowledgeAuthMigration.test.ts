/**
 * BAN-355 — KB auth migration route tests.
 *
 * Confirms each /api/knowledge/* route enforces the canonical role gate
 * (defined in lib/knowledge/api-gate.ts) and rejects insufficient
 * sessions with 401 / 403 while permitting the documented roles.
 *
 * Mocks @/lib/permissions to drive `checkPermission` so the suite can
 * exercise the gates without standing up next-auth or the backend Sheet.
 * Mocks @/lib/knowledge to keep route handlers off the live Sheets API.
 */

const mockCheckPermission = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'test-sheet-id'),
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

const mockSheetsAppend = jest.fn().mockResolvedValue({ data: {} });
const mockSheetsUpdate = jest.fn().mockResolvedValue({ data: {} });
const mockSheetsBatchUpdate = jest.fn().mockResolvedValue({ data: {} });
const mockSheetsGet = jest.fn().mockResolvedValue({
  data: { sheets: [{ properties: { title: 'KB_Articles', sheetId: 1 } }] },
});
const mockValuesGet = jest.fn().mockResolvedValue({ data: { values: [] } });
const mockValuesBatchUpdate = jest.fn().mockResolvedValue({ data: {} });

jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: {
        get: mockSheetsGet,
        batchUpdate: mockSheetsBatchUpdate,
        values: {
          append: mockSheetsAppend,
          update: mockSheetsUpdate,
          get: mockValuesGet,
          batchUpdate: mockValuesBatchUpdate,
        },
      },
    })),
  },
}));

// Stub the knowledge sheets helpers; the gate is the only thing under test
// per route, so we just need successful no-op reads/writes when the gate
// admits the caller.
jest.mock('@/lib/knowledge', () => ({
  KB_ARTICLES_SHEET: 'KB_Articles',
  KB_FEEDBACK_SHEET: 'KB_Feedback',
  KB_PRODUCT_LINES_SHEET: 'KB_Product_Lines',
  KB_SOURCE_DOCUMENTS_SHEET: 'KB_Source_Documents',
  KB_PARTS_SHEET: 'KB_Parts',
  KB_SEARCH_TERMS_SHEET: 'KB_Search_Terms',
  KB_ARTICLE_VIEWS_SHEET: 'KB_Article_Views',
  getArticles: jest.fn().mockResolvedValue([]),
  getArticleById: jest.fn().mockResolvedValue({
    article: { article_id: 'ka-1', product_line_id: 'P', source_document_ids: ['s1'] },
    rowIndex: 2,
  }),
  getFeedback: jest.fn().mockResolvedValue([]),
  getProductLines: jest.fn().mockResolvedValue([]),
  articleToRow: jest.fn(() => Array(23).fill('')),
  getSheets: jest.fn(() => ({
    spreadsheets: {
      get: mockSheetsGet,
      batchUpdate: mockSheetsBatchUpdate,
      values: {
        append: mockSheetsAppend,
        update: mockSheetsUpdate,
        get: mockValuesGet,
      },
    },
  })),
}));

function permResult(role: string, email: string | null = role === 'none' ? null : `${role}@kulaglass.com`) {
  return { allowed: true, role, email };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServerSession.mockResolvedValue({ user: { email: 'pm@kulaglass.com' } });
});

// ═══ POST /api/knowledge (write gate) ══════════════════════════════════════

describe('POST /api/knowledge — write gate', () => {
  const body = JSON.stringify({ title: 'X', product_line_id: 'PL-1' });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { POST } = await import('@/app/api/knowledge/route');
    const res = await POST(new Request('http://t/api/knowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for an authenticated non-management role (field)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { POST } = await import('@/app/api/knowledge/route');
    const res = await POST(new Request('http://t/api/knowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for estimator', async () => {
    mockCheckPermission.mockResolvedValue(permResult('estimator'));
    const { POST } = await import('@/app/api/knowledge/route');
    const res = await POST(new Request('http://t/api/knowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { POST } = await import('@/app/api/knowledge/route');
    const res = await POST(new Request('http://t/api/knowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { POST } = await import('@/app/api/knowledge/route');
    const res = await POST(new Request('http://t/api/knowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for business_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('business_admin'));
    const { POST } = await import('@/app/api/knowledge/route');
    const res = await POST(new Request('http://t/api/knowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for catalog_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('catalog_admin'));
    const { POST } = await import('@/app/api/knowledge/route');
    const res = await POST(new Request('http://t/api/knowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });
});

// ═══ GET /api/knowledge (anonymous-tolerant) ═══════════════════════════════

describe('GET /api/knowledge — anonymous-tolerant', () => {
  it('serves published-only articles to unauthenticated callers (no 401)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/knowledge/route');
    const res = await GET(new Request('http://t/api/knowledge'));
    expect(res.status).toBe(200);
    const { getArticles } = jest.requireMock('@/lib/knowledge');
    expect(getArticles).toHaveBeenCalledWith(true); // publishedOnly = true
  });

  it('serves all-status articles to a KB manager (pm)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { GET } = await import('@/app/api/knowledge/route');
    const res = await GET(new Request('http://t/api/knowledge'));
    expect(res.status).toBe(200);
    const { getArticles } = jest.requireMock('@/lib/knowledge');
    expect(getArticles).toHaveBeenCalledWith(false); // publishedOnly = false
  });
});

// ═══ PATCH / DELETE /api/knowledge/[articleId] (write gate) ════════════════

describe('PATCH /api/knowledge/[articleId] — write gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { PATCH } = await import('@/app/api/knowledge/[articleId]/route');
    const res = await PATCH(
      new Request('http://t/api/knowledge/ka-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      }),
      { params: Promise.resolve({ articleId: 'ka-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { PATCH } = await import('@/app/api/knowledge/[articleId]/route');
    const res = await PATCH(
      new Request('http://t/api/knowledge/ka-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      }),
      { params: Promise.resolve({ articleId: 'ka-1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 200 for catalog_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('catalog_admin'));
    const { PATCH } = await import('@/app/api/knowledge/[articleId]/route');
    const res = await PATCH(
      new Request('http://t/api/knowledge/ka-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      }),
      { params: Promise.resolve({ articleId: 'ka-1' }) },
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/knowledge/[articleId] — write gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { DELETE } = await import('@/app/api/knowledge/[articleId]/route');
    const res = await DELETE(
      new Request('http://t/api/knowledge/ka-1', { method: 'DELETE' }),
      { params: Promise.resolve({ articleId: 'ka-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for sales role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('sales'));
    const { DELETE } = await import('@/app/api/knowledge/[articleId]/route');
    const res = await DELETE(
      new Request('http://t/api/knowledge/ka-1', { method: 'DELETE' }),
      { params: Promise.resolve({ articleId: 'ka-1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { DELETE } = await import('@/app/api/knowledge/[articleId]/route');
    const res = await DELETE(
      new Request('http://t/api/knowledge/ka-1', { method: 'DELETE' }),
      { params: Promise.resolve({ articleId: 'ka-1' }) },
    );
    expect(res.status).toBe(200);
  });
});

// ═══ /api/knowledge/feedback (triage / auth gates) ═════════════════════════

describe('GET /api/knowledge/feedback — triage gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/knowledge/feedback/route');
    const res = await GET(new Request('http://t/api/knowledge/feedback'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { GET } = await import('@/app/api/knowledge/feedback/route');
    const res = await GET(new Request('http://t/api/knowledge/feedback'));
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { GET } = await import('@/app/api/knowledge/feedback/route');
    const res = await GET(new Request('http://t/api/knowledge/feedback'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for catalog_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('catalog_admin'));
    const { GET } = await import('@/app/api/knowledge/feedback/route');
    const res = await GET(new Request('http://t/api/knowledge/feedback'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/knowledge/feedback — auth gate (any signed-in user)', () => {
  const body = JSON.stringify({ article_id: 'ka-1', feedback_type: 'helpful' });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { POST } = await import('@/app/api/knowledge/feedback/route');
    const res = await POST(new Request('http://t/api/knowledge/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role (any authenticated user can submit)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    mockGetServerSession.mockResolvedValue({ user: { email: 'field@kulaglass.com' } });
    const { POST } = await import('@/app/api/knowledge/feedback/route');
    const res = await POST(new Request('http://t/api/knowledge/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { POST } = await import('@/app/api/knowledge/feedback/route');
    const res = await POST(new Request('http://t/api/knowledge/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });
});

// ═══ POST /api/knowledge/setup (setup gate — super_admin only) ═════════════

describe('POST /api/knowledge/setup — setup gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { POST } = await import('@/app/api/knowledge/setup/route');
    const res = await POST(new Request('http://t/api/knowledge/setup', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for pm (not super_admin)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { POST } = await import('@/app/api/knowledge/setup/route');
    const res = await POST(new Request('http://t/api/knowledge/setup', { method: 'POST' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for business_admin (not super_admin)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('business_admin'));
    const { POST } = await import('@/app/api/knowledge/setup/route');
    const res = await POST(new Request('http://t/api/knowledge/setup', { method: 'POST' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for catalog_admin (not super_admin)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('catalog_admin'));
    const { POST } = await import('@/app/api/knowledge/setup/route');
    const res = await POST(new Request('http://t/api/knowledge/setup', { method: 'POST' }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { POST } = await import('@/app/api/knowledge/setup/route');
    const res = await POST(new Request('http://t/api/knowledge/setup', { method: 'POST' }));
    expect(res.status).toBe(200);
  });
});

// ═══ Parts / product-lines / sources (auth gate — any signed-in) ═══════════

describe('GET /api/knowledge/parts — auth gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/knowledge/parts/route');
    const res = await GET(new Request('http://t/api/knowledge/parts?article_id=ka-1'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { GET } = await import('@/app/api/knowledge/parts/route');
    const res = await GET(new Request('http://t/api/knowledge/parts?article_id=ka-1'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/knowledge/product-lines — auth gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/knowledge/product-lines/route');
    const res = await GET(new Request('http://t/api/knowledge/product-lines'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { GET } = await import('@/app/api/knowledge/product-lines/route');
    const res = await GET(new Request('http://t/api/knowledge/product-lines'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/knowledge/sources — auth gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/knowledge/sources/route');
    const res = await GET(new Request('http://t/api/knowledge/sources?article_id=ka-1'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { GET } = await import('@/app/api/knowledge/sources/route');
    const res = await GET(new Request('http://t/api/knowledge/sources?article_id=ka-1'));
    expect(res.status).toBe(200);
  });
});
