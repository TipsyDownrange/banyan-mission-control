import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { checkPermission } from '@/lib/permissions';
import { getBackendSheetId } from '@/lib/backend-config';
import { hawaiiNow } from '@/lib/hawaii-time';
import {
  BANYAN_DRIVE_ID,
  STANDARD_SUBFOLDERS,
  classifyWOFolder,
  createWOFolderStructure,
  ensureKaiShadowTree,
  ensureStandardSubfolders,
  extractFolderIdFromUrl,
  getWODriveClient,
  type WOFolderClassification,
} from '@/lib/drive-wo-folder';

const BACKEND_SHEET_ID = getBackendSheetId();
const TAB = 'Service_Work_Orders';

const COL = {
  wo_id:        0,
  wo_number:    1,
  island:       5,
  customer_name: 12,
  folder_url:   23, // column X
  updated_at:   27, // column AB
};

type RepairAction =
  | 'noop'
  | 'create_canonical_folder'
  | 'ensure_subfolders'
  | 'manual_review_required';

type RepairPlan = {
  action: RepairAction;
  reason: string;
  willCreateNewFolder: boolean;
  willUpdateSheetFolderUrl: boolean;
  willTouchExistingFolder: 'never' | 'subfolders_only';
};

function planFor(classification: WOFolderClassification): RepairPlan {
  switch (classification.kind) {
    case 'shared_drive_canonical':
      return {
        action: 'noop',
        reason: 'Folder is in the Banyan shared drive and has all required subfolders.',
        willCreateNewFolder: false,
        willUpdateSheetFolderUrl: false,
        willTouchExistingFolder: 'never',
      };
    case 'shared_drive_missing_subfolders':
      return {
        action: 'ensure_subfolders',
        reason: `Folder is in the shared drive but missing: ${classification.missingSubfolders.join(', ')}`,
        willCreateNewFolder: false,
        willUpdateSheetFolderUrl: false,
        willTouchExistingFolder: 'subfolders_only',
      };
    case 'my_drive':
      return {
        action: 'create_canonical_folder',
        reason: 'Folder is not in the Banyan shared drive (My Drive or other shared drive). Will create a fresh canonical folder and repoint Service_Work_Orders.folder_url. Existing folder will NOT be moved or deleted.',
        willCreateNewFolder: true,
        willUpdateSheetFolderUrl: true,
        willTouchExistingFolder: 'never',
      };
    case 'empty':
      return {
        action: 'create_canonical_folder',
        reason: 'Service_Work_Orders.folder_url is empty. Will create canonical shared-drive folder and write the URL.',
        willCreateNewFolder: true,
        willUpdateSheetFolderUrl: true,
        willTouchExistingFolder: 'never',
      };
    case 'unparseable':
      return {
        action: 'create_canonical_folder',
        reason: 'Stored folder_url is not a parseable Drive folder URL. Will create canonical shared-drive folder and write the URL.',
        willCreateNewFolder: true,
        willUpdateSheetFolderUrl: true,
        willTouchExistingFolder: 'never',
      };
    case 'trashed':
      return {
        action: 'manual_review_required',
        reason: 'Stored folder is trashed. Operator must restore or explicitly approve creating a new canonical folder.',
        willCreateNewFolder: false,
        willUpdateSheetFolderUrl: false,
        willTouchExistingFolder: 'never',
      };
    case 'inaccessible':
      return {
        action: 'manual_review_required',
        reason: `Drive returned an error reading the stored folder: ${classification.reason}`,
        willCreateNewFolder: false,
        willUpdateSheetFolderUrl: false,
        willTouchExistingFolder: 'never',
      };
  }
}

type WORow = {
  rowNumber: number;
  woId: string;
  woNumber: string;
  customerName: string;
  island: string;
  folderUrl: string;
};

async function findWORow(
  sheets: ReturnType<typeof google.sheets>,
  identifier: { woId?: string; woNumber?: string },
): Promise<WORow | null> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: BACKEND_SHEET_ID,
    range: `${TAB}!A2:AB5000`,
  });
  const rows = (res.data.values || []) as string[][];
  const targetWoId = (identifier.woId || '').trim();
  const targetWoNumber = (identifier.woNumber || '').trim();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const woId = (r[COL.wo_id] || '').trim();
    const woNumber = (r[COL.wo_number] || '').trim();
    const matches =
      (targetWoId && woId === targetWoId) ||
      (targetWoNumber && (woNumber === targetWoNumber || woId === targetWoNumber || woId === `WO-${targetWoNumber}`));
    if (matches) {
      return {
        rowNumber: i + 2,
        woId,
        woNumber,
        customerName: (r[COL.customer_name] || '').trim(),
        island: (r[COL.island] || '').trim(),
        folderUrl: (r[COL.folder_url] || '').trim(),
      };
    }
  }
  return null;
}

/**
 * POST /api/admin/wo-folder-repair
 *
 * Body:
 *   { woId?: string, woNumber?: string, dryRun?: boolean (default true), confirm?: boolean (default false) }
 *
 * Returns a classification + repair plan. With dryRun=true (default), no
 * Drive or Sheet writes happen. Mutation requires BOTH dryRun=false AND
 * confirm=true. Old folders are never moved or deleted.
 */
export async function POST(req: Request) {
  const { allowed } = await checkPermission(req, 'admin:backfill');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Forbidden: admin:backfill required' },
      { status: 403 },
    );
  }

  let body: { woId?: string; woNumber?: string; dryRun?: boolean; confirm?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.woId && !body.woNumber) {
    return NextResponse.json({ error: 'woId or woNumber required' }, { status: 400 });
  }

  // Default to dry-run. Mutation requires both dryRun=false AND confirm=true.
  const dryRun = body.dryRun !== false;
  const confirm = body.confirm === true;
  const willMutate = !dryRun && confirm;

  try {
    const sheetsAuth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });
    const drive = getWODriveClient();

    const wo = await findWORow(sheets, { woId: body.woId, woNumber: body.woNumber });
    if (!wo) {
      return NextResponse.json(
        { error: `WO not found: ${body.woId || body.woNumber}` },
        { status: 404 },
      );
    }

    const classification = await classifyWOFolder(drive, wo.folderUrl);
    const plan = planFor(classification);

    const response = {
      ok: true,
      dryRun,
      confirm,
      mutated: false as boolean,
      wo: {
        woId: wo.woId,
        woNumber: wo.woNumber,
        rowNumber: wo.rowNumber,
        customerName: wo.customerName,
        island: wo.island,
        folderUrl: wo.folderUrl,
      },
      classification,
      plan,
      sharedDriveId: BANYAN_DRIVE_ID,
      requiredSubfolders: STANDARD_SUBFOLDERS,
      mutation: null as null | {
        action: RepairAction;
        newFolderUrl?: string;
        oldFolderUrl: string;
        oldFolderId: string | null;
        ensuredSubfolders?: string[];
        sheetUpdated: boolean;
      },
    };

    if (!willMutate) {
      // Dry-run: classification + plan only.
      return NextResponse.json(response);
    }

    if (plan.action === 'noop' || plan.action === 'manual_review_required') {
      return NextResponse.json({
        ...response,
        mutated: false,
        mutation: {
          action: plan.action,
          oldFolderUrl: wo.folderUrl,
          oldFolderId: extractFolderIdFromUrl(wo.folderUrl),
          sheetUpdated: false,
        },
      });
    }

    if (plan.action === 'ensure_subfolders') {
      // shared_drive_missing_subfolders — folder ID guaranteed by classifier.
      const folderId = (classification as Extract<WOFolderClassification, { kind: 'shared_drive_missing_subfolders' }>).folderId;
      const created = await ensureStandardSubfolders(drive, folderId);
      await ensureKaiShadowTree(drive, folderId);
      return NextResponse.json({
        ...response,
        mutated: true,
        mutation: {
          action: 'ensure_subfolders',
          oldFolderUrl: wo.folderUrl,
          oldFolderId: folderId,
          ensuredSubfolders: created,
          sheetUpdated: false,
        },
      });
    }

    if (plan.action === 'create_canonical_folder') {
      const oldFolderId = extractFolderIdFromUrl(wo.folderUrl);
      const customerName = wo.customerName || '';
      const island = wo.island || '';
      const newFolderUrl = await createWOFolderStructure(wo.woId, customerName, island, drive);

      await sheets.spreadsheets.values.update({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${TAB}!X${wo.rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[newFolderUrl]] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${TAB}!AB${wo.rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[hawaiiNow()]] },
      });

      return NextResponse.json({
        ...response,
        mutated: true,
        mutation: {
          action: 'create_canonical_folder',
          newFolderUrl,
          oldFolderUrl: wo.folderUrl,
          oldFolderId,
          sheetUpdated: true,
        },
      });
    }

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[wo-folder-repair] failed:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
