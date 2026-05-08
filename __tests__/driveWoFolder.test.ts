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
  STAGING_DRIVE_FOLDER_ID_ENV,
  STANDARD_SUBFOLDERS,
  StagingDriveFolderConfigError,
  classifyWOFolder,
  createWOFolderStructure,
  ensureStandardSubfolders,
  extractFolderIdFromUrl,
  resolveStagingWOParentId,
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
  const parentById = new Map<string, string[]>();
  const list = jest.fn().mockImplementation(opts.listImpl || (() => Promise.resolve({ data: { files: [] } })));
  const create = jest.fn().mockImplementation(opts.createImpl || ((params: any) => {
    createId += 1;
    const id = `created-${createId}`;
    const parents = params.requestBody.parents || [];
    parentById.set(id, parents);
    return Promise.resolve({
      data: {
        id,
        driveId: BANYAN_DRIVE_ID,
        parents,
      },
    });
  }));
  const get = jest.fn().mockImplementation(opts.getImpl || ((params: any) => Promise.resolve({
    data: {
      id: params.fileId,
      driveId: BANYAN_DRIVE_ID,
      parents: parentById.get(params.fileId) || [],
      webViewLink: 'https://drive.google.com/drive/folders/wo-link',
    },
  })));
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


  it('fails closed if Drive create returns a My Drive folder instead of Banyan shared drive', async () => {
    const m = buildDriveMocks({
      createImpl: (params: any) => Promise.resolve({
        data: {
          id: 'unsafe-my-drive-folder',
          driveId: null,
          parents: params.requestBody.parents || [],
        },
      }),
    });
    mockGoogleDrive.mockReturnValue(m.drive);

    await expect(createWOFolderStructure('WO-26-0004', 'C', 'Maui')).rejects.toThrow(/unsafe Work Order folder placement/);
  });

  it('fails closed if Drive returns the created folder under the wrong parent', async () => {
    const m = buildDriveMocks({
      createImpl: () => Promise.resolve({
        data: {
          id: 'wrong-parent-folder',
          driveId: BANYAN_DRIVE_ID,
          parents: ['joey-or-other-parent'],
        },
      }),
    });
    mockGoogleDrive.mockReturnValue(m.drive);

    await expect(createWOFolderStructure('WO-26-0005', 'C', 'Maui')).rejects.toThrow(/expected parent/);
  });

  it('production never reads STAGING_DRIVE_FOLDER_ID even if it is set', async () => {
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    const prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    const prevStagingId = process.env.STAGING_DRIVE_FOLDER_ID;
    delete process.env.VERCEL_TARGET_ENV;
    process.env.STAGING_DRIVE_FOLDER_ID = '142jODngww2a4PoNDrf-rjN5O_y40I3ti';
    try {
      await createWOFolderStructure('WO-26-2222', 'Customer', 'Maui');
      const createdNames = m.create.mock.calls.map(c => c[0].requestBody.name);
      // Production routing creates Service / Maui parents at the shared-drive root.
      expect(createdNames).toContain('Service');
      expect(createdNames).toContain('Maui');
      // The first created folder is parented under BANYAN_DRIVE_ID, not STAGING.
      const firstCreate = m.create.mock.calls[0][0];
      expect(firstCreate.requestBody.parents).toEqual([BANYAN_DRIVE_ID]);
    } finally {
      if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
      else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
      if (prevStagingId === undefined) delete process.env.STAGING_DRIVE_FOLDER_ID;
      else process.env.STAGING_DRIVE_FOLDER_ID = prevStagingId;
    }
  });
});

describe('createWOFolderStructure — staging fences', () => {
  const STAGING_FOLDER_ID = '142jODngww2a4PoNDrf-rjN5O_y40I3ti';
  let prevTargetEnv: string | undefined;
  let prevStagingId: string | undefined;

  beforeEach(() => {
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevStagingId = process.env.STAGING_DRIVE_FOLDER_ID;
    process.env.VERCEL_TARGET_ENV = 'staging';
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevStagingId === undefined) delete process.env.STAGING_DRIVE_FOLDER_ID;
    else process.env.STAGING_DRIVE_FOLDER_ID = prevStagingId;
  });

  it('parents the WO folder directly under STAGING_DRIVE_FOLDER_ID and never creates Service or island folders', async () => {
    process.env.STAGING_DRIVE_FOLDER_ID = STAGING_FOLDER_ID;
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    await createWOFolderStructure('WO-26-8480', 'Test Customer', 'Maui');

    const createdNames = m.create.mock.calls.map(c => c[0].requestBody.name);
    // Staging must NOT create Service / island parent folders.
    expect(createdNames).not.toContain('Service');
    expect(createdNames).not.toContain('Maui');
    expect(createdNames).not.toContain('Unassigned');
    // The WO folder itself is created.
    expect(createdNames).toContain('WO-26-8480 — Test Customer');

    // The WO folder create must be parented under STAGING_DRIVE_FOLDER_ID.
    const woCreate = m.create.mock.calls.find(
      c => c[0].requestBody.name === 'WO-26-8480 — Test Customer'
    );
    expect(woCreate).toBeDefined();
    expect(woCreate![0].requestBody.parents).toEqual([STAGING_FOLDER_ID]);

    // Every list call still scopes to the Banyan shared drive (the staging
    // yard is inside that drive), so corpora/driveId stay correct.
    for (const call of m.list.mock.calls) {
      expect(call[0].driveId).toBe(BANYAN_DRIVE_ID);
      expect(call[0].corpora).toBe('drive');
      expect(call[0].supportsAllDrives).toBe(true);
    }
  });

  it('reuses an existing WO folder under STAGING_DRIVE_FOLDER_ID instead of creating one', async () => {
    process.env.STAGING_DRIVE_FOLDER_ID = STAGING_FOLDER_ID;
    const m = buildDriveMocks({
      listImpl: (params: any) => {
        // findOrCreateFolder name search for the WO folder returns an existing id;
        // listChildFolders for the WO folder returns all standard subfolders so
        // none are created.
        if (typeof params.q === 'string' && params.q.includes('WO-26-8480')) {
          return Promise.resolve({ data: { files: [{ id: 'existing-wo', name: 'WO-26-8480 — Test Customer', driveId: BANYAN_DRIVE_ID, parents: [STAGING_FOLDER_ID] }] } });
        }
        if (typeof params.q === 'string' && params.q.startsWith("'existing-wo'")) {
          return Promise.resolve({
            data: { files: STANDARD_SUBFOLDERS.map((name, i) => ({ id: `sub-${i}`, name })) },
          });
        }
        return Promise.resolve({ data: { files: [] } });
      },
      getImpl: (params: any) => Promise.resolve({
        data: {
          id: params.fileId,
          driveId: BANYAN_DRIVE_ID,
          parents: params.fileId === 'existing-wo' ? [STAGING_FOLDER_ID] : [],
          webViewLink: 'https://drive.google.com/drive/folders/existing-wo',
        },
      }),
    });
    mockGoogleDrive.mockReturnValue(m.drive);

    await createWOFolderStructure('WO-26-8480', 'Test Customer', 'Maui');

    const createdNames = m.create.mock.calls.map(c => c[0].requestBody.name);
    expect(createdNames).not.toContain('WO-26-8480 — Test Customer');
    expect(createdNames).not.toContain('Service');
    expect(createdNames).not.toContain('Maui');
  });

  it('fails closed with StagingDriveFolderConfigError when STAGING_DRIVE_FOLDER_ID is missing', async () => {
    delete process.env.STAGING_DRIVE_FOLDER_ID;
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    await expect(
      createWOFolderStructure('WO-26-8481', 'Test Customer', 'Maui'),
    ).rejects.toBeInstanceOf(StagingDriveFolderConfigError);

    // No Drive writes may occur on a fail-closed staging guard.
    expect(m.create).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
  });

  it('fails closed when STAGING_DRIVE_FOLDER_ID is blank/whitespace', async () => {
    process.env.STAGING_DRIVE_FOLDER_ID = '   ';
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    await expect(
      createWOFolderStructure('WO-26-8482', 'C', 'Maui'),
    ).rejects.toMatchObject({
      name: 'StagingDriveFolderConfigError',
      message: expect.stringContaining(STAGING_DRIVE_FOLDER_ID_ENV),
    });
    expect(m.create).not.toHaveBeenCalled();
  });

  it('fails closed when STAGING_DRIVE_FOLDER_ID is not a valid Drive id', async () => {
    process.env.STAGING_DRIVE_FOLDER_ID = 'not-a-drive-id';
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    await expect(
      createWOFolderStructure('WO-26-8483', 'C', 'Maui'),
    ).rejects.toBeInstanceOf(StagingDriveFolderConfigError);
    expect(m.create).not.toHaveBeenCalled();
  });

  it('staging never falls back to BANYAN_DRIVE_ID, Service, island, or Maui as parents', async () => {
    process.env.STAGING_DRIVE_FOLDER_ID = STAGING_FOLDER_ID;
    const m = buildDriveMocks();
    mockGoogleDrive.mockReturnValue(m.drive);

    await createWOFolderStructure('WO-26-8484', 'Customer', 'Maui');

    for (const call of m.create.mock.calls) {
      const parents: string[] = call[0].requestBody.parents || [];
      // No created folder may be parented at the Banyan shared-drive root in
      // staging — that would be the production fallback we are blocking.
      expect(parents).not.toContain(BANYAN_DRIVE_ID);
    }
  });
});

describe('resolveStagingWOParentId', () => {
  let prevStagingId: string | undefined;

  beforeEach(() => {
    prevStagingId = process.env.STAGING_DRIVE_FOLDER_ID;
  });

  afterEach(() => {
    if (prevStagingId === undefined) delete process.env.STAGING_DRIVE_FOLDER_ID;
    else process.env.STAGING_DRIVE_FOLDER_ID = prevStagingId;
  });

  it('returns the env value when set to a plausible Drive id', () => {
    process.env.STAGING_DRIVE_FOLDER_ID = '142jODngww2a4PoNDrf-rjN5O_y40I3ti';
    expect(resolveStagingWOParentId()).toBe('142jODngww2a4PoNDrf-rjN5O_y40I3ti');
  });

  it('throws StagingDriveFolderConfigError when env var is unset', () => {
    delete process.env.STAGING_DRIVE_FOLDER_ID;
    expect(() => resolveStagingWOParentId()).toThrow(StagingDriveFolderConfigError);
  });

  it('throws when env value is not a plausible Drive folder id', () => {
    process.env.STAGING_DRIVE_FOLDER_ID = 'short';
    expect(() => resolveStagingWOParentId()).toThrow(/not a valid Drive folder id/);
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
