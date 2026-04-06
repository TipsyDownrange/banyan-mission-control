import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

const FIELD_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// Invalidate the in-process cache after a manual link save
// (service/route.ts uses module-level folderLinkCache — we can't directly clear it,
//  but the cache TTL is 10 min so it will refresh soon. The client gets the URL
//  immediately via optimistic update.)

export async function POST(req: Request) {
  try {
    const { woName, folderUrl } = await req.json();
    if (!woName || !folderUrl) {
      return NextResponse.json({ error: 'woName and folderUrl required' }, { status: 400 });
    }

    // Extract folder ID from Google Drive URL (25+ char ID segment)
    const match = folderUrl.match(/[-\w]{25,}/);
    const folderId = match ? match[0] : '';

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

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

    const normalizedName = woName.toLowerCase().trim();
    const existingRowIdx = rows.slice(1).findIndex((r: string[]) =>
      (r[nameIdx] || '').toLowerCase().trim() === normalizedName && r[srcIdx] === 'manual'
    );

    if (existingRowIdx >= 0) {
      // Update existing manual link (row is 1-indexed, +1 for header row)
      const rowNum = existingRowIdx + 2;
      const updateRow: string[] = [];
      if (nameIdx >= 0) updateRow[nameIdx] = woName;
      if (idIdx   >= 0) updateRow[idIdx]   = folderId;
      if (urlIdx  >= 0) updateRow[urlIdx]  = folderUrl;
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
      if (nameIdx >= 0) newRow[nameIdx] = woName;
      if (idIdx   >= 0) newRow[idIdx]   = folderId;
      if (urlIdx  >= 0) newRow[urlIdx]  = folderUrl;
      if (srcIdx  >= 0) newRow[srcIdx]  = 'manual';

      await sheets.spreadsheets.values.append({
        spreadsheetId: FIELD_SHEET_ID,
        range: 'WO_Folder_Links!A:D',
        valueInputOption: 'RAW',
        requestBody: { values: [newRow] },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
