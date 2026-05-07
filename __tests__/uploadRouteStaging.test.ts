const mockGetGoogleAuth = jest.fn();
const mockGoogleDrive = jest.fn();

jest.mock('@/lib/gauth', () => ({ getGoogleAuth: mockGetGoogleAuth }));
jest.mock('googleapis', () => ({
  google: {
    drive: mockGoogleDrive,
  },
}));

const PROD_ESTIMATING_ACTIVE = '1-_Vl0OM4AE4pnm_bKKqqIluJr3jk0hTf';
const STAGING_FOLDER_ID = '142jODngww2a4PoNDrf-rjN5O_y40I3ti';

type DriveMocks = {
  list: jest.Mock;
  create: jest.Mock;
  drive: { files: { list: jest.Mock; create: jest.Mock } };
};

function buildDriveMocks(): DriveMocks {
  let id = 0;
  const list = jest.fn().mockResolvedValue({ data: { files: [] } });
  const create = jest.fn().mockImplementation(() => {
    id += 1;
    return Promise.resolve({ data: { id: `created-${id}`, name: `f-${id}`, webViewLink: `https://drive.google.com/file/d/created-${id}/view` } });
  });
  const drive = { files: { list, create } };
  return { list, create, drive };
}

function makeUploadRequest() {
  const form = new FormData();
  form.set('file', new File(['xls-bytes'], 'TakeOff.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  form.set('bidKID', 'B-2026-001');
  form.set('bidName', 'Acme Atrium Glazing');
  form.set('estimator', 'Joey Ritthaler');
  return new Request('https://example.test/api/upload', {
    method: 'POST',
    body: form,
  });
}

describe('app/api/upload — staging fences', () => {
  let prevTargetEnv: string | undefined;
  let prevStagingId: string | undefined;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockGetGoogleAuth.mockReturnValue({});
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevStagingId = process.env.STAGING_DRIVE_FOLDER_ID;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevStagingId === undefined) delete process.env.STAGING_DRIVE_FOLDER_ID;
    else process.env.STAGING_DRIVE_FOLDER_ID = prevStagingId;
    consoleErrorSpy.mockRestore();
  });

  it('production routes the estimator folder under ESTIMATING_ACTIVE_PROD (regression)', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    process.env.STAGING_DRIVE_FOLDER_ID = STAGING_FOLDER_ID;

    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(makeUploadRequest() as any);
    expect(res.status).toBe(200);

    // The very first folder created is "Joey" (estimator first name) and its
    // parent must be the production estimating workspace.
    const firstCreate = m.create.mock.calls[0][0];
    expect(firstCreate.requestBody.name).toBe('Joey');
    expect(firstCreate.requestBody.parents).toEqual([PROD_ESTIMATING_ACTIVE]);
  });

  it('staging routes the estimator folder under STAGING_DRIVE_FOLDER_ID and never under ESTIMATING_ACTIVE_PROD', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.STAGING_DRIVE_FOLDER_ID = STAGING_FOLDER_ID;

    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(makeUploadRequest() as any);
    expect(res.status).toBe(200);

    // First folder created must be parented under STAGING_DRIVE_FOLDER_ID.
    const firstCreate = m.create.mock.calls[0][0];
    expect(firstCreate.requestBody.parents).toEqual([STAGING_FOLDER_ID]);

    // No created folder may be parented at the production estimating root.
    for (const call of m.create.mock.calls) {
      const parents: string[] = call[0].requestBody.parents || [];
      expect(parents).not.toContain(PROD_ESTIMATING_ACTIVE);
    }
  });

  it('staging fails closed with 502 when STAGING_DRIVE_FOLDER_ID is missing — no Drive write occurs', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    delete process.env.STAGING_DRIVE_FOLDER_ID;

    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(makeUploadRequest() as any);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/STAGING_DRIVE_FOLDER_ID/);

    expect(m.create).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
  });

  it('staging fails closed when STAGING_DRIVE_FOLDER_ID is not a plausible Drive id', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.STAGING_DRIVE_FOLDER_ID = 'bogus';

    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(makeUploadRequest() as any);
    expect(res.status).toBe(502);
    expect(m.create).not.toHaveBeenCalled();
  });
});

export {};
