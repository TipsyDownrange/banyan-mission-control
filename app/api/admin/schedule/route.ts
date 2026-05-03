/**
 * GET /api/admin/schedule
 * Read-only logistics schedule view for admin/management roles.
 * Joins Dispatch_Schedule A:S + Users_Roles + Travel_Status.
 * No writes. No mutations.
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { checkPermissionServer } from '@/lib/permissions';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();

// Dispatch_Schedule A:S — 19-column canonical contract
const DISPATCH_COLS = [
  'slot_id', 'date', 'kID', 'project_name', 'island', 'men_required',
  'hours_estimated', 'assigned_crew', 'created_by', 'status', 'confirmations',
  'work_type', 'notes', 'start_time', 'end_time',
  'step_ids', 'hours_actual', 'last_modified', 'focus_step_ids',
];

function rowToDispatch(row: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  DISPATCH_COLS.forEach((col, i) => { out[col] = row[i] || ''; });
  return out;
}

export interface CrewMeta {
  name: string;
  role: string;
  email: string;
  island: string;
  title: string;
}

export interface TravelEntry {
  crew_name: string;
  travel_date: string;
  type: string;
  from_code: string;
  to_code: string;
  flight_number: string;
  depart_time: string;
  status: string;
}

export interface IslandMovement {
  crew_name: string;
  home_island: string;
  dispatch_island: string;
  slot_id: string;
  date: string;
  project_name: string;
  travel_booked: boolean;
}

export async function GET(req: Request) {
  const { allowed } = await checkPermissionServer('reports:view');
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden: reports:view required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || new Date().toISOString().slice(0, 10);
    const days = Math.min(parseInt(searchParams.get('days') || '28'), 90);

    const fromDate = new Date(from + 'T00:00:00');
    const toDate = new Date(fromDate.getTime() + days * 24 * 60 * 60 * 1000);

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch all three sheets in parallel — read-only
    const [dispatchRes, usersRes, travelRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Dispatch_Schedule!A2:S5000',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Users_Roles!A2:R200',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Travel_Status!A2:K500',
      }),
    ]);

    // Build crew home-island lookup keyed by lowercase name
    const crewMeta: Record<string, CrewMeta> = {};
    for (const row of (usersRes.data.values || [])) {
      const name = (row[1] || '').trim();
      if (!name) continue;
      crewMeta[name.toLowerCase()] = {
        name,
        role: row[2] || '',
        email: (row[3] || '').toLowerCase(),
        island: row[5] || '',
        title: row[7] || '',
      };
    }

    // Filter dispatch slots to the requested window
    const slots = (dispatchRes.data.values || [])
      .filter(r => r[0])
      .map(r => rowToDispatch(r.map(String)))
      .filter(s => {
        const d = new Date(s.date + 'T00:00:00');
        return d >= fromDate && d <= toDate;
      });

    // Build travel lookup: crew_name (lower) -> TravelEntry[]
    const travelByName: Record<string, TravelEntry[]> = {};
    const travelWindow = new Date(fromDate.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const travelWindowEnd = toDate.toISOString().slice(0, 10);

    for (const row of (travelRes.data.values || [])) {
      const crew_name = (row[0] || '').trim();
      const travel_date = row[1] || '';
      if (!crew_name || !travel_date) continue;
      if (travel_date < travelWindow || travel_date > travelWindowEnd) continue;

      const entry: TravelEntry = {
        crew_name,
        travel_date,
        type: row[2] || 'flight',
        from_code: row[3] || '',
        to_code: row[5] || '',
        flight_number: row[7] || '',
        depart_time: row[8] || '',
        status: row[9] || 'booked',
      };
      const key = crew_name.toLowerCase();
      (travelByName[key] = travelByName[key] || []).push(entry);
    }

    // Identify island movement risks: crew assigned to a different island than their home
    const movements: IslandMovement[] = [];
    for (const slot of slots) {
      if (!slot.island || !slot.assigned_crew) continue;
      const names = slot.assigned_crew.split(',').map(n => n.trim()).filter(Boolean);
      for (const name of names) {
        const meta = crewMeta[name.toLowerCase()];
        if (!meta?.island) continue;
        if (meta.island.toLowerCase() !== slot.island.toLowerCase()) {
          const travelForCrewNearDate = (travelByName[name.toLowerCase()] || []).some(
            t => Math.abs(new Date(t.travel_date).getTime() - new Date(slot.date + 'T00:00:00').getTime()) <= 3 * 24 * 60 * 60 * 1000
          );
          movements.push({
            crew_name: name,
            home_island: meta.island,
            dispatch_island: slot.island,
            slot_id: slot.slot_id,
            date: slot.date,
            project_name: slot.project_name,
            travel_booked: travelForCrewNearDate,
          });
        }
      }
    }

    // Crew with travel booked — deduplicated full list in window
    const travelRecords = Object.values(travelByName).flat();

    // Readiness summary: movements without travel booked = blockers
    const blockers = movements.filter(m => !m.travel_booked);
    const covered = movements.filter(m => m.travel_booked);

    return NextResponse.json({
      slots,
      crewMeta,
      travelRecords,
      travelByName,
      islandMovements: movements,
      blockers,
      covered,
      meta: {
        from,
        days,
        slotCount: slots.length,
        movementCount: movements.length,
        blockerCount: blockers.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
