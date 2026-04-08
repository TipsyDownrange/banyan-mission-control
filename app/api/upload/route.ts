import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

// Folder IDs for estimating workspace
const ESTIMATING_ACTIVE = '1-_Vl0OM4AE4pnm_bKKqqIluJr3jk0hTf'; // Estimating/Active Bids

const SUBFOLDER_MAP: Record<string, string> = {
  // By file extension / type
  'xlsx': '01 - Estimate Sheets',
  'xls': '01 - Estimate Sheets',
  'pdf': '02 - Proposals',
  'docx': '02 - Proposals',
  'doc': '02 - Proposals',
  'dwg': '03 - Drawings',
  'png': '04 - Photos',
  'jpg': '04 - Photos',
  'jpeg': '04 - Photos',
  'heic': '04 - Photos',
};

const KEYWORD_MAP: Record<string, string> = {
  'estimate': '01 - Estimate Sheets',
  'takeoff': '01 - Estimate Sheets',
  'workbook': '01 - Estimate Sheets',
  'proposal': '02 - Proposals',
  'quote': '02 - Proposals',
  'drawing': '03 - Drawings',
  'plan': '03 - Drawings',
  'spec': '03 - Drawings',
  'photo': '04 - Photos',
  'picture': '04 - Photos',
  'rfi': '05 - RFIs',
  'submittal': '06 - Submittals',
};

function detectSubfolder(filename: string): { subfolder: string; reason: string } {
  const lower = filename.toLowerCase();
  
  // Check keywords first
  for (const [keyword, folder] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword)) return { subfolder: folder, reason: `filename contains "${keyword}"` };
  }
  
  // Check extension
  const ext = lower.split('.').pop() || '';
  if (SUBFOLDER_MAP[ext]) return { subfolder: SUBFOLDER_MAP[ext], reason: `.${ext} file` };
  
  return { subfolder: '07 - Other', reason: 'could not auto-detect' };
}

async function getOrCreateFolder(drive: ReturnType<typeof google.drive>, name: string, parentId: string): Promise<string> {
  const existing = await drive.files.list({
    q: `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)', includeItemsFromAllDrives: true, supportsAllDrives: true,
  });
  if (existing.data.files?.length) return existing.data.files[0].id!;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id', supportsAllDrives: true,
  });
  return created.data.id!;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const bidKID = formData.get('bidKID') as string;
    const bidName = formData.get('bidName') as string;
    const estimator = formData.get('estimator') as string || 'Unassigned';
    const targetFolder = formData.get('targetFolder') as string || ''; // manual override

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive']);
    const drive = google.drive({ version: 'v3', auth });

    // Get or create estimator folder
    const estimatorFirstName = estimator.split(' ')[0];
    const estimatorFolderId = await getOrCreateFolder(drive, estimatorFirstName, ESTIMATING_ACTIVE);

    // Get or create bid folder
    const bidFolderName = bidKID && bidName ? `${bidKID} — ${bidName.substring(0, 50)}` : bidName || 'Unknown Bid';
    const bidFolderId = await getOrCreateFolder(drive, bidFolderName, estimatorFolderId);

    // Determine subfolder
    let subfolderName = targetFolder;
    let routingReason = 'manual selection';
    if (!subfolderName) {
      const detected = detectSubfolder(file.name);
      subfolderName = detected.subfolder;
      routingReason = `Kai detected: ${detected.reason}`;
    }

    // Get or create subfolder
    const subfolderNames = ['01 - Estimate Sheets','02 - Proposals','03 - Drawings','04 - Photos','05 - RFIs','06 - Submittals','07 - Other'];
    for (const sf of subfolderNames) {
      await getOrCreateFolder(drive, sf, bidFolderId);
    }
    const subfolderId = await getOrCreateFolder(drive, subfolderName, bidFolderId);

    // Upload the file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { Readable } = await import('stream');
    const stream = Readable.from(buffer);

    const uploaded = await drive.files.create({
      requestBody: { name: file.name, parents: [subfolderId] },
      media: { mimeType: file.type || 'application/octet-stream', body: stream },
      fields: 'id,name,webViewLink',
      supportsAllDrives: true,
    });

    return NextResponse.json({
      success: true,
      fileId: uploaded.data.id,
      fileName: uploaded.data.name,
      webViewLink: uploaded.data.webViewLink,
      path: `Estimating/Active Bids/${estimatorFirstName}/${bidFolderName}/${subfolderName}/${file.name}`,
      routingReason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}
