/**
 * POST /api/procurement/upload
 * Upload a vendor quote document (PDF/image) to BanyanOS Drive
 * and update the procurement record with the Drive URL + filename.
 *
 * Body: multipart/form-data with:
 *   - file: the document
 *   - procurement_id: which procurement order to link it to
 *   - wo_id: used to put the file in the right WO subfolder if it exists
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const BANYAN_DRIVE = '0AKSVpf3AnH7CUk9PVA'; // BanyanOS Drive root

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const procurement_id = formData.get('procurement_id') as string || '';
    const wo_id = formData.get('wo_id') as string || '';

    if (!file || !procurement_id) {
      return NextResponse.json({ error: 'file and procurement_id required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']);
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // Find or create a Vendor_Quotes subfolder in BanyanOS Drive
    const folderSearch = await drive.files.list({
      q: `name='Vendor_Quotes' and '${BANYAN_DRIVE}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      supportsAllDrives: true, includeItemsFromAllDrives: true, fields: 'files(id)',
    });
    let folderId: string;
    if (folderSearch.data.files?.length) {
      folderId = folderSearch.data.files[0].id!;
    } else {
      const f = await drive.files.create({
        supportsAllDrives: true,
        requestBody: { name: 'Vendor_Quotes', mimeType: 'application/vnd.google-apps.folder', parents: [BANYAN_DRIVE] },
        fields: 'id',
      });
      folderId = f.data.id!;
    }

    // Upload the file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = `${wo_id ? wo_id + '_' : ''}${procurement_id}_${file.name}`;

    const { Readable } = await import('stream');
    const uploaded = await drive.files.create({
      supportsAllDrives: true,
      requestBody: { name: fileName, parents: [folderId], mimeType: file.type || 'application/octet-stream' },
      media: { mimeType: file.type || 'application/octet-stream', body: Readable.from(buffer) },
      fields: 'id,webViewLink,name',
    });

    // Make it readable by anyone with the link
    await drive.permissions.create({
      fileId: uploaded.data.id!,
      supportsAllDrives: true,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const fileUrl = uploaded.data.webViewLink || `https://drive.google.com/file/d/${uploaded.data.id}/view`;
    const displayName = file.name;

    // Update the procurement record(s) with the document URL
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Procurement!A2:AA5000' });
    const rows = (res.data.values || []) as string[][];
    // Columns: Z=25=quote_document_url, AA=26=quote_document_name
    const DOC_URL_COL = 'Z';
    const DOC_NAME_COL = 'AA';
    const updates: { range: string; values: string[][] }[] = [];

    rows.forEach((row, idx) => {
      if (row[0] === procurement_id) {
        const sheetRow = idx + 2;
        updates.push({ range: `Procurement!${DOC_URL_COL}${sheetRow}`, values: [[fileUrl]] });
        updates.push({ range: `Procurement!${DOC_NAME_COL}${sheetRow}`, values: [[displayName]] });
      }
    });

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: updates },
      });
    }

    return NextResponse.json({
      success: true,
      file_url: fileUrl,
      file_name: displayName,
      drive_id: uploaded.data.id,
      rows_updated: updates.length / 2,
    });
  } catch (err) {
    console.error('[/api/procurement/upload]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
