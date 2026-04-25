/**
 * GET /api/events
 *
 * Read Field_Events_V1 with filters. Prerequisite for PM module.
 *
 * Query params:
 *   kID         — filter by target_kID (exact match)
 *   event_type  — filter by event_type (INSTALL_STEP|FIELD_ISSUE|DAILY_LOG|PHOTO_ONLY|NOTE)
 *   status      — filter by issue_status (OPEN|RESOLVED|CLOSED) — applies to FIELD_ISSUE events
 *   date_from   — ISO date string, inclusive (compares against event_occurred_at)
 *   date_to     — ISO date string, inclusive
 *   limit       — max rows to return (default 500, max 2000)
 *   offset      — skip N rows (for pagination)
 *
 * Returns:
 *   { events: FieldEvent[], total: number, filtered: number }
 */

import { NextResponse } from 'next/server';
import { kidsMatch } from '@/lib/normalize-kid';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Field_Events_V1';

// Column indices matching Field App's lib/events.ts schema
const COL = {
  event_id:             0,
  target_kID:           1,
  event_type:           2,
  event_occurred_at:    3,
  event_recorded_at:    4,
  performed_by:         5,
  recorded_by:          6,
  source_system:        7,
  evidence_ref:         8,
  evidence_type:        9,
  location_group:       10,
  unit_reference:       11,
  qa_step_code:         12,
  qa_status:            13,
  issue_category:       14,
  severity:             15,
  blocking_flag:        16,
  issue_status:         17, // R
  assigned_to:          18, // S
  assigned_role:        19, // T
  responsible_party:    20, // U
  auto_flag:            21, // V (assignment_source)
  manpower_count:       22, // W
  work_performed:       23, // X
  delays_blockers:      24, // Y
  materials_received:   25, // Z
  inspections_visitors: 26, // [
  weather_context:      27, // \
  notes:                28, // ] — confirmed from sheet headers
  project_id:           29, // ^
  evidence_photo:       30, // _
  evidence_timestamp:   31, // `
  affected_count:       32, // AG — Phase 3 FA (WIRE-FA-019)
  hours_lost:           33, // AH — Phase 3 FA (WIRE-FA-020)
  field_issue_pdf_ref:  36, // AK — DRIFT-FA-076
};

function rowToEvent(row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [key, idx] of Object.entries(COL)) {
    obj[key] = row[idx] || '';
  }
  return obj;
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const kID        = searchParams.get('kID') || '';
  const eventType  = searchParams.get('event_type') || '';
  const status     = searchParams.get('status') || '';
  const dateFrom   = searchParams.get('date_from') || '';
  const dateTo     = searchParams.get('date_to') || '';
  const limit      = Math.min(parseInt(searchParams.get('limit') || '500'), 2000);
  const offset     = parseInt(searchParams.get('offset') || '0');

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch events + Users_Roles in parallel for name resolution
    const [res, usersRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A2:AK5000`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Users_Roles!A2:D100', // A=user_id, B=name, C=role, D=email
      }).catch(() => ({ data: { values: [] } })), // non-fatal
    ]);

    // Build user ID → name map (also map email → name as fallback)
    const userNameMap: Record<string, string> = {};
    for (const u of (usersRes.data.values || []) as string[][]) {
      if (u[0] && u[1]) userNameMap[u[0]] = u[1]; // USR-xxx → name
      if (u[3] && u[1]) userNameMap[u[3].toLowerCase()] = u[1]; // email → name
    }

    const rows = (res.data.values || []) as string[][];
    const total = rows.length;

    // Apply filters
    const filtered = rows.filter(row => {
      // Skip soft-deleted
      // Note: is_valid column removed from schema (was incorrect index); no soft-delete filter needed

      if (kID && !kidsMatch(row[COL.target_kID], kID)) return false;

      if (eventType && row[COL.event_type]?.toUpperCase() !== eventType.toUpperCase()) return false;

      if (status && row[COL.issue_status]?.toUpperCase() !== status.toUpperCase()) return false;

      if (dateFrom) {
        const occurred = row[COL.event_occurred_at] || '';
        if (occurred && occurred < dateFrom) return false;
      }
      if (dateTo) {
        const occurred = row[COL.event_occurred_at] || '';
        // dateTo is inclusive — compare up to end of day
        const dayEnd = dateTo.length === 10 ? `${dateTo}T23:59:59` : dateTo;
        if (occurred && occurred > dayEnd) return false;
      }

      return true;
    });

    // Sort by event_occurred_at descending (most recent first)
    filtered.sort((a, b) => {
      const ta = a[COL.event_occurred_at] || '';
      const tb = b[COL.event_occurred_at] || '';
      return tb.localeCompare(ta);
    });

    // Paginate
    const page = filtered.slice(offset, offset + limit).map(row => {
      const evt = rowToEvent(row);
      // Resolve USR- IDs and emails to display names
      if (evt.performed_by && userNameMap[evt.performed_by]) evt.performed_by = userNameMap[evt.performed_by];
      else if (evt.performed_by && userNameMap[evt.performed_by?.toLowerCase()]) evt.performed_by = userNameMap[evt.performed_by.toLowerCase()];
      if (evt.recorded_by && userNameMap[evt.recorded_by]) evt.recorded_by = userNameMap[evt.recorded_by];
      return evt;
    });

    return NextResponse.json({
      events: page,
      total,
      filtered: filtered.length,
      offset,
      limit,
      hasMore: offset + limit < filtered.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('GET /api/events error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
