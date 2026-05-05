const mockCheckPermission = jest.fn();
const mockGoogleSheets = jest.fn();
const mockGoogleDrive = jest.fn();
const mockHawaiiNow = jest.fn();

jest.mock('@/lib/permissions', () => ({
  checkPermission: mockCheckPermission,
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'backend-sheet-test'),
}));

jest.mock('@/lib/hawaii-time', () => ({
  hawaiiNow: () => mockHawaiiNow(),
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: mockGoogleSheets,
    drive: mockGoogleDrive,
  },
}));

import { BANYAN_DRIVE_ID, STANDARD_SUBFOLDERS } from '@/lib/drive-wo-folder';

type DriveMocks = ReturnType<typeof buildDrive>;

function buildDrive(opts: {
  listImpl?: (params: any) => any;
  createImpl?: (params: any) => any;
  getImpl?: (params: any) => any;
} = {}) {
  let createId = 0;
  const list = jest.fn().mockImplementation(opts.listImpl || (() => Promise.resolve({ data: { files: [] } })));
  const create = jest.fn().mockImplementation(opts.createImpl || (() => {
    createId += 1;
    return Promise.resolve({ data: { id: `created-${createId}` } });
  }));
  const get = jest.fn().mockImplementation(opts.getImpl || (() => Promise.resolve({ data: {} })));
  const permissionsCreate = jest.fn().mockResolvedValue({ data: {} });
  return {
    list, create, get, permissionsCreate,
    instance: {
      files: { list, create, get },
      permissions: { create: permissionsCreate },
    },
  };
}

function buildSheets(rows: string[][]) {
  const get = jest.fn().mockResolvedValue({ data: { values: rows } });
  const update = jest.fn().mockResolvedValue({ data: {} });
  return {
    get, update,
    instance: {
      spreadsheets: { values: { get, update } },
    },
  };
}

const HEADERS_BLANK_ROW: string[] = []; // not used as a header but pads index

function makeSheetRows(woRow: string[]): string[][] {
  return [woRow];
}

function woRow(opts: {
  woId?: string;
  woNumber?: string;
  customerName?: string;
  island?: string;
  folderUrl?: string;
} = {}): string[] {
  const row = new Array(28).fill('');
  row[0]  = opts.woId        ?? 'WO-26-8371';
  row[1]  = opts.woNumber    ?? '26-8371';
  row[5]  = opts.island      ?? 'Maui';
  row[12] = opts.customerName ?? 'Test Customer';
  row[23] = opts.folderUrl   ?? '';
  return row;
}

function request(body: Record<string, unknown>) {
  return new Request('https://example.test/api/admin/wo-folder-repair', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckPermission.mockResolvedValue({ allowed: true });
  mockHawaiiNow.mockReturnValue('2026-05-05T09:00:00');
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('POST /api/admin/wo-folder-repair', () => {
  it('rejects unauthorized callers', async () => {
    mockCheckPermission.mockResolvedValueOnce({ allowed: false });
    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({ woNumber: '26-8371' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('admin:backfill');
  });

  it('returns 400 when no woId/woNumber is provided', async () => {
    const drive = buildDrive();
    const sheets = buildSheets(makeSheetRows(woRow()));
    mockGoogleDrive.mockReturnValue(drive.instance);
    mockGoogleSheets.mockReturnValue(sheets.instance);
    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when WO not found', async () => {
    const drive = buildDrive();
    const sheets = buildSheets([]);
    mockGoogleDrive.mockReturnValue(drive.instance);
    mockGoogleSheets.mockReturnValue(sheets.instance);
    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({ woNumber: '26-9999' }));
    expect(res.status).toBe(404);
  });

  it('defaults to dryRun=true and does NOT mutate even when classification needs repair', async () => {
    const drive = buildDrive({
      getImpl: () => Promise.resolve({
        data: {
          id: 'joey-folder',
          name: 'Jude Augustine',
          driveId: null,
          parents: ['root'],
          owners: [{ emailAddress: 'joey@kulaglass.com' }],
          trashed: false,
          webViewLink: 'https://drive.google.com/drive/folders/joey-id-12345678901',
        },
      }),
    });
    const sheets = buildSheets(makeSheetRows(woRow({
      folderUrl: 'https://drive.google.com/drive/folders/joey-id-12345678901',
    })));
    mockGoogleDrive.mockReturnValue(drive.instance);
    mockGoogleSheets.mockReturnValue(sheets.instance);

    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({ woNumber: '26-8371' }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.dryRun).toBe(true);
    expect(body.mutated).toBe(false);
    expect(body.classification.kind).toBe('my_drive');
    expect(body.plan.action).toBe('create_canonical_folder');
    expect(body.plan.willCreateNewFolder).toBe(true);
    expect(body.plan.willUpdateSheetFolderUrl).toBe(true);
    expect(body.plan.willTouchExistingFolder).toBe('never');

    expect(drive.create).not.toHaveBeenCalled();
    expect(sheets.update).not.toHaveBeenCalled();
  });

  it('does NOT mutate when dryRun=false but confirm is missing/false', async () => {
    const drive = buildDrive({
      getImpl: () => Promise.resolve({
        data: { id: 'joey-folder', driveId: null, parents: ['root'], trashed: false },
      }),
    });
    const sheets = buildSheets(makeSheetRows(woRow({
      folderUrl: 'https://drive.google.com/drive/folders/joey-id-12345678901',
    })));
    mockGoogleDrive.mockReturnValue(drive.instance);
    mockGoogleSheets.mockReturnValue(sheets.instance);

    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({ woNumber: '26-8371', dryRun: false }));
    const body = await res.json();
    expect(body.mutated).toBe(false);
    expect(drive.create).not.toHaveBeenCalled();
    expect(sheets.update).not.toHaveBeenCalled();
  });

  it('classifies unparseable folder_url and does not call Drive get', async () => {
    const drive = buildDrive();
    const sheets = buildSheets(makeSheetRows(woRow({ folderUrl: 'not a real url' })));
    mockGoogleDrive.mockReturnValue(drive.instance);
    mockGoogleSheets.mockReturnValue(sheets.instance);

    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({ woNumber: '26-8371' }));
    const body = await res.json();
    expect(body.classification.kind).toBe('unparseable');
    expect(drive.get).not.toHaveBeenCalled();
    expect(body.plan.action).toBe('create_canonical_folder');
  });

  it('classifies empty folder_url as empty', async () => {
    const drive = buildDrive();
    const sheets = buildSheets(makeSheetRows(woRow({ folderUrl: '' })));
    mockGoogleDrive.mockReturnValue(drive.instance);
    mockGoogleSheets.mockReturnValue(sheets.instance);

    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({ woNumber: '26-8371' }));
    const body = await res.json();
    expect(body.classification.kind).toBe('empty');
    expect(body.plan.action).toBe('create_canonical_folder');
  });

  it('mutation path with dryRun=false + confirm=true creates canonical folder and updates Sheet folder_url', async () => {
    const drive = buildDrive({
      getImpl: (params: any) => {
        // First files.get is the classify call on the My Drive folder.
        // Subsequent files.get inside createWOFolderStructure resolves the new webViewLink.
        if (params.fields && params.fields.includes('driveId')) {
          return Promise.resolve({
            data: { id: 'joey-folder', driveId: null, parents: ['root'], trashed: false },
          });
        }
        return Promise.resolve({ data: { webViewLink: 'https://drive.google.com/drive/folders/new-canon-id' } });
      },
    });
    const sheets = buildSheets(makeSheetRows(woRow({
      woId: 'WO-26-8371',
      woNumber: '26-8371',
      customerName: 'Jude Augustine',
      island: 'Maui',
      folderUrl: 'https://drive.google.com/drive/folders/joey-id-12345678901',
    })));
    mockGoogleDrive.mockReturnValue(drive.instance);
    mockGoogleSheets.mockReturnValue(sheets.instance);

    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({ woNumber: '26-8371', dryRun: false, confirm: true }));
    const body = await res.json();

    expect(body.mutated).toBe(true);
    expect(body.mutation.action).toBe('create_canonical_folder');
    expect(body.mutation.newFolderUrl).toBe('https://drive.google.com/drive/folders/new-canon-id');
    expect(body.mutation.sheetUpdated).toBe(true);

    // Sheet update was called with the new URL on row 2 column X.
    const updateCalls = sheets.update.mock.calls.map(c => c[0]);
    expect(updateCalls.some(c => c.range === 'Service_Work_Orders!X2'
      && c.requestBody.values[0][0] === 'https://drive.google.com/drive/folders/new-canon-id')).toBe(true);
    // Updated_at column AB also written.
    expect(updateCalls.some(c => c.range === 'Service_Work_Orders!AB2')).toBe(true);

    // No file/folder ever moved or deleted: ensure no files.update or files.delete were called.
    expect((drive.instance.files as any).update).toBeUndefined();
    expect((drive.instance.files as any).delete).toBeUndefined();

    // Each Drive list used the shared-drive-safe params.
    for (const call of drive.list.mock.calls) {
      const params = call[0];
      expect(params.driveId).toBe(BANYAN_DRIVE_ID);
      expect(params.corpora).toBe('drive');
      expect(params.supportsAllDrives).toBe(true);
      expect(params.includeItemsFromAllDrives).toBe(true);
    }
  });

  it('with dryRun=false + confirm=true on shared_drive_missing_subfolders, only creates missing subfolders and never updates Sheet folder_url', async () => {
    const woFolderId = 'shared-wo-folder-id-1234';
    const driveListImpl = (params: any) => {
      // First call from classifyWOFolder: list children of woFolder; return only Photos.
      if (typeof params.q === 'string' && params.q.startsWith(`'${woFolderId}'`)) {
        return Promise.resolve({ data: { files: [{ id: 'photos-id', name: 'Photos' }] } });
      }
      // findOrCreateFolder name searches: return empty so each missing subfolder gets created.
      return Promise.resolve({ data: { files: [] } });
    };
    const drive = buildDrive({
      listImpl: driveListImpl,
      getImpl: () => Promise.resolve({
        data: {
          id: woFolderId,
          name: 'WO-26-8371 — Test Customer',
          driveId: BANYAN_DRIVE_ID,
          trashed: false,
          webViewLink: `https://drive.google.com/drive/folders/${woFolderId}`,
        },
      }),
    });
    const sheets = buildSheets(makeSheetRows(woRow({
      folderUrl: `https://drive.google.com/drive/folders/${woFolderId}`,
    })));
    mockGoogleDrive.mockReturnValue(drive.instance);
    mockGoogleSheets.mockReturnValue(sheets.instance);

    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({ woNumber: '26-8371', dryRun: false, confirm: true }));
    const body = await res.json();

    expect(body.mutated).toBe(true);
    expect(body.mutation.action).toBe('ensure_subfolders');
    expect(body.mutation.sheetUpdated).toBe(false);
    expect(body.mutation.ensuredSubfolders.sort()).toEqual(
      STANDARD_SUBFOLDERS.filter(n => n !== 'Photos').slice().sort()
    );

    // Sheet folder_url must NOT be updated when only subfolders were ensured.
    expect(sheets.update).not.toHaveBeenCalled();
  });

  it('treats trashed folder as manual_review_required and refuses mutation', async () => {
    const drive = buildDrive({
      getImpl: () => Promise.resolve({
        data: { id: 'trashed-1', driveId: BANYAN_DRIVE_ID, trashed: true, name: 'WO-old' },
      }),
    });
    const sheets = buildSheets(makeSheetRows(woRow({
      folderUrl: 'https://drive.google.com/drive/folders/trashed-id-9876543210',
    })));
    mockGoogleDrive.mockReturnValue(drive.instance);
    mockGoogleSheets.mockReturnValue(sheets.instance);

    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({ woNumber: '26-8371', dryRun: false, confirm: true }));
    const body = await res.json();
    expect(body.classification.kind).toBe('trashed');
    expect(body.plan.action).toBe('manual_review_required');
    expect(body.mutated).toBe(false);
    expect(drive.create).not.toHaveBeenCalled();
    expect(sheets.update).not.toHaveBeenCalled();
  });

  it('canonical folder + confirm=true returns noop and does not mutate', async () => {
    const drive = buildDrive({
      getImpl: () => Promise.resolve({
        data: { id: 'canon-folder', driveId: BANYAN_DRIVE_ID, trashed: false, webViewLink: 'https://drive.google.com/drive/folders/canon-folder' },
      }),
      listImpl: () => Promise.resolve({
        data: { files: STANDARD_SUBFOLDERS.map((name, i) => ({ id: `sub-${i}`, name })) },
      }),
    });
    const sheets = buildSheets(makeSheetRows(woRow({
      folderUrl: 'https://drive.google.com/drive/folders/canon-folder-id-1234567',
    })));
    mockGoogleDrive.mockReturnValue(drive.instance);
    mockGoogleSheets.mockReturnValue(sheets.instance);

    const { POST } = await import('@/app/api/admin/wo-folder-repair/route');
    const res = await POST(request({ woNumber: '26-8371', dryRun: false, confirm: true }));
    const body = await res.json();
    expect(body.classification.kind).toBe('shared_drive_canonical');
    expect(body.plan.action).toBe('noop');
    expect(body.mutated).toBe(false);
    expect(drive.create).not.toHaveBeenCalled();
    expect(sheets.update).not.toHaveBeenCalled();
  });
});

export {};
