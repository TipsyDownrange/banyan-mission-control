/**
 * POST /api/field-issue/pdf
 * Body: { event_id: string }
 * Reads FIELD_ISSUE event fresh from Field_Events_V1, reads WO data fresh,
 * generates PDF, dual-writes to [WO]/Field Issues/ + shadow Field Issues/.
 * Returns: { ok, primaryFileId, shadowFileId, driveUrl }
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { getGoogleAuth } from '@/lib/gauth';
import { generateFieldIssuePDF, type FieldIssueData } from '@/lib/pdf-field-issue';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const BANYAN_DRIVE = '0AKSVpf3AnH7CUk9PVA';
const TAB_EVENTS = 'Field_Events_V1';

/** Resolve performer: user_id → email → name match in Users_Roles; fall back to raw value */
async function resolvePerformer(raw: string, sheets: ReturnType<typeof google.sheets>): Promise<{name:string;role:string}> {
  if (!raw) return { name: '', role: '' };
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Users_Roles!A2:F100' });
    const rows = (res.data.values || []) as string[][];
    const match = rows.find(r =>
      r[0]?.toLowerCase() === raw.toLowerCase() || // user_id
      r[3]?.toLowerCase() === raw.toLowerCase() || // email
      r[1]?.toLowerCase() === raw.toLowerCase()    // full name
    );
    return match ? { name: match[1] || raw, role: match[2] || 'Field Crew' } : { name: raw, role: 'Field Crew' };
  } catch { return { name: raw, role: 'Field Crew' }; }
}

// Column indices for Field_Events_V1 (confirmed from sheet headers)
const EV = {
  event_id: 0, target_kID: 1, event_type: 2,
  event_occurred_at: 3, performed_by: 5,
  evidence_ref: 8, location_group: 10, unit_reference: 11,
  qa_step_code: 12, issue_category: 14, severity: 15,
  blocking_flag: 16, notes: 28,
};

// SWO columns
const SWO = { wo_id: 0, wo_number: 1, name: 2, island: 5, assigned_to: 14, folder_url: 23 };

function getDrive() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive']);
  return google.drive({ version: 'v3', auth });
}

async function findOrCreate(drive: ReturnType<typeof google.drive>, name: string, parentId: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'drive', driveId: BANYAN_DRIVE, fields: 'files(id)',
  });
  if (res.data.files?.length) return res.data.files[0].id!;
  const c = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    supportsAllDrives: true, fields: 'id',
  });
  return c.data.id!;
}

export async function POST(req: Request) {
  // Auth: valid MC session (same-origin) OR shared internal key (FA server-to-server)
  const internalKey = process.env.INTERNAL_API_KEY;
  const reqKey = req.headers.get('X-Internal-Key');
  const keyMatch = internalKey && reqKey === internalKey;
  if (!keyMatch) {
    const session = await getServerSession();
    if (!session?.user?.email?.endsWith('@kulaglass.com')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: { event_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const { event_id } = body;
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 });

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    // GC-D021: Read event fresh
    const evRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB_EVENTS}!A2:AF5000` });
    const evRows = (evRes.data.values || []) as string[][];
    const evRow = evRows.find(r => r[EV.event_id] === event_id);
    if (!evRow) return NextResponse.json({ error: `Event ${event_id} not found` }, { status: 404 });
    if ((evRow[EV.event_type] || '').toUpperCase() !== 'FIELD_ISSUE') {
      return NextResponse.json({ error: 'Event is not a FIELD_ISSUE' }, { status: 400 });
    }

    const kID = evRow[EV.target_kID] || '';

    // GC-D021: Read WO data fresh — use folder_url for exact Drive folder ID
    const swoRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:X2000' });
    const swoRows = (swoRes.data.values || []) as string[][];
    const swoRow = swoRows.find(r => r[SWO.wo_id] === kID || r[SWO.wo_number] === kID || r[SWO.wo_id]?.includes(kID.replace('WO-', '')));
    const projectName = swoRow?.[SWO.name] || kID;
    const folderUrl = swoRow?.[SWO.folder_url] || '';
    const woFolderId = folderUrl.match(/folders\/([^/?]+)/)?.[1] || null;

    // Build photo references from evidence_ref (comma-separated Drive fileIds)
    const evidenceRef = evRow[EV.evidence_ref] || '';
    const photoIds = evidenceRef.split(',').map(s => s.trim()).filter(Boolean);
    const photos = photoIds.map(id => ({
      file_id: id,
      file_name: `photo_${id.slice(0, 8)}.jpg`,
      drive_link: `https://drive.google.com/file/d/${id}/view`,
      timestamp: evRow[EV.event_occurred_at] || new Date().toISOString(),
    }));

    // Issue A: resolve performer name + role from Users_Roles
    const performer = await resolvePerformer(evRow[EV.performed_by] || '', sheets);

    // Parse notes field for structured data (notes may be plain text for legacy events)
    let notesJson: Record<string, unknown> = {};
    try { notesJson = JSON.parse(evRow[EV.notes] || '{}'); } catch { notesJson = {}; }

    const data: FieldIssueData = {
      event_id,
      report_id: `FI-${event_id.slice(0, 8).toUpperCase()}`,
      timestamp: evRow[EV.event_occurred_at] || new Date().toISOString(),
      project_name: projectName,
      kID,
      location_group: evRow[EV.location_group] || '',
      unit_reference: evRow[EV.unit_reference] || undefined,
      reported_by: performer.name || evRow[EV.performed_by] || '',
      role: performer.role || 'Field Crew',
      issue_description: String(notesJson.issue_description || evRow[EV.notes] || ''),
      issue_category: evRow[EV.issue_category] || 'Unknown',
      caused_by: String(notesJson.caused_by || ''),
      affected_count: parseInt(String(notesJson.affected_count || '0')) || 0,
      hours_lost: parseFloat(String(notesJson.hours_lost || '0')) || 0,
      blocking: evRow[EV.blocking_flag] === 'TRUE',
      severity: (['LOW','MEDIUM','HIGH','CRITICAL'].includes((evRow[EV.severity] || '').toUpperCase())
        ? evRow[EV.severity].toUpperCase() : 'MEDIUM') as FieldIssueData['severity'],
      photos,
      recorded_at: evRow[EV.event_occurred_at] || new Date().toISOString(),
      recorded_by: evRow[EV.performed_by] || '',
      source_system: 'field_app',
    };

    const pdfBuffer = await generateFieldIssuePDF(data);
    const filename = `FI-${event_id.slice(0, 8).toUpperCase()}-${kID}.pdf`;

    // Drive writes — need write scope
    const drive = getDrive();
    let primaryFileId: string | null = null;
    let shadowFileId: string | null = null;

    if (woFolderId) {
      // Primary: [WO]/Field Issues/
      try {
        const fieldIssuesFolderId = await findOrCreate(drive, 'Field Issues', woFolderId);
        const primaryFile = await drive.files.create({
          requestBody: { name: filename, parents: [fieldIssuesFolderId], mimeType: 'application/pdf' },
          media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
          supportsAllDrives: true, fields: 'id,webViewLink',
        });
        primaryFileId = primaryFile.data.id || null;
      } catch (e) { console.error('[field-issue/pdf] primary write failed:', e); }

      // Shadow: [WO]/10 - AI Project Documents [Kai]/Field Issues/ (non-fatal)
      try {
        const shadowRoot = await findOrCreate(drive, '10 - AI Project Documents [Kai]', woFolderId);
        const shadowFieldIssues = await findOrCreate(drive, 'Field Issues', shadowRoot);
        const shadowStream = Readable.from(pdfBuffer);
        const shadowFile = await drive.files.create({
          requestBody: { name: filename, parents: [shadowFieldIssues], mimeType: 'application/pdf' },
          media: { mimeType: 'application/pdf', body: shadowStream },
          supportsAllDrives: true, fields: 'id',
        });
        shadowFileId = shadowFile.data.id || null;
      } catch (shadowErr) { console.error('[field-issue/pdf] shadow write failed (non-fatal):', shadowErr); }
    } else {
      console.error('[field-issue/pdf] No folder_url for', kID, '— skipping Drive write');
    }

    return NextResponse.json({
      ok: true,
      event_id,
      kID,
      primaryFileId,
      shadowFileId,
      driveUrl: primaryFileId ? `https://drive.google.com/file/d/${primaryFileId}/view` : null,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[field-issue/pdf]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
