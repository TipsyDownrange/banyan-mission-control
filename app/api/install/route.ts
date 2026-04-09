/**
 * GET /api/install?kID=xxx
 *
 * REWIRED 2026-04-09: Install_Tracking (legacy Smartsheet backfill) removed.
 * Now reads from Install_Plans + Install_Steps + Step_Completions — the canonical tables.
 * Shape kept compatible with previous response so InstallTrackingPanel still renders.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (!rows || rows.length < 2) return [];
  const [headers, ...data] = rows;
  return data.map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h.trim()] = (row[i] || '').trim(); });
    return obj;
  });
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const kID = searchParams.get('kID') || '';

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const [plansRes, stepsRes, completionsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Install_Plans!A1:Z5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Install_Steps!A1:Z5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Step_Completions!A1:Z5000' }),
    ]);

    const plans      = rowsToObjects((plansRes.data.values || []) as string[][]);
    const steps      = rowsToObjects((stepsRes.data.values || []) as string[][]);
    const completions = rowsToObjects((completionsRes.data.values || []) as string[][]);

    // Filter plans by kID if provided
    const filteredPlans = kID
      ? plans.filter(p => p['Job_ID'] === kID || p['kID'] === kID)
      : plans;

    const planIds = new Set(filteredPlans.map(p =>
      p['Install_Plan_ID'] || p['Plan_ID'] || p['plan_id'] || ''
    ).filter(Boolean));

    const filteredSteps = steps.filter(s => {
      const planRef = s['Install_Plan_ID'] || s['Plan_ID'] || s['plan_id'] || '';
      return planIds.has(planRef);
    });

    const stepIds = new Set(filteredSteps.map(s =>
      s['Install_Step_ID'] || s['Step_ID'] || s['step_id'] || ''
    ).filter(Boolean));

    const filteredCompletions = completions.filter(c => {
      const stepRef = c['Install_Step_ID'] || c['Step_ID'] || c['step_id'] || '';
      return stepIds.has(stepRef);
    });

    // Map to the shape previously returned by Install_Tracking for compatibility
    const items = filteredSteps.map(step => {
      const stepId = step['Install_Step_ID'] || step['Step_ID'] || step['step_id'] || '';
      const plan = filteredPlans.find(p =>
        (p['Install_Plan_ID'] || p['Plan_ID'] || '') === (step['Install_Plan_ID'] || step['Plan_ID'] || '')
      );
      const comp = filteredCompletions.filter(c =>
        (c['Install_Step_ID'] || c['Step_ID'] || '') === stepId
      );
      const latestComp = comp[comp.length - 1];
      const pct = latestComp ? parseFloat(latestComp['Percent_Complete'] || '0') : 0;
      const status = latestComp
        ? (pct >= 100 ? 'Complete' : pct > 0 ? 'In Progress' : 'Not Started')
        : 'Not Started';

      return {
        install_id:     stepId,
        kID:            plan?.['Job_ID'] || plan?.['kID'] || kID,
        location_ref:   step['Location'] || plan?.['Location'] || '',
        system_type:    step['System_Type'] || plan?.['System_Type'] || '',
        system_ref:     plan?.['Assembly_ID'] || '',
        step_name:      step['Step_Name'] || step['step_name'] || '',
        step_sequence:  parseInt(step['Step_Seq'] || step['step_seq'] || '0') || 0,
        hours_assigned: parseFloat(step['Allotted_Hours'] || step['allotted_hours'] || '0') || 0,
        hours_completed: latestComp ? parseFloat(latestComp['Hours_Spent'] || '0') || 0 : 0,
        pct_complete:   pct,
        status,
        assigned_to:    step['Assigned_Crew'] || '',
        target_date:    step['Planned_End_Date'] || '',
        completed_date: latestComp?.['Completed_At']?.slice(0, 10) || '',
        qc_passed:      status === 'Complete',
        qc_notes:       latestComp?.['Notes'] || '',
        evidence_ref:   latestComp?.['Photo_URL'] || '',
      };
    });

    const projects = kID ? [kID] : [...new Set(items.map(r => r.kID).filter(Boolean))];
    const summary = projects.map(pid => {
      const pRows = items.filter(r => r.kID === pid);
      const total = pRows.length;
      const complete = pRows.filter(r => r.status === 'Complete').length;
      const inProgress = pRows.filter(r => r.status === 'In Progress').length;
      const qcPassed = pRows.filter(r => r.qc_passed).length;
      const qcFailed = 0; // no Failed QC concept in new schema
      const locations = [...new Set(pRows.map(r => r.location_ref))];
      const systems = [...new Set(pRows.map(r => r.system_type).filter(Boolean))];
      const hoursAssigned = pRows.reduce((s, r) => s + r.hours_assigned, 0);
      const hoursCompleted = pRows.reduce((s, r) => s + r.hours_completed, 0);
      return {
        kID: pid,
        totalSteps: total,
        completedSteps: complete,
        inProgressSteps: inProgress,
        notStartedSteps: total - complete - inProgress,
        qcFailed,
        pctComplete: total > 0 ? Math.round((complete / total) * 100) : 0,
        qcPassRate: complete > 0 ? Math.round((qcPassed / complete) * 100) : 0,
        locationCount: locations.length,
        locations,
        systems,
        hoursAssigned,
        hoursCompleted,
        hoursRemaining: hoursAssigned - hoursCompleted,
      };
    });

    return NextResponse.json({ items, summary, total: items.length });
  } catch (err) {
    console.error('Install tracking error:', err);
    return NextResponse.json({ error: 'Failed to load install data', detail: String(err) }, { status: 500 });
  }
}
