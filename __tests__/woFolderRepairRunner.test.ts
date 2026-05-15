import fs from 'fs';
import path from 'path';
import os from 'os';

const mockEnsureStandardSubfolders = jest.fn();
const mockCreateWOFolderStructure = jest.fn();
const mockGetWODriveClient = jest.fn();

jest.mock('@/lib/drive-wo-folder', () => ({
  ...jest.requireActual('@/lib/drive-wo-folder'),
  ensureStandardSubfolders: mockEnsureStandardSubfolders,
  createWOFolderStructure: mockCreateWOFolderStructure,
  getWODriveClient: mockGetWODriveClient,
}));

import {
  EXECUTE_CONFIRM_VALUE,
  collectRows,
  loadResumeState,
  parseArgs,
  getSpreadsheetId,
  repairActionFor,
  repairRow,
  validateArgs,
  type RowInput,
} from '@/scripts/wo-folder-repair-runner';

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Static safety checks
// ---------------------------------------------------------------------------

describe('script source safety', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'scripts/wo-folder-repair-runner.ts'),
    'utf8',
  );

  it('default sheet is staging, not production', () => {
    // The default in parseArgs must favour staging
    expect(src).toMatch(/rawSheet === 'production' \? 'production' : 'staging'/);
    expect(src).toMatch(/'staging'/); // fallback value present
    expect(src).not.toMatch(/sheet\s*=\s*'production'/); // no hardcoded production default
  });

  it('does not skip the confirmation gate', () => {
    expect(src).toContain('REPAIR_WO_FOLDERS');
    expect(src).toContain('allowProduction');
  });

  it('never deletes or moves Drive folders', () => {
    expect(src).not.toMatch(/files\.delete/);
    // files.update with addParents/removeParents is the Drive move API
    expect(src).not.toMatch(/addParents/);
    expect(src).not.toMatch(/removeParents/);
  });

  it('uses targeted Sheets updates only after folder creation', () => {
    expect(src).toContain('values.update');
    expect(src).toContain('Service_Work_Orders!X${row.rowNumber}');
    expect(src).toContain('Service_Work_Orders!AB${row.rowNumber}');
    expect(src).not.toContain('values.append');
    expect(src).not.toContain('values.batchUpdate');
  });
});

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  const bin = ['node', 'script.ts'];

  it('defaults to dry-run, staging sheet', () => {
    const args = parseArgs([...bin, '--input=report.json']);
    expect(args.dryRun).toBe(true);
    expect(args.execute).toBe(false);
    expect(args.sheet).toBe('staging');
  });

  it('parses --sheet=production', () => {
    const args = parseArgs([...bin, '--input=r.json', '--sheet=production']);
    expect(args.sheet).toBe('production');
  });

  it('unknown sheet value falls back to staging', () => {
    const args = parseArgs([...bin, '--input=r.json', '--sheet=unknown']);
    expect(args.sheet).toBe('staging');
  });

  it('parses --execute, --confirm, --allow-production', () => {
    const args = parseArgs([
      ...bin,
      '--input=r.json',
      '--execute',
      '--confirm=REPAIR_WO_FOLDERS',
      '--allow-production',
    ]);
    expect(args.execute).toBe(true);
    expect(args.dryRun).toBe(false);
    expect(args.confirm).toBe('REPAIR_WO_FOLDERS');
    expect(args.allowProduction).toBe(true);
  });

  it('parses --limit and --bucket', () => {
    const args = parseArgs([...bin, '--input=r.json', '--limit=10', '--bucket=empty']);
    expect(args.limit).toBe(10);
    expect(args.bucket).toBe('empty');
  });

  it('parses --resume-state and --receipts', () => {
    const args = parseArgs([
      ...bin,
      '--input=r.json',
      '--resume-state=/tmp/state.jsonl',
      '--receipts=/tmp/out.jsonl',
    ]);
    expect(args.resumeStatePath).toBe('/tmp/state.jsonl');
    expect(args.receiptsPath).toBe('/tmp/out.jsonl');
  });
});

// ---------------------------------------------------------------------------
// validateArgs — safety gates
// ---------------------------------------------------------------------------

describe('validateArgs', () => {
  const base = {
    inputPath: 'report.json',
    sheet: 'staging' as const,
    dryRun: true,
    execute: false,
    allowProduction: false,
    receiptsPath: 'out.jsonl',
  };

  it('passes for dry-run staging (no extra flags needed)', () => {
    expect(() => validateArgs(base)).not.toThrow();
  });

  it('passes for dry-run production (no writes, no allowProduction needed)', () => {
    expect(() => validateArgs({ ...base, sheet: 'production' })).not.toThrow();
  });

  it('throws when --input is missing', () => {
    expect(() => validateArgs({ ...base, inputPath: '' })).toThrow(/--input/);
  });

  it('throws when --execute without --confirm', () => {
    expect(() =>
      validateArgs({ ...base, dryRun: false, execute: true, confirm: undefined }),
    ).toThrow(/REPAIR_WO_FOLDERS/);
  });

  it('throws when --execute with wrong --confirm value', () => {
    expect(() =>
      validateArgs({ ...base, dryRun: false, execute: true, confirm: 'YES' }),
    ).toThrow(/REPAIR_WO_FOLDERS/);
  });

  it('throws on production live execution without --allow-production', () => {
    expect(() =>
      validateArgs({
        ...base,
        sheet: 'production',
        dryRun: false,
        execute: true,
        confirm: EXECUTE_CONFIRM_VALUE,
        allowProduction: false,
      }),
    ).toThrow(/allow-production/);
  });

  it('passes production live execution when both confirm and allow-production are set', () => {
    expect(() =>
      validateArgs({
        ...base,
        sheet: 'production',
        dryRun: false,
        execute: true,
        confirm: EXECUTE_CONFIRM_VALUE,
        allowProduction: true,
      }),
    ).not.toThrow();
  });

  it('confirm value is case-sensitive', () => {
    expect(() =>
      validateArgs({
        ...base,
        dryRun: false,
        execute: true,
        confirm: 'repair_wo_folders', // lowercase
      }),
    ).toThrow(/REPAIR_WO_FOLDERS/);
  });
});

// ---------------------------------------------------------------------------
// repairActionFor
// ---------------------------------------------------------------------------

describe('repairActionFor', () => {
  it('maps shared_drive_canonical to noop', () => {
    expect(repairActionFor('shared_drive_canonical')).toBe('noop');
  });
  it('maps shared_drive_missing_subfolders to ensure_subfolders', () => {
    expect(repairActionFor('shared_drive_missing_subfolders')).toBe('ensure_subfolders');
  });
  it('maps empty to create_canonical_folder', () => {
    expect(repairActionFor('empty')).toBe('create_canonical_folder');
  });
  it('maps unparseable to create_canonical_folder', () => {
    expect(repairActionFor('unparseable')).toBe('create_canonical_folder');
  });
  it('maps my_drive to create_canonical_folder', () => {
    expect(repairActionFor('my_drive')).toBe('create_canonical_folder');
  });
  it('maps trashed to manual_review_required', () => {
    expect(repairActionFor('trashed')).toBe('manual_review_required');
  });
  it('maps inaccessible to manual_review_required', () => {
    expect(repairActionFor('inaccessible')).toBe('manual_review_required');
  });
});

// ---------------------------------------------------------------------------
// collectRows
// ---------------------------------------------------------------------------

const sampleRow = (n: number): RowInput => ({
  rowNumber: n,
  woId: `WO-26-${n}`,
  woNumber: String(n),
  name: 'Test WO',
  island: 'Maui',
  customerName: 'Acme',
  folderUrl: '',
  classification: { kind: 'empty', reason: 'no url' },
});

const makeReport = (extras?: Record<string, any>) => ({
  sheets: {
    staging: {
      spreadsheetId: 'staging-sheet-id',
      fullRows: {
        empty: [sampleRow(1), sampleRow(2)],
        shared_drive_missing_subfolders: [sampleRow(3)],
        shared_drive_canonical: [sampleRow(4)],
      },
      ...extras,
    },
  },
});

describe('getSpreadsheetId', () => {
  it('returns the report spreadsheet id for the selected sheet', () => {
    expect(getSpreadsheetId(makeReport(), 'staging')).toBe('staging-sheet-id');
  });

  it('throws when spreadsheetId is missing', () => {
    expect(() => getSpreadsheetId({ sheets: { staging: { fullRows: {} } } }, 'staging')).toThrow(/spreadsheetId/);
  });
});

// ---------------------------------------------------------------------------
// collectRows
// ---------------------------------------------------------------------------

describe('collectRows', () => {
  it('returns all buckets when no bucket filter', () => {
    const rows = collectRows(makeReport(), 'staging');
    expect(rows).toHaveLength(4);
  });

  it('filters to a single bucket', () => {
    const rows = collectRows(makeReport(), 'staging', 'empty');
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.classification.kind === 'empty')).toBe(true);
  });

  it('throws when sheet is missing', () => {
    expect(() => collectRows(makeReport(), 'production')).toThrow(/Sheet "production"/);
  });

  it('throws when fullRows is missing (non-full classification)', () => {
    const report = { sheets: { staging: { counts: {} } } };
    expect(() => collectRows(report, 'staging')).toThrow(/fullRows missing/);
  });

  it('returns empty array for unknown bucket without throwing', () => {
    const rows = collectRows(makeReport(), 'staging', 'nonexistent_bucket');
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// loadResumeState
// ---------------------------------------------------------------------------

describe('loadResumeState', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `resume-test-${Date.now()}.jsonl`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('returns empty set when file does not exist', () => {
    const s = loadResumeState('/tmp/does-not-exist-at-all.jsonl');
    expect(s.size).toBe(0);
  });

  it('marks ok and dry_run receipts as done', () => {
    const receipts = [
      JSON.stringify({ sheet: 'staging', rowNumber: 5, status: 'ok' }),
      JSON.stringify({ sheet: 'staging', rowNumber: 6, status: 'dry_run' }),
    ];
    fs.writeFileSync(tmpFile, receipts.join('\n') + '\n');
    const s = loadResumeState(tmpFile);
    expect(s.has('staging:5')).toBe(true);
    expect(s.has('staging:6')).toBe(true);
  });

  it('does not mark error receipts as done', () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ sheet: 'staging', rowNumber: 7, status: 'error' }) + '\n',
    );
    const s = loadResumeState(tmpFile);
    expect(s.has('staging:7')).toBe(false);
  });

  it('skips malformed lines without throwing', () => {
    fs.writeFileSync(tmpFile, 'not-json\n' + JSON.stringify({ sheet: 'staging', rowNumber: 8, status: 'ok' }) + '\n');
    expect(() => loadResumeState(tmpFile)).not.toThrow();
    expect(loadResumeState(tmpFile).has('staging:8')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// repairRow — dry-run (no Drive calls)
// ---------------------------------------------------------------------------

describe('repairRow — dry-run', () => {
  const makeDryRow = (kind: RowInput['classification']['kind']): RowInput => ({
    ...sampleRow(10),
    classification:
      kind === 'shared_drive_missing_subfolders'
        ? { kind, folderId: 'f1', folderUrl: 'https://...', driveId: '0ABC', missingSubfolders: ['Photos'] }
        : kind === 'empty'
        ? { kind, reason: 'no url' }
        : kind === 'shared_drive_canonical'
        ? { kind, folderId: 'f2', folderUrl: 'https://...', driveId: '0ABC' }
        : { kind: 'empty', reason: 'no url' },
  });

  it('returns dry_run for ensure_subfolders without calling Drive', async () => {
    const receipt = await repairRow(null, makeDryRow('shared_drive_missing_subfolders'), 'staging', true);
    expect(receipt.status).toBe('dry_run');
    expect(receipt.action).toBe('ensure_subfolders');
    expect(mockEnsureStandardSubfolders).not.toHaveBeenCalled();
  });

  it('returns dry_run for create_canonical_folder without calling Drive', async () => {
    const receipt = await repairRow(null, makeDryRow('empty'), 'staging', true);
    expect(receipt.status).toBe('dry_run');
    expect(receipt.action).toBe('create_canonical_folder');
    expect(mockCreateWOFolderStructure).not.toHaveBeenCalled();
  });

  it('returns skipped for noop (canonical)', async () => {
    const receipt = await repairRow(null, makeDryRow('shared_drive_canonical'), 'staging', true);
    expect(receipt.status).toBe('skipped');
    expect(receipt.action).toBe('noop');
  });

  it('returns skipped for manual_review_required buckets even in live mode', async () => {
    const row: RowInput = {
      ...sampleRow(11),
      classification: { kind: 'trashed', folderId: 'f3', folderUrl: 'https://...' },
    };
    const receipt = await repairRow(null, row, 'staging', false);
    expect(receipt.status).toBe('skipped');
    expect(receipt.action).toBe('manual_review_required');
    expect(mockEnsureStandardSubfolders).not.toHaveBeenCalled();
    expect(mockCreateWOFolderStructure).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// repairRow — live (mocked helpers)
// ---------------------------------------------------------------------------

describe('repairRow — live ensure_subfolders', () => {
  it('calls ensureStandardSubfolders with the folderId and returns ok', async () => {
    mockEnsureStandardSubfolders.mockResolvedValue(['Quotes', 'Measurements']);
    const row: RowInput = {
      ...sampleRow(20),
      classification: {
        kind: 'shared_drive_missing_subfolders',
        folderId: 'folder-id-abc',
        folderUrl: 'https://drive.google.com/drive/folders/folder-id-abc',
        driveId: '0AKSVpf3AnH7CUk9PVA',
        missingSubfolders: ['Quotes', 'Measurements'],
      },
    };
    const fakeDrive = {} as any;
    const receipt = await repairRow(fakeDrive, row, 'staging', false);
    expect(mockEnsureStandardSubfolders).toHaveBeenCalledWith(fakeDrive, 'folder-id-abc');
    expect(receipt.status).toBe('ok');
    expect(receipt.createdSubfolders).toEqual(['Quotes', 'Measurements']);
    expect(receipt.newFolderUrl).toBeUndefined();
  });

  it('records error when ensureStandardSubfolders rejects', async () => {
    mockEnsureStandardSubfolders.mockRejectedValue(new Error('drive error'));
    const row: RowInput = {
      ...sampleRow(21),
      classification: {
        kind: 'shared_drive_missing_subfolders',
        folderId: 'f-err',
        folderUrl: 'https://...',
        driveId: '0AKSVpf3AnH7CUk9PVA',
        missingSubfolders: ['Photos'],
      },
    };
    const receipt = await repairRow({} as any, row, 'staging', false);
    expect(receipt.status).toBe('error');
    expect(receipt.error).toContain('drive error');
  });
});

describe('repairRow — live create_canonical_folder', () => {
  function fakeSheets() {
    return {
      spreadsheets: {
        values: {
          update: jest.fn().mockResolvedValue({}),
        },
      },
    } as any;
  }

  it('creates a canonical folder, writes folder_url + updated_at, and never touches old folder', async () => {
    const newUrl = 'https://drive.google.com/drive/folders/new-folder-123';
    mockCreateWOFolderStructure.mockResolvedValue(newUrl);
    const sheets = fakeSheets();
    const row: RowInput = {
      ...sampleRow(30),
      woId: 'WO-26-0030',
      customerName: 'Acme Corp',
      island: 'Maui',
      folderUrl: 'https://drive.google.com/drive/folders/old-folder-xyz',
      classification: { kind: 'my_drive', folderId: 'old-folder-xyz', folderUrl: 'https://...', driveId: null },
    };
    const receipt = await repairRow({} as any, row, 'staging', false, {
      sheets,
      spreadsheetId: 'staging-sheet-id',
    });
    expect(mockCreateWOFolderStructure).toHaveBeenCalledWith('WO-26-0030', 'Acme Corp', 'Maui');
    expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith(expect.objectContaining({
      spreadsheetId: 'staging-sheet-id',
      range: 'Service_Work_Orders!X30',
      requestBody: { values: [[newUrl]] },
    }));
    expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith(expect.objectContaining({
      spreadsheetId: 'staging-sheet-id',
      range: 'Service_Work_Orders!AB30',
    }));
    expect(receipt.status).toBe('ok');
    expect(receipt.newFolderUrl).toBe(newUrl);
    expect(receipt.oldFolderUrl).toBe('https://drive.google.com/drive/folders/old-folder-xyz');
    expect(receipt.sheetUpdated).toBe(true);
    // Ensure no delete/move helpers were called
    expect(mockEnsureStandardSubfolders).not.toHaveBeenCalled();
  });

  it('refuses live create when Sheets writeback is not configured', async () => {
    const row: RowInput = {
      ...sampleRow(32),
      classification: { kind: 'empty', reason: 'no url' },
    };
    const receipt = await repairRow({} as any, row, 'staging', false);
    expect(receipt.status).toBe('error');
    expect(receipt.error).toMatch(/Sheets client and spreadsheetId/);
    expect(mockCreateWOFolderStructure).not.toHaveBeenCalled();
  });

  it('records error when createWOFolderStructure rejects', async () => {
    mockCreateWOFolderStructure.mockRejectedValue(new Error('creation failed'));
    const row: RowInput = {
      ...sampleRow(31),
      classification: { kind: 'empty', reason: 'no url' },
    };
    const receipt = await repairRow({} as any, row, 'staging', false, {
      sheets: fakeSheets(),
      spreadsheetId: 'staging-sheet-id',
    });
    expect(receipt.status).toBe('error');
    expect(receipt.error).toContain('creation failed');
  });
});

export {};
