import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const island = searchParams.get('island') || '';

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Users_Roles!A2:R100',
    });

    const rows = res.data.values || [];
    let crew = rows
      .filter(r => r[0] && r[1] && r[2])
      .map(r => ({
        user_id:           r[0]  || '',
        name:              r[1]  || '',
        role:              r[2]  || '',
        email:             r[3]  || '',
        phone:             r[4]  || '',
        island:            r[5]  || '',
        personal_email:    r[6]  || '',
        title:             r[7]  || '',
        department:        r[8]  || '',
        office:            r[9]  || '',
        home_address:      r[10] || '',
        emergency_contact: r[11] || '',
        start_date:        r[12] || '',
        notes:             r[13] || '',
        authority_level:   r[14] || '',
        career_track:      r[15] || '',
        departments_multi: r[16] || '',
        roles_multi:       r[17] || '',
        // Computed: array of departments this person belongs to
        departments: (r[16] || r[8] || '').split(',').map((d: string) => d.trim()).filter(Boolean),
        roles: (r[17] || r[2] || '').split(',').map((d: string) => d.trim()).filter(Boolean),
      }));

    // Filter to field-dispatchable roles: Superintendent, Journeyman, Apprentice
    const DISPATCHABLE = ['Superintendent', 'Journeyman', 'Apprentice'];
    const dispatchable = crew.filter(c => DISPATCHABLE.some(r => c.role.includes(r)));

    // Island filter
    const filtered = island
      ? dispatchable.filter(c => c.island.toLowerCase() === island.toLowerCase())
      : dispatchable;

    // Also return PM/Service for assignment (Joey etc)
    const pms = crew.filter(c =>
      c.roles.some((r: string) => r.toLowerCase().includes('pm') || r.toLowerCase().includes('service') || r.toLowerCase().includes('superintendent'))
    );

    return NextResponse.json({ crew: filtered, pms, all: crew });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, crew: [], pms: [], all: [] }, { status: 500 });
  }
}
