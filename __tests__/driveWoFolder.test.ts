const mockGetGoogleAuth = jest.fn();
const mockGoogleDrive = jest.fn();

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: mockGetGoogleAuth,
}));

jest.mock('googleapis', () => ({
  google: {
    drive: mockGoogleDrive,
  },
}));

import {
  BANYAN_DRIVE_ID,
  InvalidWOFolderUrlError,
  STANDARD_SUBFOLDERS,
  classifyWOFolder,
  createWOFolderStructure,
  ensureStandardSubfolders,
  extractFolderIdFromUrl,
  validateWOFolderUrlForWrite,
} from '@/lib/drive-wo-folder';

type DriveMocks = {
  list: jest.Mock;
  create: jest.Mock;
  get: jest.Mock;
  permissionsCreate: jest.Mock;
  drive: {
    files: { list: jest.Mock; create: jest.Mock; get: jest.Mock };
    permissions: { create: jest.Mock };
  };
};

function buildDriveMocks(opts: {
  listImpl?: (params: any) => any;
  createImpl?: (params: any) => any;
  getImpl?: (params: any) => any;
} = {}): DriveMocks {
  let createId = 0;
  const list = jest.fn().mockImplementation(opts.listImpl || (() => Promise.resolve({ data: { files: [] } })));
  const create = jest.fn().mockImplementation(opts.createImpl || (() => {
    createId += 1;
    return Promise.resolve({ data: { id: `created-${createId}` } });
  }));
  const get = jest.fn().mockImplementation(opts.getImpl || (() => Promise.resolve({ data: { webViewLink: 'https://drive.google.com/drive/folders/wo-link' } })));
  const permissionsCreate = jest.fn().mockResolvedValue({ data: {} });
  const drive = {
    files: { list, create, get },
    permissions: { create: permissionsCreate },
  };
  return { list, create, get, permissionsCreate, drive };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGoogleAuth.mockReturnValue({});
  mockGoogleDrive.mockImplementation(() => ({
    files: { list: jest.fn(), create: jest.fn(), get: jest.fn() },
    permissions: { create: jest.fn() },
  }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('extractFolderIdFromUrl', () => {
  it('extracts ID from a /folders/<id> URL', () => {
    expect(extractFolderIdFromUrl('https://drive.google.com/drive/folders/abc123XYZ_999')).toBe('abc123XYZ_999');
  });
  it('extracts ID from open?id=<id>', () => {
    expect(extractFolderIdFromUrl('https://drive.google.com/open?id=foo-bar-1234567890')).toBe('foo-bar-1234567890');
  });
  it('accepts a bare 20+ char id', () => {
    expect(extractFolderIdFromUrl('1A2B3C4D5E6F7G8H9I0J')).toBe('1A2B3C4D5E6F7G8H9I0J');
  });
  it('returns null for empty / nonsense', () => {
    expect(extractFolderIdFromUrl('')).toBeNull();
    expect(extractFolderIdFromUrl('   ')).toBeNull();
    expect(extractFolderIdFromUrl('not-a-url')).toBeNull();
    expect(extractFolderIdFromUrl(null)).toBeNull();
    expect(extractFolderIdFromUrl(undefined)).toBeNull();
  });
});

describe('createWOFolderStructure — shared-drive safety', () => {
  it('uses corpora=drive, driveId=BANYAN_DRIVE_ID, supportsAllDrives, includeItemsFromAllDrives on every list', async () => {
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    const url = await createWOFolderStructure('WO-26-9999', 'Test Customer', 'Maui');

    expect(url).toBe('https://drive.google.com/drive/folders/wo-link');
    expect(m.list).toHaveBeenCalled();
    for (const call of m.list.mock.calls) {
      const params = call[0];
      expect(params.corpora).toBe('drive');
      expect(params.driveId).toBe(BANYAN_DRIVE_ID);
      expect(params.supportsAllDrives).toBe(true);
      expect(params.includeItemsFromAllDrives).toBe(true);
    }
  });

  it('requests Drive scope and no impersonation subject', async () => {
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    await createWOFolderStructure('WO-26-0001', 'C', 'Maui');

    expect(mockGetGoogleAuth).toHaveBeenCalledWith(['https://www.googleapis.com/auth/drive']);
    // Second positional arg (subject) must NOT be set — service account, not impersonated.
    for (const call of mockGetGoogleAuth.mock.calls) {
      expect(call.length).toBe(1);
    }
  });

  it('builds Service / [Island] / WO-XX-YYYY — Customer and 6 standard subfolders + Kai shadow tree', async () => {
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    await createWOFolderStructure('WO-26-1234', 'Jude Augustine', 'Maui');

    const createdNames = m.create.mock.calls.map(c => c[0].requestBody.name);
    // Note: findOrCreateFolder strips characters outside [\w\s\-—()] before
    // create, which removes the literal square brackets from the Kai folder
    // name. This matches existing dispatch-route behavior.
    expect(createdNames).toEqual(expect.arrayContaining([
      'Service',
      'Maui',
      'WO-26-1234 — Jude Augustine',
      'Photos',
      'Quotes',
      'Correspondence',
      'Field Issues',
      'Daily Reports',
      'Measurements',
      '10 - AI Project Documents Kai',
      'System Generated',
    ]));

    // Every create must specify supportsAllDrives.
    for (const call of m.create.mock.calls) {
      expect(call[0].supportsAllDrives).toBe(true);
    }
  });

  it('uses Unassigned when island is blank', async () => {
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    await createWOFolderStructure('WO-26-0002', 'Customer', '');

    const createdNames = m.create.mock.calls.map(c => c[0].requestBody.name);
    expect(createdNames).toContain('Unassigned');
  });

  it('throws ServiceWOFolderCreationError when Drive list rejects', async () => {
    const m = buildDriveMocks({ listImpl: () => Promise.reject(new Error('drive offline')) });
    mockGoogleDrive.mockReturnValue(m.drive);

    await expect(createWOFolderStructure('WO-26-0003', 'C', 'Maui')).rejects.toThrow(/Drive folder could not be created/);
  });
});

describe('ensureStandardSubfolders', () => {
  it('only creates the subfolders that are missing', async () => {
    const present = new Set(['Photos', 'Quotes']);
    const m = buildDriveMocks({
      listImpl: (params: any) => {
        // listChildFolders returns both already-present subfolders.
        if (typeof params.q === 'string' && params.q.startsWith("'wo-id-1'")) {
          return Promise.resolve({
            data: {
              files: Array.from(present).map((name, i) => ({ id: `existing-${i}`, name })),
            },
          });
        }
        // findOrCreateFolder name-search for missing ones returns empty.
        return Promise.resolve({ data: { files: [] } });
      },
    });
    mockGoogleDrive.mockReturnValue(m.drive);

    const created = await ensureStandardSubfolders(m.drive as any, 'wo-id-1');

    expect(created.sort()).toEqual(
      STANDARD_SUBFOLDERS.filter(n => !present.has(n)).slice().sort()
    );
    const createdNames = m.create.mock.calls.map(c => c[0].requestBody.name);
    for (const skip of present) {
      expect(createdNames).not.toContain(skip);
    }
  });
});

describe('classifyWOFolder', () => {
  it('returns empty when folder_url is blank', async () => {
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);
    const c = await classifyWOFolder(m.drive as any, '');
    expect(c.kind).toBe('empty');
  });

  it('returns unparseable when URL has no Drive id', async () => {
    const m = buildDriveMocks();
    const c = await classifyWOFolder(m.drive as any, 'https://example.com/page');
    expect(c.kind).toBe('unparseable');
  });

  it('returns inaccessible when files.get rejects', async () => {
    const m = buildDriveMocks({ getImpl: () => Promise.reject(new Error('forbidden')) });
    const c = await classifyWOFolder(m.drive as any, 'https://drive.google.com/drive/folders/abc1234567890XYZ');
    expect(c.kind).toBe('inaccessible');
    if (c.kind === 'inaccessible') {
      expect(c.reason).toContain('forbidden');
    }
  });

  it('returns trashed when meta.trashed is true', async () => {
    const m = buildDriveMocks({
      getImpl: () => Promise.resolve({ data: { id: 'f1', name: 'WO-26-9999', trashed: true, driveId: BANYAN_DRIVE_ID } }),
    });
    const c = await classifyWOFolder(m.drive as any, 'https://drive.google.com/drive/folders/f1234567890123456789');
    expect(c.kind).toBe('trashed');
  });

  it('classifies a non-shared-drive folder as my_drive', async () => {
    const m = buildDriveMocks({
      getImpl: () => Promise.resolve({
        data: {
          id: 'joey-folder',
          name: 'Jude Augustine',
          driveId: null,
          parents: ['root'],
          owners: [{ emailAddress: 'joey@kulaglass.com' }],
          trashed: false,
          webViewLink: 'https://drive.google.com/drive/folders/joey-folder-id-123456789',
        },
      }),
    });
    const c = await classifyWOFolder(m.drive as any, 'https://drive.google.com/drive/folders/joey-folder-id-123456789');
    expect(c.kind).toBe('my_drive');
    if (c.kind === 'my_drive') {
      expect(c.driveId).toBeNull();
      expect(c.owners?.[0]?.emailAddress).toBe('joey@kulaglass.com');
    }
  });

  it('classifies shared-drive folder with all subfolders as canonical', async () => {
    const m = buildDriveMocks({
      getImpl: () => Promise.resolve({
        data: {
          id: 'wo-folder',
          name: 'WO-26-1234 — Customer',
          driveId: BANYAN_DRIVE_ID,
          trashed: false,
          webViewLink: 'https://drive.google.com/drive/folders/wo-folder-id-12345678901',
        },
      }),
      listImpl: () => Promise.resolve({
        data: { files: STANDARD_SUBFOLDERS.map((name, i) => ({ id: `sub-${i}`, name })) },
      }),
    });
    const c = await classifyWOFolder(m.drive as any, 'https://drive.google.com/drive/folders/wo-folder-id-12345678901');
    expect(c.kind).toBe('shared_drive_canonical');
  });

  it('classifies shared-drive folder with missing subfolders correctly', async () => {
    const m = buildDriveMocks({
      getImpl: () => Promise.resolve({
        data: {
          id: 'wo-folder',
          name: 'WO-26-1234 — Customer',
          driveId: BANYAN_DRIVE_ID,
          trashed: false,
          webViewLink: 'https://drive.google.com/drive/folders/wo-folder-id-12345678901',
        },
      }),
      listImpl: () => Promise.resolve({
        data: { files: [{ id: 'p', name: 'Photos' }] },
      }),
    });
    const c = await classifyWOFolder(m.drive as any, 'https://drive.google.com/drive/folders/wo-folder-id-12345678901');
    expect(c.kind).toBe('shared_drive_missing_subfolders');
    if (c.kind === 'shared_drive_missing_subfolders') {
      expect(c.missingSubfolders).toEqual(expect.arrayContaining([
        'Quotes', 'Correspondence', 'Field Issues', 'Daily Reports', 'Measurements',
      ]));
      expect(c.missingSubfolders).not.toContain('Photos');
    }
  });
});

describe('validateWOFolderUrlForWrite', () => {
  it('accepts a Banyan shared-drive folder URL', async () => {
    const m = buildDriveMocks({
      getImpl: () => Promise.resolve({
        data: {
          id: 'wo-folder',
          name: 'WO-26-1234 — Customer',
          driveId: BANYAN_DRIVE_ID,
          trashed: false,
          webViewLink: 'https://drive.google.com/drive/folders/wo-folder-id-12345678901',
        },
      }),
      listImpl: () => Promise.resolve({
        data: { files: STANDARD_SUBFOLDERS.map((name, i) => ({ id: `sub-${i}`, name })) },
      }),
    });

    const result = await validateWOFolderUrlForWrite(m.drive as any, 'https://drive.google.com/drive/folders/wo-folder-id-12345678901');

    expect(result.folderId).toBe('wo-folder-id-12345678901');
    expect(result.folderUrl).toBe('https://drive.google.com/drive/folders/wo-folder-id-12345678901');
    expect(result.driveId).toBe(BANYAN_DRIVE_ID);
    expect(result.classification.kind).toBe('shared_drive_canonical');
  });

  it('rejects My Drive/private folder URLs', async () => {
    const m = buildDriveMocks({
      getImpl: () => Promise.resolve({
        data: {
          id: 'private-folder',
          name: 'Jude Augustine',
          driveId: null,
          parents: ['root'],
          owners: [{ emailAddress: 'joey@kulaglass.com' }],
          trashed: false,
          webViewLink: 'https://drive.google.com/drive/folders/private-folder-id-12345',
        },
      }),
    });

    await expect(
      validateWOFolderUrlForWrite(m.drive as any, 'https://drive.google.com/drive/folders/private-folder-id-12345'),
    ).rejects.toMatchObject({
      name: 'InvalidWOFolderUrlError',
      classification: expect.objectContaining({ kind: 'my_drive', driveId: null }),
    });
  });

  it('rejects folders in the wrong shared drive', async () => {
    const m = buildDriveMocks({
      getImpl: () => Promise.resolve({
        data: {
          id: 'wrong-drive-folder',
          name: 'WO-26-1234 — Customer',
          driveId: '0WRONGDRIVE',
          trashed: false,
          webViewLink: 'https://drive.google.com/drive/folders/wrong-drive-folder-id-12345',
        },
      }),
    });

    await expect(
      validateWOFolderUrlForWrite(m.drive as any, 'https://drive.google.com/drive/folders/wrong-drive-folder-id-12345'),
    ).rejects.toMatchObject({
      classification: expect.objectContaining({ kind: 'my_drive', driveId: '0WRONGDRIVE' }),
    });
  });

  it('rejects unparseable folder URLs', async () => {
    const m = buildDriveMocks();

    await expect(
      validateWOFolderUrlForWrite(m.drive as any, 'https://example.com/not-drive'),
    ).rejects.toBeInstanceOf(InvalidWOFolderUrlError);
    expect(m.get).not.toHaveBeenCalled();
  });
});

export {};
