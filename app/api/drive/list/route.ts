import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

// GET /api/drive/list?folderId=xxx
// Lists files in a Google Drive folder using the service account
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId');
    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
    }

    const auth = getGoogleAuth([
      'https://www.googleapis.com/auth/drive.readonly',
    ]);
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,webViewLink,size,modifiedTime,iconLink)',
      orderBy: 'name',
      pageSize: 100,
    });

    const files = (res.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      webViewLink: f.webViewLink,
      size: f.size,
      modifiedTime: f.modifiedTime,
      iconLink: f.iconLink,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    }));

    return NextResponse.json({ files, total: files.length, folderId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, files: [] }, { status: 500 });
  }
}
