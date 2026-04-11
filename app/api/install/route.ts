import { NextResponse } from 'next/server';
import { kidsMatch } from '@/lib/normalize-kid';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

function rowToInstallPlan(r: string[]) {
  return {
    install_plan_id: r[0] || '',
    job_id: r[1] || '',
    system_type: r[2] || '',
    location: r[3] || '',
    estimated_total_hours: parseFloat(r[4]) || 0,
    estimated_qty: parseInt(r[5]) || 1,
    status: r[6] || 'Active',
  };
}

function rowToInstallStep(r: string[]) {
  return {
    install_step_id: r[0] || '',
    install_plan_id: r[1] || '',
    step_seq: parseInt(r[2]) || 0,
    step_name: r[3] || '',
    allotted_hours: parseFloat(r[4]) || 0,
    acceptance_criteria: r[5] || '',
    required_photo_yn: r[6] || 'N',
    notes: r[7] || '',
    category: r[8] || '',
    planned_start_date: r[9] || '',
    planned_end_date: r[10] || '',
    assigned_crew: r[11] || '',
    predecessor_step_id: r[12] || '',
    bid_hours: r[13] ? parseFloat(r[13]) : null,
    planned_hours: r[14] ? parseFloat(r[14]) : null,
    actual_hours: r[15] ? parseFloat(r[15]) : null,
  };
}

function rowToCompletion(r: string[]) {
  return {
    step_completion_id: r[0] || '',
    install_step_id: r[1] || '',
    mark_id: r[2] || '',
    date: r[3] || '',
    crew_lead: r[4] || '',
    hours_spent: parseFloat(r[5]) || 0,
    percent_complete: parseFloat(r[6]) || 0,
    notes: r[7] || '',
    photo_urls: r[8] || '',
  };
}

function jobIdMatches(jobId: string, targetId: string): boolean {
  return kidsMatch(jobId, targetId);
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
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Install_Plans!A2:G5000',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Install_Steps!A2:P5000',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Step_Completions!A2:I5000',
      }),
    ]);

    const allPlans = (plansRes.data.values || []).map(rowToInstallPlan);
    const allSteps = (stepsRes.data.values || []).map(rowToInstallStep);
    const allCompletions = (completionsRes.data.values || []).map(rowToCompletion);

    const plans = kID
      ? allPlans.filter((plan) => jobIdMatches(plan.job_id, kID) && plan.system_type !== '__JOB_DOCS__')
      : allPlans.filter((plan) => plan.system_type !== '__JOB_DOCS__');
    const planIds = new Set(plans.map((plan) => plan.install_plan_id));
    const steps = allSteps.filter((step) => planIds.has(step.install_plan_id));
    const stepIds = new Set(steps.map((step) => step.install_step_id));
    const completions = allCompletions.filter((completion) => stepIds.has(completion.install_step_id));

    const planById = new Map(plans.map((plan) => [plan.install_plan_id, plan]));
    const completionsByStep = new Map<string, ReturnType<typeof rowToCompletion>[]>();
    for (const completion of completions) {
      const list = completionsByStep.get(completion.install_step_id) || [];
      list.push(completion);
      completionsByStep.set(completion.install_step_id, list);
    }

    const items = steps.map((step) => {
      const plan = planById.get(step.install_plan_id);
      const stepCompletions = completionsByStep.get(step.install_step_id) || [];
      const pctComplete = stepCompletions.reduce((max, completion) => Math.max(max, completion.percent_complete || 0), 0);
      const hoursCompleted = stepCompletions.reduce((sum, completion) => sum + (completion.hours_spent || 0), 0);
      const completedDate = stepCompletions
        .map((completion) => completion.date)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || '';
      return {
        install_id: step.install_step_id,
        kID: plan?.job_id || '',
        location_ref: plan?.location || '',
        system_type: plan?.system_type || '',
        system_ref: step.install_plan_id,
        step_name: step.step_name,
        step_sequence: step.step_seq,
        hours_assigned: step.bid_hours ?? step.planned_hours ?? step.allotted_hours,
        hours_completed: hoursCompleted,
        pct_complete: pctComplete,
        status: pctComplete >= 100 ? 'Complete' : pctComplete > 0 ? 'In Progress' : 'Not Started',
        assigned_to: step.assigned_crew,
        target_date: step.planned_end_date || step.planned_start_date || '',
        completed_date: pctComplete >= 100 ? completedDate : '',
        qc_passed: pctComplete >= 100,
        qc_notes: stepCompletions.map((completion) => completion.notes).filter(Boolean).join(' | '),
        evidence_ref: stepCompletions.map((completion) => completion.photo_urls).filter(Boolean).join(' | '),
      };
    });

    const projectIds = [...new Set(items.map((item) => item.kID).filter(Boolean))];
    const summary = projectIds.map((projectId) => {
      const projectItems = items.filter((item) => kidsMatch(item.kID, projectId));
      const total = projectItems.length;
      const complete = projectItems.filter((item) => item.status === 'Complete').length;
      const inProgress = projectItems.filter((item) => item.status === 'In Progress').length;
      const hoursAssigned = projectItems.reduce((sum, item) => sum + item.hours_assigned, 0);
      const hoursCompleted = projectItems.reduce((sum, item) => sum + item.hours_completed, 0);
      const locations = [...new Set(projectItems.map((item) => item.location_ref).filter(Boolean))];
      const systems = [...new Set(projectItems.map((item) => item.system_type).filter(Boolean))];
      return {
        kID: projectId,
        totalSteps: total,
        completedSteps: complete,
        inProgressSteps: inProgress,
        notStartedSteps: total - complete - inProgress,
        qcFailed: 0,
        pctComplete: total > 0 ? Math.round((complete / total) * 100) : 0,
        qcPassRate: complete > 0 ? 100 : 0,
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
