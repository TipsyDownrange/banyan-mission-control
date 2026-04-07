/**
 * GET /api/superintendent-scheduling
 * Returns all data needed for the Superintendent Scheduling Matrix in one call.
 *
 * Query params:
 *   from  — ISO date (default: today)
 *   days  — number of days to fetch dispatch slots (default: 14)
 *
 * Returns:
 *   today_slots      — dispatch slots for today with step progress
 *   blockers         — BLOCKED step completions
 *   week_slots       — dispatch slots for the 7-day window
 *   crew             — field crew with availability bars
 *   manpower_forecast — next 4 weeks summary
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
    status:             r[9] || '',  // col J — BLOCKED, COMPLETE, etc.
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
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Get ISO dates for a Mon-Fri (or Mon-Sun) week starting at `mondayIso` */
function weekDays(mondayIso: string, count = 5): string[] {
  return Array.from({ length: count }, (_, i) => addDays(mondayIso, i));
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || isoToday();
    const days = parseInt(searchParams.get('days') || '14');

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Single batch request for all tabs
    const [dispatchRes, stepsRes, plansRes, completionsRes, usersRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Dispatch_Schedule!A2:O5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Install_Steps!A2:M5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Install_Plans!A2:G5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Step_Completions!A2:J5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Users_Roles!A2:G200' }),
    ]);

    const allSlots = (dispatchRes.data.values || []).filter(r => r[0]).map(r => rowToSlot(r.map(String)));
    const allSteps = (stepsRes.data.values || []).filter(r => r[0]).map(r => rowToStep(r.map(String)));
    const allPlans = (plansRes.data.values || []).filter(r => r[0]).map(r => rowToPlan(r.map(String)));
    const allCompletions = (completionsRes.data.values || []).filter(r => r[0]).map(r => rowToCompletion(r.map(String)));
    const allUsers = (usersRes.data.values || []).filter(r => r[0]).map(r => rowToUser(r.map(String)));

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
    const toDate = addDays(from, days);
    const monday = weekStart(today);
    const weekDates = weekDays(monday, 7); // Mon–Sun

    // ── Filter dispatch slots ─────────────────────────────────────────────────
    const fromD = new Date(from);
    const toD = new Date(toDate);

    const windowSlots = allSlots.filter(s => {
      const d = new Date(s.date + 'T12:00:00');
      return d >= fromD && d <= toD;
    });

    const todaySlots = allSlots.filter(s => s.date === today);

    // ── Attach step progress to each today slot ───────────────────────────────
    function getJobProgress(kID: string) {
      if (!kID) return null;
      const jobPlans = allPlans.filter(p => p.job_id === kID && p.system_type !== '__JOB_DOCS__');
      if (!jobPlans.length) return null;
      let totalSteps = 0;
      let completedSteps = 0;
      let inProgressSteps = 0;
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

    // ── Week slots grouped for matrix ─────────────────────────────────────────
    const weekSlots = allSlots.filter(s => weekDates.includes(s.date));

    // ── Crew availability ─────────────────────────────────────────────────────
    // For each field crew member, show which days in weekDates they're booked
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

    for (let w = 0; w < 4; w++) {
      const wStart = addDays(monday, w * 7);
      const wEnd = addDays(wStart, 4);
      const wDays = weekDays(wStart, 5);

      // Count max daily crew needed across the week
      const dailyCounts = wDays.map(date => {
        const daySlots = allSlots.filter(s => s.date === date);
        // Count unique crew names
        const names = new Set<string>();
        daySlots.forEach(s => {
          s.assigned_crew.split(',').map((n: string) => n.trim()).filter(Boolean).forEach(n => names.add(n));
        });
        return names.size;
      });

      // Also count from step assignments for this week
      const stepAssignedThisWeek = new Set<string>();
      allSteps.forEach(step => {
        if (!step.planned_start_date || !step.assigned_crew) return;
        const stepStart = step.planned_start_date;
        const stepEnd = step.planned_end_date || step.planned_start_date;
        // Check if step overlaps with this week
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

    return NextResponse.json({
      today: today,
      today_slots: todaySlotsWithProgress,
      blockers,
      week_days: weekDates,
      week_slots: weekSlots,
      crew: crewAvailability,
      manpower_forecast: forecastWeeks,
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
