const mockGetServerSession = jest.fn();
const mockGoogleDrive = jest.fn();
const mockGoogleSheets = jest.fn();

jest.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: jest.fn(() => ({})) }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('googleapis', () => ({
  google: {
    drive: mockGoogleDrive,
    sheets: mockGoogleSheets,
  },
}));

const STAGING_FOLDER_ID = '142jODngww2a4PoNDrf-rjN5O_y40I3ti';
const PROD_DRIVE_ROOT = '0AKSVpf3AnH7CUk9PVA';

function makeRequest() {
  const form = new FormData();
  form.set('file', new File(['quote'], 'quote.pdf', { type: 'application/pdf' }));
  form.set('procurement_id', 'PROC-1');
  form.set('wo_id', 'WO-26-0001');
  return new Request('https://example.test/api/procurement/upload', {
    method: 'POST',
    body: form,
  });
}

function setupGoogle() {
  const filesList = jest.fn().mockResolvedValue({ data: { files: [] } });
  const filesCreate = jest
    .fn()
    .mockResolvedValueOnce({ data: { id: 'vendor-quotes-folder-id' } })
    .mockResolvedValueOnce({
      data: {
        id: 'uploaded-file-id',
        webViewLink: 'https://drive.google.com/file/d/uploaded-file-id/view',
        name: 'quote.pdf',
      },
    });
  const permissionsCreate = jest.fn().mockResolvedValue({ data: {} });
  mockGoogleDrive.mockReturnValue({
    files: { list: filesList, create: filesCreate },
    permissions: { create: permissionsCreate },
  });

  const valuesGet = jest.fn().mockResolvedValue({ data: { values: [['PROC-1']] } });
  const batchUpdate = jest.fn().mockResolvedValue({ data: {} });
  mockGoogleSheets.mockReturnValue({
    spreadsheets: { values: { get: valuesGet, batchUpdate } },
  });

  return { filesList, filesCreate, permissionsCreate, valuesGet, batchUpdate };
}

describe('/api/procurement/upload staging Drive fence', () => {
  let prevTargetEnv: string | undefined;
  let prevStagingId: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevStagingId = process.env.STAGING_DRIVE_FOLDER_ID;
    mockGetServerSession.mockResolvedValue({ user: { email: 'pm@kulaglass.com' } });
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevStagingId === undefined) delete process.env.STAGING_DRIVE_FOLDER_ID;
    else process.env.STAGING_DRIVE_FOLDER_ID = prevStagingId;
  });

  it('staging parents Vendor_Quotes under STAGING_DRIVE_FOLDER_ID and skips public permission creation', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.STAGING_DRIVE_FOLDER_ID = STAGING_FOLDER_ID;
    const googleMocks = setupGoogle();
    const { POST } = await import('@/app/api/procurement/upload/route');

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(googleMocks.filesList).toHaveBeenCalledWith(expect.objectContaining({
      q: expect.stringContaining(`'${STAGING_FOLDER_ID}' in parents`),
    }));
    expect(googleMocks.filesCreate.mock.calls[0][0].requestBody.parents).toEqual([STAGING_FOLDER_ID]);
    expect(googleMocks.permissionsCreate).not.toHaveBeenCalled();
  });

  it('production keeps the production Drive root and public permission behavior', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    process.env.STAGING_DRIVE_FOLDER_ID = STAGING_FOLDER_ID;
    const googleMocks = setupGoogle();
    const { POST } = await import('@/app/api/procurement/upload/route');

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(googleMocks.filesList).toHaveBeenCalledWith(expect.objectContaining({
      q: expect.stringContaining(`'${PROD_DRIVE_ROOT}' in parents`),
    }));
    expect(googleMocks.filesCreate.mock.calls[0][0].requestBody.parents).toEqual([PROD_DRIVE_ROOT]);
    expect(googleMocks.permissionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: { role: 'reader', type: 'anyone' },
    }));
  });

  it('staging missing STAGING_DRIVE_FOLDER_ID fails before Drive write', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    delete process.env.STAGING_DRIVE_FOLDER_ID;
    const googleMocks = setupGoogle();
    const { POST } = await import('@/app/api/procurement/upload/route');

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/STAGING_DRIVE_FOLDER_ID/);
    expect(googleMocks.filesList).not.toHaveBeenCalled();
    expect(googleMocks.filesCreate).not.toHaveBeenCalled();
    expect(googleMocks.permissionsCreate).not.toHaveBeenCalled();
  });
});

