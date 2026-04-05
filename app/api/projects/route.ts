import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// Map USR IDs to names — mirrors Users_Roles sheet
// Dynamically loaded below from Users_Roles sheet, but keep static fallback
const USER_NAMES_FALLBACK: Record<string, string> = {
  'USR-001': 'Jody Boeringa',
  'USR-002': 'Sean Daniels',
  'USR-003': 'Frank Redondo',
  'USR-004': 'Kyle Shimizu',
  'USR-005': 'Jenny Shimabukuro',
  'USR-006': 'Joey Ritthaler',
  'USR-007': 'Tia Omura',
  'USR-008': 'Jenna Nakama',
  'USR-009': 'Sherilynn Takuchi',
  'USR-010': 'Karl Nakamura Sr.',
  'USR-011': 'Karl Nakamura Jr.',
  'USR-028': 'Nate Nakamura',
  'USR-EXT-001': 'Fuller Glass',
  'USR-EXT-002': 'Matta',
};

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const [entitiesRes, eventsRes, usersRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Core_Entities!A2:H200' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Field_Events_V1!A2:L500' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Users_Roles!A2:B100' }),
    ]);

    const rows = entitiesRes.data.values || [];
    const eventRows = eventsRes.data.values || [];
    
    // Build dynamic user name map
    const USER_NAMES: Record<string, string> = { ...USER_NAMES_FALLBACK };
    for (const u of (usersRes.data.values || [])) {
      if (u[0] && u[1]) USER_NAMES[u[0]] = u[1];
    }

    // Count events per project kID
    const eventCounts: Record<string, number> = {};
    const issueCounts: Record<string, number> = {};
    for (const e of eventRows) {
      const kID = e[1];
      const type = (e[2] || '').toLowerCase();
      if (!kID) continue;
      eventCounts[kID] = (eventCounts[kID] || 0) + 1;
      if (type.includes('issue')) issueCounts[kID] = (issueCounts[kID] || 0) + 1;
    }

    const projects = rows
      .filter(r => r[0] && r[1] === 'Project' && r[3] === 'Active')
      .map(r => ({
        kID:        r[0],
        type:       r[1] || '',
        name:       r[2] || '',
        status:     r[3] || '',
        pm:         USER_NAMES[r[4]] || r[4] || '',
        super:      USER_NAMES[r[5]] || r[5] || '',
        island:     r[6] || '',
        gateCode:   r[7] || '',
        eventCount: eventCounts[r[0]] || 0,
        issues:     issueCounts[r[0]] || 0,
      }));

    return NextResponse.json({ projects, total: projects.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, projects: [] }, { status: 500 });
  }
}
