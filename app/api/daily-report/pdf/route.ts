/**
 * POST /api/daily-report/pdf
 * Generate a Daily Report PDF. Returns PDF binary or stores to Drive.
 * GC-D021: reads project + crew data fresh at generation time.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { generateDailyReportPDF, type DailyReportPDFData } from '@/lib/pdf-daily-report';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

async function getSheetsClient() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  return google.sheets({ version: 'v4', auth });
}

/** GC-D021: Read project info fresh from Core_Entities */
async function getProjectFresh(kID: string) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Core_Entities!A2:H100' });
  const row = (res.data.values || []).find((r: string[]) => r[0] === kID || r[0]?.includes(kID.replace('WO-', '').replace('PRJ-', '')));
  return row ? { name: row[2] || kID, island: row[5] || '' } : { name: kID, island: '' };
}

/** GC-D021: Read crew info fresh from Users_Roles */
async function getCrewFresh(name: string) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Users_Roles!A2:F100' });
  const user = (res.data.values || []).find((r: string[]) =>
    r[1]?.toLowerCase() === name.toLowerCase() || r[3]?.toLowerCase() === name.toLowerCase()
  );
  return user ? { name: user[1], role: user[2], island: user[5] } : null;
}

/** Find superintendent for this island from Users_Roles */
async function getSuperintendent(island: string) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Users_Roles!A2:F100' });
  const super_ = (res.data.values || []).find((r: string[]) =>
    r[2]?.toLowerCase().includes('superintendent') &&
    r[5]?.toLowerCase() === island.toLowerCase()
  );
  return super_?.[1] || '';
}

const BANYAN_DRIVE_ID = '0AKSVpf3AnH7CUk9PVA';

async function getDriveClient() {
  const authKey = process.env.GOOGLE_SA_KEY_BASE64;
  if (!authKey) throw new Error('GOOGLE_SA_KEY_BASE64 not set');
  const keyJson = JSON.parse(Buffer.from(authKey, 'base64').toString('utf-8'));
  const auth = new google.auth.GoogleAuth({ credentials: keyJson, scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth });
}

async function findOrCreateDriveFolder(drive: ReturnType<typeof google.drive>, name: string, parentId: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'drive', driveId: BANYAN_DRIVE_ID, fields: 'files(id)',
  });
  if (res.data.files?.length) return res.data.files[0].id!;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    supportsAllDrives: true, fields: 'id',
  });
  return created.data.id!;
}

async function findWOFolder(drive: ReturnType<typeof google.drive>, kID: string): Promise<string | null> {
  const safe = kID.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name contains '${safe}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'drive', driveId: BANYAN_DRIVE_ID, fields: 'files(id,name)',
  });
  return res.data.files?.[0]?.id ?? null;
}

/** Upload PDF to Drive — primary to 07 - Daily Reports/, shadow to 10 - AI Project Documents [Kai]/Daily Reports/ */
async function uploadToDrive(pdfBuffer: Buffer, filename: string, kID: string): Promise<string | null> {
  try {
    const { Readable } = await import('stream');
    const drive = await getDriveClient();
    const woFolderId = await findWOFolder(drive, kID);
    if (!woFolderId) {
      console.error('[daily-report/pdf] WO folder not found for', kID, '— skipping Drive write');
      return null;
    }

    // Primary write: 07 - Daily Reports/ (findOrCreate — fixes brittle search)
    const dailyReportsFolderId = await findOrCreateDriveFolder(drive, '07 - Daily Reports', woFolderId);
    const file = await drive.files.create({
      requestBody: { name: filename, parents: [dailyReportsFolderId], mimeType: 'application/pdf' },
      media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
      supportsAllDrives: true, fields: 'id,webViewLink',
    });
    const driveUrl = file.data.webViewLink || null;

    // Shadow write: 10 - AI Project Documents [Kai]/Daily Reports/ (non-fatal)
    try {
      const shadowFolderId = await findOrCreateDriveFolder(drive, '10 - AI Project Documents [Kai]', woFolderId);
      const shadowDailyId = await findOrCreateDriveFolder(drive, 'Daily Reports', shadowFolderId);
      const shadowStream = Readable.from(pdfBuffer);
      await drive.files.create({
        requestBody: { name: filename, parents: [shadowDailyId], mimeType: 'application/pdf' },
        media: { mimeType: 'application/pdf', body: shadowStream },
        supportsAllDrives: true, fields: 'id',
      });
    } catch (shadowErr) {
      console.error('[daily-report/pdf] shadow write failed (non-fatal):', shadowErr);
    }

    return driveUrl;
  } catch (e) {
    console.error('[daily-report/pdf] Drive upload error:', e);
    return null;
  }
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jsonMode = searchParams.get('json') === 'true';

  let body: Partial<DailyReportPDFData> & { store_to_drive?: boolean };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { kid, event_id, submitted_by, submitted_at, report_date, store_to_drive } = body;
  if (!kid || !event_id) return NextResponse.json({ error: 'kid and event_id required' }, { status: 400 });

  try {
    // GC-D021: Read all reference data fresh
    const [project, user, superintendent] = await Promise.all([
      getProjectFresh(kid),
      submitted_by ? getCrewFresh(submitted_by) : Promise.resolve(null),
      body.island ? getSuperintendent(body.island) : Promise.resolve(''),
    ]);

    const data: DailyReportPDFData = {
      event_id: event_id!,
      kid: kid!,
      project_name: project.name,
      report_date: report_date || (submitted_at || new Date().toISOString()).slice(0, 10),
      submitted_at: submitted_at || new Date().toISOString(),
      submitted_by: user?.name || submitted_by || 'Unknown',
      submitted_by_role: user?.role || body.submitted_by_role || 'Field Crew',
      island: body.island || project.island || user?.island || '',
      superintendent: superintendent || body.superintendent || '',
      weather: body.weather || { raw: 'Not reported', auto_filled: false },
      crew: body.crew || [],
      total_crew: body.total_crew || body.crew?.length || 0,
      total_hours: body.total_hours || (body.crew || []).reduce((s, c) => s + (c.hours || 0), 0),
      manpower_prefilled: body.manpower_prefilled || false,
      work_performed: body.work_performed || '',
      delays: body.delays,
      materials_received: body.materials_received,
      photos: body.photos,
    };

    const pdfBuffer = await generateDailyReportPDF(data);

    // Optionally store to Drive
    let driveUrl: string | null = null;
    if (store_to_drive) {
      const dateStr = data.report_date.replace(/-/g, '');
      const filename = `DR-${dateStr.slice(2)}-${kid}.pdf`;
      driveUrl = await uploadToDrive(pdfBuffer, filename, kid);
    }

    // Return JSON if requested (for FA auto-trigger), otherwise return PDF binary
    if (jsonMode && store_to_drive) {
      return NextResponse.json({ ok: true, driveUrl, primaryFileId: driveUrl?.match(/\/d\/([^/]+)\//)?.[1] || null });
    }

    // Return PDF binary (default — MC manual download path)
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="DR-${data.report_date}-${kid}.pdf"`,
        ...(driveUrl ? { 'X-Drive-URL': driveUrl } : {}),
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[daily-report/pdf]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
