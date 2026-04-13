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

/** Upload PDF to Drive under project's 07 - Daily Reports folder */
async function uploadToDrive(pdfBuffer: Buffer, filename: string, kID: string): Promise<string | null> {
  try {
    const authKey = process.env.GOOGLE_SA_KEY_BASE64;
    if (!authKey) return null;
    const keyJson = JSON.parse(Buffer.from(authKey, 'base64').toString('utf-8'));
    const auth = new google.auth.GoogleAuth({
      credentials: keyJson,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    // Search for the project's daily reports folder
    const q = `name contains '07' and mimeType = 'application/vnd.google-apps.folder' and fullText contains '${kID}'`;
    const folderRes = await drive.files.list({ q, supportsAllDrives: true, includeItemsFromAllDrives: true, fields: 'files(id,name)' });
    const folder = folderRes.data.files?.[0];

    const parents = folder?.id ? [folder.id] : undefined;
    const { Readable } = await import('stream');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = await (drive.files.create as any)({
      supportsAllDrives: true,
      requestBody: { name: filename, ...(parents ? { parents } : {}) },
      media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
      fields: 'id,webViewLink',
    });
    return file?.data?.webViewLink || null;
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

    // Return PDF
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
