import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { getBackendSheetId } from '@/lib/backend-config';
import { checkPermission } from '@/lib/permissions';
import { hawaiiNow } from '@/lib/hawaii-time';
import { invalidateCache } from '@/app/api/service/route';
import {
  getWODriveClient,
  InvalidWOFolderUrlError,
  validateWOFolderUrlForWrite,
} from '@/lib/drive-wo-folder';

const FIELD_SHEET_ID = getBackendSheetId();

export async function POST(req: Request) {
  const { allowed } = await checkPermission(req, 'wo:edit');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: wo:edit required' }, { status: 403 });

  try {
    const { woId, woName, folderUrl } = await req.json();
    if ((!woId && !woName) || !folderUrl) {
      return NextResponse.json({ error: 'woId or woName, and folderUrl required' }, { status: 400 });
    }

    let validFolder;
    try {
      validFolder = await validateWOFolderUrlForWrite(getWODriveClient(), folderUrl);
    } catch (err) {
      if (err instanceof InvalidWOFolderUrlError) {
        return NextResponse.json(
          { error: err.message, classification: err.classification },
          { status: 400 },
        );
      }
      throw err;
    }

    const canonicalFolderUrl = validFolder.folderUrl;

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const serviceRowsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: FIELD_SHEET_ID,
      range: 'Service_Work_Orders!A2:AB5000',
    });
    const serviceRows = (serviceRowsRes.data.values || []) as string[][];
    const normalizedWoId = String(woId || '').trim();
    const normalizedWoName = String(woName || '').toLowerCase().trim();
    const serviceRowIdx = serviceRows.findIndex(row => {
      const rowWoId = String(row[0] || '').trim();
      const rowWoNumber = String(row[1] || '').trim();
      const rowName = String(row[2] || '').toLowerCase().trim();
      if (normalizedWoId) {
        return rowWoId === normalizedWoId ||
          rowWoNumber === normalizedWoId ||
          rowWoId === `WO-${normalizedWoId}`;
      }
      return rowName === normalizedWoName;
    });

    if (serviceRowIdx < 0) {
      return NextResponse.json({ error: `Work order not found: ${woId || woName}` }, { status: 404 });
    }

    const serviceRow = serviceRows[serviceRowIdx] || [];
    const serviceRowNumber = serviceRowIdx + 2;
    const displayName = String(woName || serviceRow[2] || serviceRow[0] || normalizedWoId).trim();

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: FIELD_SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `Service_Work_Orders!X${serviceRowNumber}`, values: [[canonicalFolderUrl]] },
          { range: `Service_Work_Orders!AB${serviceRowNumber}`, values: [[hawaiiNow()]] },
        ],
      },
    });

    // Read existing rows to avoid duplicates
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: FIELD_SHEET_ID,
      range: 'WO_Folder_Links!A:D',
    });
    const rows = existing.data.values || [];
    const headers = rows[0] || ['folder_name', 'folder_id', 'folder_url', 'source'];
    const nameIdx = headers.findIndex((h: string) => h === 'folder_name');
    const idIdx   = headers.findIndex((h: string) => h === 'folder_id');
    const urlIdx  = headers.findIndex((h: string) => h === 'folder_url');
    const srcIdx  = headers.findIndex((h: string) => h === 'source');

    const normalizedName = displayName.toLowerCase().trim();
    const existingRowIdx = rows.slice(1).findIndex((r: string[]) =>
      (r[nameIdx] || '').toLowerCase().trim() === normalizedName && r[srcIdx] === 'manual'
    );

    if (existingRowIdx >= 0) {
      // Update existing manual link (row is 1-indexed, +1 for header row)
      const rowNum = existingRowIdx + 2;
      const updateRow: string[] = new Array(headers.length || 4).fill('');
      if (nameIdx >= 0) updateRow[nameIdx] = displayName;
      if (idIdx   >= 0) updateRow[idIdx]   = validFolder.folderId;
      if (urlIdx  >= 0) updateRow[urlIdx]  = canonicalFolderUrl;
      if (srcIdx  >= 0) updateRow[srcIdx]  = 'manual';

      await sheets.spreadsheets.values.update({
        spreadsheetId: FIELD_SHEET_ID,
        range: `WO_Folder_Links!A${rowNum}:D${rowNum}`,
        valueInputOption: 'RAW',
        requestBody: { values: [updateRow] },
      });
    } else {
      // Append new row: [folder_name, folder_id, folder_url, source]
      const newRow = ['', '', '', ''];
      if (nameIdx >= 0) newRow[nameIdx] = displayName;
      if (idIdx   >= 0) newRow[idIdx]   = validFolder.folderId;
      if (urlIdx  >= 0) newRow[urlIdx]  = canonicalFolderUrl;
      if (srcIdx  >= 0) newRow[srcIdx]  = 'manual';

      await sheets.spreadsheets.values.append({
        spreadsheetId: FIELD_SHEET_ID,
        range: 'WO_Folder_Links!A:D',
        valueInputOption: 'RAW',
        requestBody: { values: [newRow] },
      });
    }

    invalidateCache();

    return NextResponse.json({
      ok: true,
      folderId: validFolder.folderId,
      folderUrl: canonicalFolderUrl,
      serviceWorkOrderRow: serviceRowNumber,
      classification: validFolder.classification,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
