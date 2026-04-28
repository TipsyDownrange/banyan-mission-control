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
import { formatAttributionCaption, type PhotoEntry } from '@/lib/photo-attribution';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();

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

// Field_Events_V1 column indices (confirmed from sheet headers)
const EV = { event_id:0, target_kID:1, event_type:2, event_occurred_at:3, performed_by:5, evidence_ref:8, manpower_count:22, work_performed:23, delays_blockers:24, materials_received:25, inspections_visitors:26, weather_context:27, notes:28 };
// Service_Work_Orders column indices
const SWO = { wo_id:0, wo_number:1, name:2, island:5, folder_url:23 };

/** GC-D021: Read event fresh from Field_Events_V1 by event_id */
async function getEventFresh(eventId: string) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Field_Events_V1!A2:AF5000' });
  const row = (res.data.values || []).find((r: string[]) => r[EV.event_id] === eventId);
  return row || null;
}

/** Resolve performer name: try user_id, email, or name match in Users_Roles; fall back to raw value */
async function resolvePerformer(raw: string) {
  if (!raw) return null;
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Users_Roles!A2:F100' });
  const rows = res.data.values || [];
  const match = rows.find((r: string[]) =>
    r[0]?.toLowerCase() === raw.toLowerCase() || // user_id
    r[3]?.toLowerCase() === raw.toLowerCase() || // email
    r[1]?.toLowerCase() === raw.toLowerCase()    // full name
  );
  return match ? { name: match[1], role: match[2], island: match[5] } : { name: raw, role: '', island: '' };
}

const BANYAN_DRIVE_ID = '0AKSVpf3AnH7CUk9PVA';

function getDriveClient() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive']);
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

/** Upload PDF using exact WO folder ID from sheet — no name-contains search */
async function uploadToDrive(pdfBuffer: Buffer, filename: string, woFolderId: string): Promise<string | null> {
  try {
    const { Readable } = await import('stream');
    const drive = await getDriveClient();

    // Primary write: Daily Reports/ (matches Task 4 naming, no '07 - ' prefix)
    const dailyReportsFolderId = await findOrCreateDriveFolder(drive, 'Daily Reports', woFolderId);
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
  // Auth: valid MC session (same-origin) OR shared internal key (FA server-to-server)
  const internalKey = process.env.INTERNAL_API_KEY;
  const reqKey = req.headers.get('X-Internal-Key');
  const incomingKey = req.headers.get('X-Internal-Key') || '';
  const envKey = process.env.INTERNAL_API_KEY || '';
  console.log('[daily-report/pdf] KEY CHECK incoming_prefix=' + incomingKey.slice(0,4) + ' incoming_len=' + incomingKey.length + ' env_prefix=' + envKey.slice(0,4) + ' env_len=' + envKey.length + ' match=' + (incomingKey === envKey));
  const keyMatch = incomingKey.length > 0 && incomingKey.trim() === envKey.trim();
  if (!keyMatch) {
    const session = await getServerSession();
    if (!session?.user?.email?.endsWith('@kulaglass.com')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);
  const jsonMode = searchParams.get('json') === 'true';

  let body: Partial<DailyReportPDFData> & { store_to_drive?: boolean };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { kid: bodyKid, event_id, submitted_by: bodySubmittedBy, submitted_at, report_date, store_to_drive } = body;
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 });

  try {
    // GC-D021: Read event fresh from Field_Events_V1
    const evRow = await getEventFresh(event_id);
    if (!evRow) return NextResponse.json({ error: `Event ${event_id} not found` }, { status: 404 });

    const kid = bodyKid || evRow[EV.target_kID] || '';

    // GC-D021: Read WO data fresh for folder_url (exact Drive folder ID, no name-contains search)
    const sheets = await getSheetsClient();
    const swoRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:X2000' });
    const swoRows = (swoRes.data.values || []) as string[][];
    const swoRow = swoRows.find((r: string[]) => r[SWO.wo_id] === kid || r[SWO.wo_number] === kid || r[SWO.wo_id]?.includes(kid.replace('WO-', '')));
    if (!kid) return NextResponse.json({ error: 'kid required (or must be in event target_kID)' }, { status: 400 });

    // Read fresh from sheet
    const performedByRaw = evRow[EV.performed_by] || bodySubmittedBy || '';
    const workPerformed = evRow[EV.work_performed] || (body.work_performed) || '';
    const weatherRaw = evRow[EV.weather_context] || '';
    const manpowerCount = parseInt(evRow[EV.manpower_count] || '0') || 0;
    const delaysRaw = evRow[EV.delays_blockers] || '';
    const materialsRaw = evRow[EV.materials_received] || '';
    const eventOccurredAt = evRow[EV.event_occurred_at] || new Date().toISOString();
    let parsedNotes: Record<string, unknown> = {};
    try {
      const rawNotes = evRow[EV.notes] || '';
      const parsed = rawNotes ? JSON.parse(rawNotes) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedNotes = parsed as Record<string, unknown>;
      }
    } catch {}
    const noteString = (key: string): string | undefined => {
      const value = parsedNotes[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const workPerformedEvents = Array.isArray(parsedNotes.work_performed_events)
      ? parsedNotes.work_performed_events
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
          .map(item => ({
            event_id: typeof item.event_id === 'string' ? item.event_id : '',
            event_type: typeof item.event_type === 'string' ? item.event_type : '',
            description: typeof item.description === 'string' ? item.description : '',
          }))
          .filter(item => item.event_id || item.event_type || item.description)
      : body.work_performed_events;

    // GC-D021: Resolve all reference data fresh
    const [project, performer, superintendent] = await Promise.all([
      getProjectFresh(kid),
      resolvePerformer(performedByRaw),
      Promise.resolve(''), // resolved below after island known
    ]);
    const island = body.island || project.island || performer?.island || '';
    const superName = island ? await getSuperintendent(island) : '';

    const data: DailyReportPDFData = {
      event_id: event_id!,
      kid: kid!,
      project_name: project.name,
      report_date: report_date || eventOccurredAt.slice(0, 10),
      submitted_at: submitted_at || eventOccurredAt,
      submitted_by: performer?.name || performedByRaw || '',
      submitted_by_role: performer?.role || body.submitted_by_role || 'Field Crew',
      island,
      superintendent: superName || body.superintendent || '',
      weather: weatherRaw ? { raw: weatherRaw, auto_filled: false } : (body.weather || { raw: '', auto_filled: false }),
      crew: body.crew || [],
      total_crew: manpowerCount || body.total_crew || body.crew?.length || 0,
      total_hours: body.total_hours || (body.crew || []).reduce((s, c) => s + (c.hours || 0), 0),
      manpower_prefilled: body.manpower_prefilled || false,
      work_performed: workPerformed,
      delays: delaysRaw ? [{ delay_type: 'Delay', description: delaysRaw }] as DailyReportPDFData['delays'] : body.delays,
      delay_description: noteString('delay_description') || body.delay_description,
      materials_received: materialsRaw || body.materials_received,
      crew_on_site: noteString('crew_on_site') || body.crew_on_site,
      system_crew: noteString('system_crew') || body.system_crew,
      work_performed_events: workPerformedEvents,
      user_notes: noteString('user_notes') || body.user_notes,
      visitors: noteString('visitors') || body.visitors,
      safety_issues: noteString('safety_issues') || body.safety_issues,
      photos: body.photos, // overridden below with event evidence_ref
    };

    // WT-018: Prefer Lane A structured photos from notes JSON; fall back to legacy evidence_ref
    let usedNotesPhotos = false;
    try {
      const notesJson = JSON.parse(evRow[EV.notes] || '{}');
      const notesPhotos = notesJson.photos as PhotoEntry[] | undefined;
      if (Array.isArray(notesPhotos) && notesPhotos.length > 0 && notesPhotos[0]?.drive_file_id) {
        data.photos = notesPhotos.map(p => ({
          file_id:    p.drive_file_id,
          file_name:  p.filename,
          drive_link: `https://drive.google.com/file/d/${p.drive_file_id}/view`,
          timestamp:  p.attribution?.submitted_at || evRow[EV.event_occurred_at] || new Date().toISOString(),
          caption:    formatAttributionCaption(p.attribution),
        }));
        usedNotesPhotos = true;
      }
    } catch { /* notes column not JSON — fall through to evidence_ref */ }

    if (!usedNotesPhotos) {
      const evidenceRef = evRow[EV.evidence_ref] || '';
      const photoIds = evidenceRef.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (photoIds.length > 0) {
        data.photos = photoIds.map((id: string) => ({
          file_id:    id,
          file_name:  `photo_${id.slice(0, 8)}.jpg`,
          drive_link: `https://drive.google.com/file/d/${id}/view`,
          timestamp:  evRow[EV.event_occurred_at] || new Date().toISOString(),
          caption:    'Attribution unavailable (pre-WT-018 upload)',
        }));
      }
    }

    const pdfBuffer = await generateDailyReportPDF(data);

    // Bug 4: Store to Drive using exact folder_url from sheet (no name-contains search)
    let driveUrl: string | null = null;
    if (store_to_drive) {
      const dateStr = data.report_date.replace(/-/g, '');
      const filename = `DR-${dateStr.slice(2)}-${kid}.pdf`;
      const folderUrl = swoRow?.[SWO.folder_url] || '';
      const woFolderId = folderUrl.match(/folders\/([^/?]+)/)?.[1] || null;
      console.log('[daily-report/pdf] Drive write: kid=', kid, 'swoRow found:', !!swoRow, 'folderUrl=', folderUrl.slice(0,60), 'woFolderId=', woFolderId);
      if (woFolderId) {
        driveUrl = await uploadToDrive(pdfBuffer, filename, woFolderId);
        console.log('[daily-report/pdf] uploadToDrive result:', driveUrl);
      } else {
        console.error('[daily-report/pdf] No folder_url for', kid, '— skipping Drive write');
      }
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
