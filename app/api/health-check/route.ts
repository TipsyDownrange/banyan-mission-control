/**
 * GET /api/health-check
 * Reads every WO from Service_Work_Orders and checks cross-table consistency.
 * Returns: for each WO, whether Install_Plans, Install_Steps, Step_Completions,
 *          Dispatch_Schedule exist, and what kID format each table uses.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { normalizeKID } from '@/lib/normalize-kid';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });

  const [woRes, plansRes, stepsRes, compsRes, dispRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:E500' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Install_Plans!A2:B500' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Install_Steps!A2:B500' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Step_Completions!A2:C500' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Dispatch_Schedule!A2:C500' }),
  ]);

  const wos = (woRes.data.values || []).map(r => ({ wo_id: r[0]||'', wo_number: r[1]||'', name: r[2]||'', status: r[4]||'' })).filter(w => w.wo_id);
  const plans = (plansRes.data.values || []).map(r => ({ plan_id: r[0]||'', job_id: r[1]||'' }));
  const steps = (stepsRes.data.values || []).map(r => ({ step_id: r[0]||'', plan_id: r[1]||'' }));
  const comps = (compsRes.data.values || []).map(r => ({ comp_id: r[0]||'', step_id: r[1]||'', job_id: r[2]||'' }));
  const disp = (dispRes.data.values || []).map(r => ({ slot_id: r[0]||'', date: r[1]||'', kID: r[2]||'' }));

  const stepsByPlanId = new Map<string, string[]>();
  steps.forEach(s => {
    if (!stepsByPlanId.has(s.plan_id)) stepsByPlanId.set(s.plan_id, []);
    stepsByPlanId.get(s.plan_id)!.push(s.step_id);
  });

  const compsByStepId = new Map<string, { comp_id: string; job_id: string }[]>();
  comps.forEach(c => {
    if (!compsByStepId.has(c.step_id)) compsByStepId.set(c.step_id, []);
    compsByStepId.get(c.step_id)!.push({ comp_id: c.comp_id, job_id: c.job_id });
  });

  const results = wos.slice(0, 100).map(wo => {
    // GC-D021: always use wo_id (canonical, WO- prefixed)
    const woKID = wo.wo_id || (wo.wo_number ? 'WO-' + wo.wo_number : '');
    const woNorm = normalizeKID(woKID);

    // Plans for this WO
    const matchingPlans = plans.filter(p => normalizeKID(p.job_id) === woNorm);
    const planIds = matchingPlans.map(p => p.plan_id);

    // Steps for those plans
    const matchingStepIds: string[] = planIds.flatMap(pid => stepsByPlanId.get(pid) || []);

    // Completions for those steps
    const matchingComps = matchingStepIds.flatMap(sid => compsByStepId.get(sid) || []);

    // Dispatch slots
    const matchingSlots = disp.filter(d => normalizeKID(d.kID) === woNorm);

    // kID format checks
    const planJobIds = [...new Set(matchingPlans.map(p => p.job_id))];
    const compJobIds = [...new Set(matchingComps.map(c => c.job_id))];
    const dispKIDs = [...new Set(matchingSlots.map(d => d.kID))];

    // Mismatch: any plan job_id that doesn't exactly equal the WO kID (different format)
    const planFormatMismatch = planJobIds.some(id => id !== woKID && normalizeKID(id) === woNorm);
    const compFormatMismatch = compJobIds.some(id => id !== woKID && normalizeKID(id) === woNorm);
    const dispFormatMismatch = dispKIDs.some(id => id !== woKID && normalizeKID(id) === woNorm);

    return {
      wo_id: wo.wo_id,
      wo_number: wo.wo_number,
      name: wo.name.slice(0, 40),
      status: wo.status,
      kID_used: woKID,
      plans: {
        count: matchingPlans.length,
        job_ids: planJobIds,
        format_mismatch: planFormatMismatch,
        ok: matchingPlans.length > 0,
      },
      steps: {
        count: matchingStepIds.length,
        ok: matchingStepIds.length > 0 || matchingPlans.length === 0,
      },
      completions: {
        count: matchingComps.length,
        job_ids: compJobIds,
        format_mismatch: compFormatMismatch,
        ok: true, // completions are optional
      },
      dispatch: {
        count: matchingSlots.length,
        kIDs: dispKIDs,
        format_mismatch: dispFormatMismatch,
        ok: true, // dispatch is optional
      },
      has_mismatch: planFormatMismatch || compFormatMismatch || dispFormatMismatch,
    };
  });

  const summary = {
    total_wos: results.length,
    wos_with_plans: results.filter(r => r.plans.count > 0).length,
    wos_with_steps: results.filter(r => r.steps.count > 0).length,
    wos_with_completions: results.filter(r => r.completions.count > 0).length,
    wos_with_dispatch: results.filter(r => r.dispatch.count > 0).length,
    wos_with_mismatches: results.filter(r => r.has_mismatch).length,
  };

  return NextResponse.json({ summary, results });
}
