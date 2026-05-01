const mockCheckPermission = jest.fn();
const mockSheets = jest.fn();

jest.mock('@/lib/permissions', () => ({
  checkPermission: mockCheckPermission,
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'backend-sheet-test'),
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: mockSheets,
  },
}));

function request(method = 'GET') {
  return new Request('https://example.test/api/customers', { method });
}

describe('legacy customers route containment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires read permission for legacy customer reads', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false });
    const { GET } = await import('@/app/api/customers/route');

    const res = await GET(request());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Forbidden: wo:view required');
    expect(mockSheets).not.toHaveBeenCalled();
  });

  it('blocks legacy customer PATCH writes before any sheet access', async () => {
    const { PATCH } = await import('@/app/api/customers/route');

    const res = await PATCH();
    const json = await res.json();

    expect(res.status).toBe(410);
    expect(json.canonical_path).toBe('/api/organizations');
    expect(mockSheets).not.toHaveBeenCalled();
  });

  it('blocks legacy customer POST writes before any sheet access', async () => {
    const { POST } = await import('@/app/api/customers/route');

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(410);
    expect(json.canonical_path).toBe('/api/organizations');
    expect(mockSheets).not.toHaveBeenCalled();
  });
});

export {};
