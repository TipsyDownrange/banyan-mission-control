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
