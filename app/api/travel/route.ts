/**
 * GET /api/travel
 * Returns travel status from Travel_Status sheet.
 * Used by crew cards and calendar ticker.
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

export type TravelRecord = {
  crew_name: string;
  travel_date: string;
  type: 'flight' | 'ferry' | string;
  from_code: string;
  from_name: string;
  to_code: string;
  to_name: string;
  flight_number: string;
  depart_time: string;
  status: string;
};

function isToday(date: string): boolean {
  return date === new Date().toISOString().slice(0, 10);
}

function isTomorrow(date: string): boolean {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return date === tomorrow;
}

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Travel_Status!A2:K500',
    });

    const rows = res.data.values || [];
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const records: TravelRecord[] = rows
      .filter(r => r[0] && r[1])
      .map(r => ({
        crew_name:    r[0] || '',
        travel_date:  r[1] || '',
        type:         r[2] || 'flight',
        from_code:    r[3] || '',
        from_name:    r[4] || '',
        to_code:      r[5] || '',
        to_name:      r[6] || '',
        flight_number: r[7] || '',
        depart_time:  r[8] || '',
        status:       r[9] || 'booked',
      }))
      .filter(r => r.travel_date >= today && r.travel_date <= nextWeek);

    // Build crew-keyed lookup for fast card lookup
    const byCrewName: Record<string, TravelRecord[]> = {};
    for (const r of records) {
      const key = r.crew_name.toLowerCase();
      (byCrewName[key] = byCrewName[key] || []).push(r);
    }

    // Today's travelers
    const travelingToday = records.filter(r => isToday(r.travel_date));
    const travelingTomorrow = records.filter(r => isTomorrow(r.travel_date));

    return NextResponse.json({
      records,
      byCrewName,
      travelingToday,
      travelingTomorrow,
      total: records.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, records: [], byCrewName: {}, travelingToday: [], travelingTomorrow: [] }, { status: 500 });
  }
}
