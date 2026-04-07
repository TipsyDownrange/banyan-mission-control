/**
 * GET /api/superintendent-scheduling
 * Returns all data needed for the Superintendent Scheduling Matrix in one call.
 *
 * Query params:
 *   from  — ISO date (default: today)
 *   days  — number of days to fetch dispatch slots (default: 28)
 *   week_offset — integer week offset from current week (default: 0)
 *
 * Returns:
 *   today_slots      — dispatch slots for today with step progress
 *   blockers         — BLOCKED step completions
 *   week_days        — array of ISO dates for the visible week (Mon–Fri)
 *   week_slots       — dispatch slots for the visible week
 *   crew             — field crew with availability bars
 *   manpower_forecast — next 4 weeks summary
 *   unscheduled_jobs  — WOs/projects that need scheduling
 *
 * POST /api/superintendent-scheduling
 * Creates a new dispatch slot.
 *
 * Body: { kID, project_name, date, assigned_crew, island, men_required, hours_estimated, notes, work_type? }
 *
 * PATCH /api/superintendent-scheduling
 * Updates an existing dispatch slot.
 *
 * Body: { slot_id, ...fields_to_update }
 *
 * DELETE /api/superintendent-scheduling
 * Deletes a dispatch slot.
 *
 * Body: { slot_id }
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const FIELD_ROLES = new Set(['glazier', 'super']);

// ─── Row parsers ─────────────────────────────────────────────────────────────

const DISPATCH_COLS = ['slot_id','date','kID','project_name','island','men_required','hours_estimated','assigned_crew','created_by','status','confirmations','work_type','notes','start_time','end_time'];
function rowToSlot(row: string[]) {
  const s: Record<string, string> = {};
  DISPATCH_COLS.forEach((c, i) => { s[c] = row[i] || ''; });
  return s;
}

function rowToStep(r: string[]) {
  return {
    install_step_id:   r[0] || '',
    install_plan_id:   r[1] || '',
    step_seq:          parseInt(r[2]) || 0,
    step_name:         r[3] || '',
    allotted_hours:    parseFloat(r[4]) || 0,
    acceptance_criteria: r[5] || '',
    required_photo_yn: r[6] || 'N',
    notes:             r[7] || '',
    category:          r[8] || '',
    planned_start_date: r[9] || '',
    planned_end_date:   r[10] || '',
    assigned_crew:      r[11] || '',
    predecessor_step_id: r[12] || '',
  };
}

function rowToPlan(r: string[]) {
  return {
    install_plan_id:        r[0] || '',
    job_id:                 r[1] || '',
    system_type:            r[2] || '',
    location:               r[3] || '',
    estimated_total_hours:  parseFloat(r[4]) || 0,
    estimated_qty:          parseInt(r[5]) || 1,
    status:                 r[6] || 'Active',
  };
}

function rowToCompletion(r: string[]) {
  return {
    step_completion_id: r[0] || '',
    install_step_id:    r[1] || '',
    mark_id:            r[2] || '',
    date:               r[3] || '',
    crew_lead:          r[4] || '',
    hours_spent:        parseFloat(r[5]) || 0,
    percent_complete:   parseInt(r[6]) || 0,
    notes:              r[7] || '',
    photo_urls:         r[8] || '',
    status:             r[9] || '',
  };
}

function rowToUser(r: string[]) {
  return {
    user_id:   r[0] || '',
    name:      r[1] || '',
    role:      r[2] || '',
    email:     r[3] || '',
    phone:     r[4] || '',
    island:    r[5] || '',
    active:    r[6] !== 'N',
  };
}

// col indices for Service_Work_Orders (0-based)
const WO_COL = {
  wo_id:        0,
  wo_number:    1,
  name:         2,
  customer:     3,
  status:       4,
  island:       5,
  assigned_to:  14,
  hours_est:    16,
  scheduled_date: 17,
};

function rowToWO(r: string[]) {
  const g = (i: number) => (r[i] || '');
  return {
    wo_id:          g(WO_COL.wo_id),
    wo_number:      g(WO_COL.wo_number),
    name:           g(WO_COL.name).split('\n')[0].substring(0, 80),
    customer:       g(WO_COL.customer),
    status:         g(WO_COL.status),
    island:         g(WO_COL.island),
    assigned_to:    g(WO_COL.assigned_to),
    hours_est:      g(WO_COL.hours_est),
    scheduled_date: g(WO_COL.scheduled_date),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Get Monday of the week containing `iso` */
function weekStart(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Get ISO dates for a Mon-Fri week starting at `mondayIso` */
function weekDays(mondayIso: string, count = 5): string[] {
  return Array.from({ length: count }, (_, i) => addDays(mondayIso, i));
}

/** Generate a slot_id like SLOT-20240415-001 */
function genSlotId(date: string, existingSlots: { slot_id: string }[]): string {
  const d = date.replace(/-/g, '');
  const prefix = `SLOT-${d}-`;
  const existing = existingSlots
    .filter(s => s.slot_id.startsWith(prefix))
    .map(s => parseInt(s.slot_id.replace(prefix, '')) || 0);
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || isoToday();
    const weekOffset = parseInt(searchParams.get('week_offset') || '0');

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Single batch request for all tabs
    const [dispatchRes, stepsRes, plansRes, completionsRes, usersRes, woRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Dispatch_Schedule!A2:O5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Install_Steps!A2:M5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Install_Plans!A2:G5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Step_Completions!A2:J5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Users_Roles!A2:G200' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:AB2000' }),
    ]);

    const allSlots = (dispatchRes.data.values || []).filter(r => r[0]).map(r => rowToSlot(r.map(String)));
    const allSteps = (stepsRes.data.values || []).filter(r => r[0]).map(r => rowToStep(r.map(String)));
    const allPlans = (plansRes.data.values || []).filter(r => r[0]).map(r => rowToPlan(r.map(String)));
    const allCompletions = (completionsRes.data.values || []).filter(r => r[0]).map(r => rowToCompletion(r.map(String)));
    const allUsers = (usersRes.data.values || []).filter(r => r[0]).map(r => rowToUser(r.map(String)));
    const allWOs = (woRes.data.values || []).filter(r => r[0]).map(r => rowToWO(r.map(String)));

    // Index helpers
    const planById = new Map(allPlans.map(p => [p.install_plan_id, p]));
    const stepsByPlanId = new Map<string, typeof allSteps>();
    allSteps.forEach(s => {
      if (!stepsByPlanId.has(s.install_plan_id)) stepsByPlanId.set(s.install_plan_id, []);
      stepsByPlanId.get(s.install_plan_id)!.push(s);
    });
    const completionsByStepId = new Map<string, typeof allCompletions>();
    allCompletions.forEach(c => {
      if (!completionsByStepId.has(c.install_step_id)) completionsByStepId.set(c.install_step_id, []);
      completionsByStepId.get(c.install_step_id)!.push(c);
    });

    // Field crew (glaziers + supers)
    const fieldCrew = allUsers.filter(u => FIELD_ROLES.has(u.role.toLowerCase()) && u.active);

    // ── Date ranges ──────────────────────────────────────────────────────────
    const today = from;
    const monday = addDays(weekStart(today), weekOffset * 7);
    const weekDates = weekDays(monday, 5); // Mon–Fri

    // ── Filter dispatch slots ─────────────────────────────────────────────────
    const todaySlots = allSlots.filter(s => s.date === today);
    const weekSlots = allSlots.filter(s => weekDates.includes(s.date));

    // ── Attach step progress ──────────────────────────────────────────────────
    function getJobProgress(kID: string) {
      if (!kID) return null;
      const jobPlans = allPlans.filter(p => p.job_id === kID && p.system_type !== '__JOB_DOCS__');
      if (!jobPlans.length) return null;
      let totalSteps = 0, completedSteps = 0, inProgressSteps = 0;
      for (const plan of jobPlans) {
        const pSteps = stepsByPlanId.get(plan.install_plan_id) || [];
        totalSteps += pSteps.length;
        for (const step of pSteps) {
          const comps = completionsByStepId.get(step.install_step_id) || [];
          const maxPct = comps.length ? Math.max(...comps.map(c => c.percent_complete)) : 0;
          if (maxPct >= 100) completedSteps++;
          else if (maxPct > 0) inProgressSteps++;
        }
      }
      return { total: totalSteps, completed: completedSteps, in_progress: inProgressSteps };
    }

    const todaySlotsWithProgress = todaySlots.map(slot => ({
      ...slot,
      progress: getJobProgress(slot.kID),
    }));

    // ── Blockers ──────────────────────────────────────────────────────────────
    const blockers = allCompletions
      .filter(c => (c.status || '').toUpperCase() === 'BLOCKED' || (c.notes || '').toUpperCase().includes('BLOCK'))
      .map(c => {
        const step = allSteps.find(s => s.install_step_id === c.install_step_id);
        const plan = step ? planById.get(step.install_plan_id) : undefined;
        return {
          ...c,
          step_name: step?.step_name || '',
          job_id: plan?.job_id || '',
          project_location: plan?.location || '',
          plan_system_type: plan?.system_type || '',
        };
      });

    // ── Unscheduled Jobs ─────────────────────────────────────────────────────
    // Active WO statuses that need scheduling
    const ACTIVE_WO_STATUSES = new Set(['in_progress', 'scheduled', 'need_schedule', 'accepted', 'open', 'active', 'pending', 'dispatched']);

    // Get kIDs/WO IDs that already have upcoming dispatch slots (next 28 days)
    const futureDate = addDays(today, 28);
    const scheduledKIDs = new Set(
      allSlots
        .filter(s => s.date >= today && s.date <= futureDate && s.kID)
        .map(s => s.kID)
    );
    const scheduledProjectNames = new Set(
      allSlots
        .filter(s => s.date >= today && s.date <= futureDate)
        .map(s => s.project_name.toLowerCase().trim())
    );

    // Filter active WOs that aren't already scheduled
    const TERMINAL_STATUSES = new Set(['closed', 'lost', 'completed', 'rejected', 'cancelled', 'invoiced', 'paid']);
    const unscheduledWOs = allWOs
      .filter(wo => {
        if (!wo.name) return false;
        const st = (wo.status || '').toLowerCase().trim();
        if (TERMINAL_STATUSES.has(st)) return false;
        // Must be an active status (or we include anything not terminal)
        if (st === '') return false;
        // Check if already scheduled
        if (wo.wo_number && scheduledKIDs.has(wo.wo_number)) return false;
        if (wo.wo_id && scheduledKIDs.has(wo.wo_id)) return false;
        if (scheduledProjectNames.has(wo.name.toLowerCase().trim())) return false;
        return true;
      })
      .slice(0, 50) // Cap at 50 to avoid huge lists
      .map(wo => ({
        type: 'wo' as const,
        id: wo.wo_number || wo.wo_id,
        kID: wo.wo_number || wo.wo_id,
        name: wo.name,
        customer: wo.customer,
        island: wo.island,
        assigned_crew: wo.assigned_to,
        hours_est: wo.hours_est,
        status: wo.status,
      }));

    // ── Crew availability ─────────────────────────────────────────────────────
    const crewAvailability = fieldCrew.map(user => {
      const bookedDays = weekDates.map(date => {
        const daySlots = weekSlots.filter(s => s.date === date);
        const booked = daySlots.some(s => {
          const crew = s.assigned_crew.split(',').map((n: string) => n.trim().toLowerCase());
          return crew.includes(user.name.toLowerCase());
        });
        return { date, booked };
      });
      return {
        user_id: user.user_id,
        name: user.name,
        role: user.role,
        island: user.island,
        booked_days: bookedDays,
      };
    });

    // ── Manpower forecast — next 4 weeks ─────────────────────────────────────
    const forecastWeeks: { week_start: string; week_end: string; needed: number; available: number; buffer: number }[] = [];
    const totalFieldCrew = fieldCrew.length;
    const forecastMonday = weekStart(today); // Always forecast from current week

    for (let w = 0; w < 4; w++) {
      const wStart = addDays(forecastMonday, w * 7);
      const wEnd = addDays(wStart, 4);
      const wDays = weekDays(wStart, 5);

      const dailyCounts = wDays.map(date => {
        const daySlots = allSlots.filter(s => s.date === date);
        const names = new Set<string>();
        daySlots.forEach(s => {
          s.assigned_crew.split(',').map((n: string) => n.trim()).filter(Boolean).forEach(n => names.add(n));
        });
        return names.size;
      });

      const stepAssignedThisWeek = new Set<string>();
      allSteps.forEach(step => {
        if (!step.planned_start_date || !step.assigned_crew) return;
        const stepStart = step.planned_start_date;
        const stepEnd = step.planned_end_date || step.planned_start_date;
        if (stepStart <= wEnd && stepEnd >= wStart) {
          step.assigned_crew.split(',').map((n: string) => n.trim()).filter(Boolean).forEach(n => stepAssignedThisWeek.add(n));
        }
      });

      const neededFromSteps = stepAssignedThisWeek.size;
      const needed = Math.max(...dailyCounts, neededFromSteps, 0);

      forecastWeeks.push({
        week_start: wStart,
        week_end: wEnd,
        needed,
        available: totalFieldCrew,
        buffer: totalFieldCrew - needed,
      });
    }

    // ── All field crew for modal picker ──────────────────────────────────────
    const crewList = fieldCrew.map(u => ({
      user_id: u.user_id,
      name: u.name,
      island: u.island,
      role: u.role,
    }));

    return NextResponse.json({
      today,
      today_slots: todaySlotsWithProgress,
      blockers,
      week_days: weekDates,
      week_start: monday,
      week_offset: weekOffset,
      week_slots: weekSlots,
      crew: crewAvailability,
      crew_list: crewList,
      manpower_forecast: forecastWeeks,
      unscheduled_jobs: unscheduledWOs,
      fetched_at: new Date().toISOString(),
    });

  } catch (err) {
    console.error('Superintendent scheduling GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ─── POST — Create dispatch slot ─────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { kID, project_name, date, assigned_crew, island, men_required, hours_estimated, notes, work_type } = body;

    if (!project_name || !date) {
      return NextResponse.json({ error: 'project_name and date are required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch existing slots to generate unique slot_id
    const existingRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Dispatch_Schedule!A2:A5000',
    });
    const existingIds = (existingRes.data.values || []).map(r => ({ slot_id: r[0] || '' }));
    const slot_id = genSlotId(date, existingIds);

    // DISPATCH_COLS order: slot_id, date, kID, project_name, island, men_required, hours_estimated, assigned_crew, created_by, status, confirmations, work_type, notes, start_time, end_time
    const newRow = [
      slot_id,
      date,
      kID || '',
      project_name,
      island || '',
      men_required || '',
      hours_estimated || '',
      Array.isArray(assigned_crew) ? assigned_crew.join(', ') : (assigned_crew || ''),
      'superintendent', // created_by
      'open',           // status
      '',               // confirmations
      work_type || '',
      notes || '',
      '',               // start_time
      '',               // end_time
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Dispatch_Schedule!A:O',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRow] },
    });

    const slotObj: Record<string, string> = {};
    DISPATCH_COLS.forEach((c, i) => { slotObj[c] = newRow[i] as string; });

    return NextResponse.json({ success: true, slot: slotObj });

  } catch (err) {
    console.error('Superintendent scheduling POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ─── PATCH — Update dispatch slot ────────────────────────────────────────────

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { slot_id, ...updates } = body;

    if (!slot_id) {
      return NextResponse.json({ error: 'slot_id is required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the row with this slot_id
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Dispatch_Schedule!A2:O5000',
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => (r[0] || '') === slot_id);

    if (rowIndex === -1) {
      return NextResponse.json({ error: `Slot ${slot_id} not found` }, { status: 404 });
    }

    // Merge updates into the existing row
    const existing = [...rows[rowIndex]];
    while (existing.length < DISPATCH_COLS.length) existing.push('');

    DISPATCH_COLS.forEach((col, i) => {
      if (col in updates) {
        const v = updates[col];
        existing[i] = Array.isArray(v) ? v.join(', ') : (v ?? existing[i]);
      }
    });

    const sheetRow = rowIndex + 2; // 1-indexed + header row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Dispatch_Schedule!A${sheetRow}:O${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [existing] },
    });

    const updated: Record<string, string> = {};
    DISPATCH_COLS.forEach((c, i) => { updated[c] = existing[i] || ''; });

    return NextResponse.json({ success: true, slot: updated });

  } catch (err) {
    console.error('Superintendent scheduling PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ─── DELETE — Remove dispatch slot ───────────────────────────────────────────

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { slot_id } = body;

    if (!slot_id) {
      return NextResponse.json({ error: 'slot_id is required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Find row
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Dispatch_Schedule!A2:A5000',
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => (r[0] || '') === slot_id);

    if (rowIndex === -1) {
      return NextResponse.json({ error: `Slot ${slot_id} not found` }, { status: 404 });
    }

    // Clear the row (can't easily delete without batchUpdate + sheetId)
    const sheetRow = rowIndex + 2;
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `Dispatch_Schedule!A${sheetRow}:O${sheetRow}`,
    });

    return NextResponse.json({ success: true, deleted_slot_id: slot_id });

  } catch (err) {
    console.error('Superintendent scheduling DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
