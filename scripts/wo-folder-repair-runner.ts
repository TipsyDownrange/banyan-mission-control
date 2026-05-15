import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { hawaiiNow } from '@/lib/hawaii-time';
import {
  getWODriveClient,
  ensureStandardSubfolders,
  createWOFolderStructure,
  type WOFolderClassification,
  type DriveClient,
} from '@/lib/drive-wo-folder';

export type RepairAction =
  | 'noop'
  | 'ensure_subfolders'
  | 'create_canonical_folder'
  | 'manual_review_required';

export type RowInput = {
  rowNumber: number;
  woId: string;
  woNumber: string;
  name: string;
  island: string;
  customerName: string;
  folderUrl: string;
  classification: WOFolderClassification;
};

export type RowReceipt = {
  rowNumber: number;
  woId: string;
  sheet: string;
  action: RepairAction;
  status: 'ok' | 'error' | 'skipped' | 'dry_run';
  dryRun: boolean;
  newFolderUrl?: string;
  createdSubfolders?: string[];
  oldFolderUrl?: string;
  sheetUpdated?: boolean;
  error?: string;
  timestamp: string;
};

export type RunnerArgs = {
  inputPath: string;
  sheet: 'staging' | 'production';
  bucket?: string;
  limit?: number;
  resumeStatePath?: string;
  receiptsPath: string;
  dryRun: boolean;
  allowProduction: boolean;
  execute: boolean;
  confirm?: string;
};

type SheetsClient = ReturnType<typeof google.sheets>;

export type RepairRowOptions = {
  sheets?: SheetsClient | null;
  spreadsheetId?: string;
};

export const EXECUTE_CONFIRM_VALUE = 'REPAIR_WO_FOLDERS';

export function repairActionFor(kind: WOFolderClassification['kind']): RepairAction {
  switch (kind) {
    case 'shared_drive_canonical': return 'noop';
    case 'shared_drive_missing_subfolders': return 'ensure_subfolders';
    case 'empty':
    case 'unparseable':
    case 'my_drive': return 'create_canonical_folder';
    case 'trashed':
    case 'inaccessible': return 'manual_review_required';
  }
}

export function parseArgs(argv: string[]): RunnerArgs {
  const args = argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const get = (name: string) =>
    args.find(a => a.startsWith(name + '='))?.slice(name.length + 1);

  const inputPath = get('--input') ?? '';
  const rawSheet = get('--sheet') ?? 'staging';
  const sheet: 'staging' | 'production' =
    rawSheet === 'production' ? 'production' : 'staging';
  const bucket = get('--bucket');
  const limitStr = get('--limit');
  const resumeStatePath = get('--resume-state');
  const receiptsPath =
    get('--receipts') ??
    path.join(process.cwd(), 'wo-folder-repair-receipts.jsonl');
  const execute = flag('--execute');
  const allowProduction = flag('--allow-production');
  const confirm = get('--confirm');
  const dryRun = !execute;

  return {
    inputPath,
    sheet,
    bucket,
    limit: limitStr !== undefined ? parseInt(limitStr, 10) : undefined,
    resumeStatePath,
    receiptsPath,
    dryRun,
    allowProduction,
    execute,
    confirm,
  };
}

export function validateArgs(args: RunnerArgs): void {
  if (!args.inputPath) throw new Error('--input=<path> is required');

  if (!args.dryRun && args.sheet === 'production' && !args.allowProduction) {
    throw new Error(
      'Production live execution is refused. ' +
      'Pass --allow-production in addition to --execute and ' +
      '--confirm=REPAIR_WO_FOLDERS to authorize production Drive/Sheet writes.',
    );
  }

  if (!args.dryRun && args.confirm !== EXECUTE_CONFIRM_VALUE) {
    throw new Error(
      `--execute requires --confirm=${EXECUTE_CONFIRM_VALUE}. ` +
      `Got: ${args.confirm ?? '(not set)'}`,
    );
  }
}

export function loadResumeState(receiptsPath: string): Set<string> {
  const done = new Set<string>();
  if (!fs.existsSync(receiptsPath)) return done;
  const lines = fs.readFileSync(receiptsPath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const r = JSON.parse(line) as RowReceipt;
      if (r.status === 'ok' || r.status === 'dry_run') {
        done.add(`${r.sheet}:${r.rowNumber}`);
      }
    } catch { /* skip malformed lines */ }
  }
  return done;
}

export function collectRows(
  report: Record<string, unknown>,
  sheet: 'staging' | 'production',
  bucket?: string,
): RowInput[] {
  const sheets = report?.sheets as Record<string, any> | undefined;
  const sheetData = sheets?.[sheet];
  if (!sheetData) throw new Error(`Sheet "${sheet}" not found in classification report`);
  const fullRows = sheetData.fullRows as Record<string, RowInput[]> | undefined;
  if (!fullRows) {
    throw new Error(
      `fullRows missing for sheet "${sheet}". ` +
      'Regenerate classification with --full flag.',
    );
  }
  const buckets = bucket ? [bucket] : Object.keys(fullRows);
  const rows: RowInput[] = [];
  for (const b of buckets) {
    rows.push(...(fullRows[b] ?? []));
  }
  return rows;
}

export function getSpreadsheetId(
  report: Record<string, unknown>,
  sheet: 'staging' | 'production',
): string {
  const sheets = report?.sheets as Record<string, any> | undefined;
  const spreadsheetId = sheets?.[sheet]?.spreadsheetId;
  if (!spreadsheetId) throw new Error(`spreadsheetId missing for sheet "${sheet}"`);
  return String(spreadsheetId);
}

export async function repairRow(
  drive: DriveClient | null,
  row: RowInput,
  sheet: string,
  dryRun: boolean,
  options: RepairRowOptions = {},
): Promise<RowReceipt> {
  const action = repairActionFor(row.classification.kind);
  const base = {
    rowNumber: row.rowNumber,
    woId: row.woId,
    sheet,
    action,
    dryRun,
    timestamp: new Date().toISOString(),
  };

  if (action === 'noop' || action === 'manual_review_required') {
    return { ...base, status: 'skipped' };
  }

  if (dryRun) {
    return { ...base, status: 'dry_run' };
  }

  if (!drive) throw new Error('drive client required for live execution');

  try {
    if (action === 'ensure_subfolders') {
      const { folderId } = row.classification as Extract<
        WOFolderClassification,
        { kind: 'shared_drive_missing_subfolders' }
      >;
      const created = await ensureStandardSubfolders(drive, folderId);
      return { ...base, status: 'ok', createdSubfolders: created, sheetUpdated: false };
    }

    if (action === 'create_canonical_folder') {
      if (!options.sheets || !options.spreadsheetId) {
        throw new Error(
          'Sheets client and spreadsheetId are required before creating a canonical folder. ' +
          'Refusing to create a folder that cannot be written back to Service_Work_Orders.folder_url.',
        );
      }
      // Never moves or deletes the old folder — only creates a fresh canonical
      // folder under the correct parent tree, then writes the new URL back to
      // Service_Work_Orders.folder_url. The old folder remains untouched.
      const newFolderUrl = await createWOFolderStructure(
        row.woId,
        row.customerName,
        row.island,
      );
      await options.sheets.spreadsheets.values.update({
        spreadsheetId: options.spreadsheetId,
        range: `Service_Work_Orders!X${row.rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[newFolderUrl]] },
      });
      await options.sheets.spreadsheets.values.update({
        spreadsheetId: options.spreadsheetId,
        range: `Service_Work_Orders!AB${row.rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[hawaiiNow()]] },
      });
      return {
        ...base,
        status: 'ok',
        newFolderUrl,
        oldFolderUrl: row.folderUrl,
        sheetUpdated: true,
      };
    }

    return { ...base, status: 'skipped' };
  } catch (err) {
    return {
      ...base,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const args = parseArgs(process.argv);

  try {
    validateArgs(args);
  } catch (e) {
    console.error(`[wo-folder-repair-runner] ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(args.inputPath, 'utf8'));
  const spreadsheetId = getSpreadsheetId(report, args.sheet);
  let rows: RowInput[];
  try {
    rows = collectRows(report, args.sheet, args.bucket);
  } catch (e) {
    console.error(`[wo-folder-repair-runner] ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  const resumePath = args.resumeStatePath ?? args.receiptsPath;
  const alreadyDone = loadResumeState(resumePath);
  const pending = rows.filter(r => !alreadyDone.has(`${args.sheet}:${r.rowNumber}`));
  const batch = args.limit !== undefined ? pending.slice(0, args.limit) : pending;

  const drive = args.dryRun ? null : getWODriveClient();
  const sheets = args.dryRun
    ? null
    : google.sheets({
        version: 'v4',
        auth: getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']),
      });

  const receiptsHandle = fs.openSync(args.receiptsPath, 'a');
  let okCount = 0, errorCount = 0, skippedCount = 0;

  try {
    for (const row of batch) {
      const receipt = await repairRow(drive, row, args.sheet, args.dryRun, {
        sheets,
        spreadsheetId,
      });
      fs.writeSync(receiptsHandle, JSON.stringify(receipt) + '\n');
      if (receipt.status === 'ok' || receipt.status === 'dry_run') okCount++;
      else if (receipt.status === 'error') errorCount++;
      else skippedCount++;
    }
  } finally {
    fs.closeSync(receiptsHandle);
  }

  console.log(
    JSON.stringify(
      {
        sheet: args.sheet,
        dryRun: args.dryRun,
        totalEligible: rows.length,
        alreadyDone: alreadyDone.size,
        pending: pending.length,
        batchSize: batch.length,
        ok: okCount,
        errors: errorCount,
        skipped: skippedCount,
        receiptsPath: args.receiptsPath,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
