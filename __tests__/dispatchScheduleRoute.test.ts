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

describe('dispatch schedule delete permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires dispatch:create before deleting a slot', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false });
    const { DELETE } = await import('@/app/api/dispatch-schedule/route');

    const res = await DELETE(new Request('https://example.test/api/dispatch-schedule?slot_id=SLOT-1', { method: 'DELETE' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Forbidden: dispatch:create required');
    expect(mockCheckPermission).toHaveBeenCalledWith(expect.any(Request), 'dispatch:create');
    expect(mockSheets).not.toHaveBeenCalled();
  });
});

export {};
