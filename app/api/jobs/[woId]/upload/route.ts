/**
 * POST /api/jobs/[woId]/upload
 *
 * Upload a file to the per-WO Drive folder.
 * MIME routing: image/* → Photos subfolder; PDF/docs → Correspondence subfolder.
 *
 * Body: multipart/form-data
 *   file — the file to upload
 *
 * Response: { ok, file_id, file_name, destination_folder, drive_url, event_emitted }
 *        or { ok: false, error }
 */
import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { checkPermission } from '@/lib/permissions';
import { emitMCEvent } from '@/lib/events';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Service_Work_Orders';
const FOLDER_URL_COL = 23; // column X (0-based), matches COL_IDX.folder_url in update route

const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = ['image/'];
const ALLOWED_MIME_EXACT = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
]);
const BLOCKED_EXTS = ['.exe', '.sh', '.bat', '.cmd', '.ps1', '.scr', '.msi', '.dmg', '.vbs', '.jar', '.app'];

function mimeAllowed(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some(p => mime.startsWith(p)) || ALLOWED_MIME_EXACT.has(mime);
}

function extBlocked(filename: string): boolean {
  const lower = filename.toLowerCase();
  return BLOCKED_EXTS.some(ext => lower.endsWith(ext));
}

function extractFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([^/?&#]+)/);
  return m ? m[1] : null;
}

async function resolveSubfolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
): Promise<string> {
  const res = await drive.files.list({
    q: `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id)',
  });
  if (res.data.files?.length) return res.data.files[0].id!;
  // Subfolder doesn't exist (rare on older WOs) — create it
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    supportsAllDrives: true,
    fields: 'id',
  });
  return created.data.id!;
}

export async function POST(req: Request, { params }: { params: Promise<{ woId: string }> }) {
  const { allowed, email: userEmail } = await checkPermission(req, 'wo:edit');
  if (!allowed) return NextResponse.json({ ok: false, error: 'Forbidden: wo:edit required' }, { status: 403 });

  const { woId } = await params;
  if (!woId) return NextResponse.json({ ok: false, error: 'woId path param required' }, { status: 400 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ ok: false, error: 'file field required' }, { status: 400 });

    if (file.size > MAX_BYTES) {
      return NextResponse.json({
        ok: false,
        error: `File exceeds 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      }, { status: 400 });
    }
    if (!mimeAllowed(file.type)) {
      return NextResponse.json({ ok: false, error: `File type not permitted: ${file.type || 'unknown'}` }, { status: 400 });
    }
    if (extBlocked(file.name)) {
      return NextResponse.json({ ok: false, error: `File extension not permitted: ${file.name}` }, { status: 400 });
    }

    const auth = getGoogleAuth([
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ]);
    const drive  = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // Lookup folder_url from Service_Work_Orders
    const sheetRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A2:X5000`,
    });
    const rows = (sheetRes.data.values || []) as string[][];
    const row = rows.find(r =>
      (r[0] || '').trim() === woId ||  // match by wo_id
      (r[1] || '').trim() === woId     // match by wo_number
    );
    if (!row) {
      return NextResponse.json({ ok: false, error: `Work order not found: ${woId}` }, { status: 404 });
    }

    const folderUrl = (row[FOLDER_URL_COL] || '').trim();
    if (!folderUrl) {
      return NextResponse.json({
        ok: false,
        error: 'No Drive folder linked to this work order. Use the 📁 Files button to link a folder first.',
      }, { status: 400 });
    }

    const woFolderId = extractFolderId(folderUrl);
    if (!woFolderId) {
      return NextResponse.json({ ok: false, error: 'Could not parse Drive folder ID from folder URL.' }, { status: 400 });
    }

    // MIME routing: images → Photos, everything else → Correspondence
    const subfolderName = file.type.startsWith('image/') ? 'Photos' : 'Correspondence';
    const targetFolderId = await resolveSubfolder(drive, subfolderName, woFolderId);

    // Upload file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const { Readable } = await import('stream');
    const uploaded = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: file.name,
        parents: [targetFolderId],
        mimeType: file.type || 'application/octet-stream',
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: Readable.from(buffer),
      },
      fields: 'id,webViewLink,name',
    });

    await drive.permissions.create({
      fileId: uploaded.data.id!,
      supportsAllDrives: true,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const driveUrl = uploaded.data.webViewLink || `https://drive.google.com/file/d/${uploaded.data.id}/view`;

    // Emit event — failure is non-fatal (GC-D037: upload is preserved regardless)
    let eventEmitted = true;
    try {
      await emitMCEvent({
        wo_id:        woId,
        event_type:   'JOB_FILE_UPLOADED',
        notes:        JSON.stringify({ file_name: file.name, mime_type: file.type, destination_subfolder: subfolderName, drive_url: driveUrl }),
        submitted_by: userEmail || '',
        origin:       'office',
      });
    } catch (emitErr) {
      console.warn('[job-file-upload] event emit failed (non-fatal):', emitErr);
      eventEmitted = false;
    }

    return NextResponse.json({
      ok: true,
      file_id:           uploaded.data.id,
      file_name:         file.name,
      destination_folder: subfolderName,
      drive_url:         driveUrl,
      event_emitted:     eventEmitted,
    });

  } catch (err) {
    console.error('[/api/jobs/upload]', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
