import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

// GET /api/drive/list?folderId=xxx&recursive=true
// Lists files in a Google Drive folder using the service account
// With recursive=true, also lists files inside subfolders (1 level deep)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId');
    const recursive = searchParams.get('recursive') !== 'false'; // default true
    if (!folderId || !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
      return NextResponse.json({ error: 'folderId is required and must be a valid Drive ID' }, { status: 400 });
    }

    const auth = getGoogleAuth([
      'https://www.googleapis.com/auth/drive.readonly',
    ]);
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,webViewLink,size,modifiedTime,iconLink)',
      orderBy: 'name',
      pageSize: 200,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const allFiles: Array<{
      id: string | null | undefined;
      name: string | null | undefined;
      mimeType: string | null | undefined;
      webViewLink: string | null | undefined;
      size: string | null | undefined;
      modifiedTime: string | null | undefined;
      iconLink: string | null | undefined;
      isFolder: boolean;
      folder?: string;
    }> = [];

    const folders: Array<{ id: string; name: string }> = [];

    for (const f of res.data.files || []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        folders.push({ id: f.id!, name: f.name! });
      } else {
        allFiles.push({
          id: f.id, name: f.name, mimeType: f.mimeType,
          webViewLink: f.webViewLink, size: f.size,
          modifiedTime: f.modifiedTime, iconLink: f.iconLink,
          isFolder: false,
        });
      }
    }

    // Recurse one level into subfolders
    if (recursive && folders.length > 0) {
      const subResults = await Promise.all(
        folders.map(folder =>
          drive.files.list({
            q: `'${folder.id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
            fields: 'files(id,name,mimeType,webViewLink,size,modifiedTime,iconLink)',
            orderBy: 'name',
            pageSize: 100,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
          }).then(r => ({ folderName: folder.name, files: r.data.files || [] }))
        )
      );
      for (const sub of subResults) {
        for (const f of sub.files) {
          allFiles.push({
            id: f.id, name: f.name, mimeType: f.mimeType,
            webViewLink: f.webViewLink, size: f.size,
            modifiedTime: f.modifiedTime, iconLink: f.iconLink,
            isFolder: false,
            folder: sub.folderName,
          });
        }
      }
    }

    return NextResponse.json({ files: allFiles, folders, total: allFiles.length, folderId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, files: [] }, { status: 500 });
  }
}
