import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// Normalize event type strings from sheet
function normalizeType(raw: string): string {
  const t = raw.toUpperCase().replace(/[\s-]/g, '_');
  if (t.includes('ISSUE')) return 'FIELD_ISSUE';
  if (t.includes('DAILY') || t.includes('LOG')) return 'DAILY_LOG';
  if (t.includes('INSTALL')) return 'INSTALL_STEP';
  if (t.includes('QA')) return 'QA_CHECK';
  if (t.includes('PHOTO')) return 'PHOTO_ONLY';
  return 'NOTE';
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kID = searchParams.get('kID') || '';
    const type = searchParams.get('type') || '';
    const limit = parseInt(searchParams.get('limit') || '50');

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const [eventsRes, entitiesRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Field_Events_V1!A2:L500' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Core_Entities!A2:C200' }),
    ]);

    // Build kID → project name map
    const projectNames: Record<string, string> = {};
    for (const r of entitiesRes.data.values || []) {
      if (r[0] && r[2]) projectNames[r[0]] = r[2];
    }

    let events = (eventsRes.data.values || [])
      .filter(r => r[0]) // must have event_id
      .map(r => ({
        id:          r[0],
        kID:         r[1] || '',
        projectName: projectNames[r[1]] || r[1] || 'Unknown',
        type:        normalizeType(r[2] || 'NOTE'),
        rawType:     r[2] || '',
        occurredAt:  r[3] || '',
        recordedAt:  r[4] || '',
        performedBy: r[5] || '',
        recordedBy:  r[6] || '',
        source:      r[7] || '',
        note:        r[9] || r[10] || '', // evidence_type or location_group often has the note text
        location:    r[10] || '',
        unit:        r[11] || '',
      }));

    // Filters
    if (kID) events = events.filter(e => e.kID === kID);
    if (type) events = events.filter(e => e.type === type.toUpperCase());

    // Sort newest first, limit
    events = events
      .sort((a, b) => new Date(b.recordedAt || b.occurredAt).getTime() - new Date(a.recordedAt || a.occurredAt).getTime())
      .slice(0, limit);

    const issues = events.filter(e => e.type === 'FIELD_ISSUE');

    return NextResponse.json({ events, issues, total: events.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, events: [], issues: [] }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { event_id, status, assigned_to } = body;
    if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Read all events to find the row
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Field_Events_V1!A2:L500',
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === event_id);
    if (rowIndex === -1) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    // Update columns as needed — we use the note/source columns for status and assigned_to
    // Column H (index 7) = source — we'll repurpose trailing text for status
    // For now, update in-memory and write back the row
    const row = [...rows[rowIndex]];
    // Extend row to 12 columns if needed
    while (row.length < 12) row.push('');

    // We'll append status/assigned info to the source field (col H, index 7)
    const updates: string[] = [];
    if (status) updates.push(`status:${status}`);
    if (assigned_to) updates.push(`assigned:${assigned_to}`);

    if (updates.length > 0) {
      // Store metadata in a structured way in the source column
      const existing = row[7] || '';
      const cleaned = existing.replace(/\[MC:.*?\]/g, '').trim();
      row[7] = `${cleaned} [MC:${updates.join(',')}]`.trim();

      const sheetRow = rowIndex + 2; // +2 because A2 is the start
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Field_Events_V1!A${sheetRow}:L${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    }

    return NextResponse.json({ ok: true, event_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { kID, description, severity, type } = body;
    if (!kID || !description) return NextResponse.json({ error: 'kID and description required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const now = new Date().toISOString();
    const eventId = `EVT-${Date.now()}`;
    const eventType = type || 'FIELD_ISSUE';

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Field_Events_V1!A:L',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          eventId,    // A: event_id
          kID,        // B: kID
          eventType,  // C: event_type
          now,        // D: occurred_at
          now,        // E: recorded_at
          '',         // F: performed_by
          '',         // G: recorded_by
          `[MC:severity:${severity || 'MEDIUM'}]`, // H: source
          '',         // I
          description,// J: note
          '',         // K: location
          '',         // L: unit
        ]],
      },
    });

    return NextResponse.json({ ok: true, event_id: eventId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
