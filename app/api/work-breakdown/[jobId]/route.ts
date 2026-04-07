import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ─── Column mappings ─────────────────────────────────────────────────────────
// Install_Plans: A=Install_Plan_ID, B=Job_ID, C=System_Type, D=Location,
//   E=Estimated_Total_Hours, F=Estimated_Qty, G=Status
// Install_Steps: A=Install_Step_ID, B=Install_Plan_ID, C=Step_Seq,
//   D=Step_Name, E=Allotted_Hours, F=Acceptance_Criteria, G=Required_Photo_YN
// Step_Completions: A=Step_Completion_ID, B=Install_Step_ID, C=Mark_ID,
//   D=Date, E=Crew_Lead, F=Hours_Spent, G=Percent_Complete, H=Notes, I=Photo_URLs

interface BulkTemplateStep {
  name: string;
  allotted_hours: number;
  acceptance_criteria?: string;
  required_photo_yn?: string;
}

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
    percent_complete: parseInt(r[6]) || 0,
    notes: r[7] || '',
    photo_urls: r[8] || '',
  };
}

async function getSheets() {
  const auth = getGoogleAuth(SCOPES);
  return google.sheets({ version: 'v4', auth });
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;

  try {
    const sheets = await getSheets();

    const [plansRes, stepsRes, completionsRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Install_Plans!A2:G5000',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Install_Steps!A2:G5000',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Step_Completions!A2:I5000',
      }),
    ]);

    const allPlans = (plansRes.data.values || []).map(rowToInstallPlan);
    const allSteps = (stepsRes.data.values || []).map(rowToInstallStep);
    const allCompletions = (completionsRes.data.values || []).map(rowToCompletion);

    // Extract docs from special __JOB_DOCS__ plan row
    const docsRow = allPlans.find(p => p.job_id === jobId && p.system_type === '__JOB_DOCS__');
    let docs = { install_instructions: '', msds: '', drawings: '' };
    if (docsRow) {
      try {
        docs = JSON.parse(docsRow.location);
      } catch {}
    }

    // Filter out __JOB_DOCS__ plans from the main list
    const plans = allPlans.filter(p => p.job_id === jobId && p.system_type !== '__JOB_DOCS__');
    const planIds = new Set(plans.map(p => p.install_plan_id));
    const steps = allSteps.filter(s => planIds.has(s.install_plan_id));
    const stepIds = new Set(steps.map(s => s.install_step_id));
    const completions = allCompletions.filter(c => stepIds.has(c.install_step_id));

    return NextResponse.json({ plans, steps, completions, docs });
  } catch (err) {
    console.error('Work breakdown GET error:', err);
    return NextResponse.json({ error: 'Failed to load work breakdown', detail: String(err) }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;
  const body = await req.json();
  const { type } = body;

  try {
    const sheets = await getSheets();

    if (type === 'plan') {
      const { system_type, location, estimated_total_hours, estimated_qty } = body;
      const newId = `IP-${jobId}-${Date.now()}`;
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Install_Plans!A:G',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newId, jobId, system_type || '', location || '', estimated_total_hours || 0, estimated_qty || 1, 'Active']],
        },
      });
      return NextResponse.json({ install_plan_id: newId });
    }

    if (type === 'step') {
      const { install_plan_id, step_seq, step_name, allotted_hours, acceptance_criteria, required_photo_yn } = body;
      const newId = `IS-${Date.now()}`;
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Install_Steps!A:G',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newId, install_plan_id, step_seq || 1, step_name || '', allotted_hours || 0, acceptance_criteria || '', required_photo_yn || 'N']],
        },
      });
      return NextResponse.json({ install_step_id: newId });
    }

    if (type === 'completion') {
      const { install_step_id, mark_id, date, crew_lead, hours_spent, percent_complete, notes, photo_urls } = body;
      const newId = `SC-${Date.now()}`;
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Step_Completions!A:I',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newId, install_step_id, mark_id || '', date || '', crew_lead || '', hours_spent || 0, percent_complete || 0, notes || '', photo_urls || '']],
        },
      });
      return NextResponse.json({ step_completion_id: newId });
    }

    // ─── Bulk create: N openings × M steps ────────────────────────────────────
    if (type === 'bulk') {
      const { system_type, location_prefix, id_prefix, start, end, template_steps } = body as {
        system_type: string;
        location_prefix: string;
        id_prefix: string;
        start: number;
        end: number;
        template_steps: BulkTemplateStep[];
      };

      if (!system_type || !id_prefix || start < 0 || end < start) {
        return NextResponse.json({ error: 'Invalid bulk params' }, { status: 400 });
      }

      const ts = Date.now();
      const planRows: (string | number)[][] = [];
      const stepRows: (string | number)[][] = [];
      const planIds: string[] = [];

      for (let num = start; num <= end; num++) {
        const planId = `IP-${jobId}-${ts}-${num}`;
        planIds.push(planId);
        const openingLabel = location_prefix
          ? `${location_prefix} - ${id_prefix} ${num}`
          : `${id_prefix} ${num}`;

        planRows.push([planId, jobId, system_type, openingLabel, 0, 1, 'Active']);

        if (Array.isArray(template_steps)) {
          template_steps.forEach((step, si) => {
            const stepId = `IS-${ts}-${num}-${si}`;
            stepRows.push([
              stepId,
              planId,
              si + 1,
              step.name || '',
              step.allotted_hours || 0,
              step.acceptance_criteria || '',
              step.required_photo_yn || 'N',
            ]);
          });
        }
      }

      // Batch append all plans in 2 calls
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Install_Plans!A:G',
        valueInputOption: 'RAW',
        requestBody: { values: planRows },
      });

      if (stepRows.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'Install_Steps!A:G',
          valueInputOption: 'RAW',
          requestBody: { values: stepRows },
        });
      }

      return NextResponse.json({ created: planIds.length, plans: planIds });
    }

    // ─── Docs: save job document links ────────────────────────────────────────
    if (type === 'docs') {
      const { install_instructions, msds, drawings } = body;
      const docsJson = JSON.stringify({
        install_instructions: install_instructions || '',
        msds: msds || '',
        drawings: drawings || '',
      });

      // Check if __JOB_DOCS__ row already exists for this job
      const plansRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Install_Plans!A2:G5000',
      });
      const rows = plansRes.data.values || [];
      const existingIdx = rows.findIndex(r => r[1] === jobId && r[2] === '__JOB_DOCS__');

      if (existingIdx !== -1) {
        const sheetRow = existingIdx + 2; // 1-indexed + header
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `Install_Plans!A${sheetRow}:G${sheetRow}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[rows[existingIdx][0], jobId, '__JOB_DOCS__', docsJson, 0, 1, 'Active']],
          },
        });
      } else {
        const newId = `IP-${jobId}-DOCS`;
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'Install_Plans!A:G',
          valueInputOption: 'RAW',
          requestBody: {
            values: [[newId, jobId, '__JOB_DOCS__', docsJson, 0, 1, 'Active']],
          },
        });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err) {
    console.error('Work breakdown POST error:', err);
    return NextResponse.json({ error: 'Failed to save', detail: String(err) }, { status: 500 });
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await params; // consumed but not needed for PATCH
  const body = await req.json();
  const { type, id, ...fields } = body;

  try {
    const sheets = await getSheets();

    if (type === 'plan') {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Install_Plans!A2:G5000',
      });
      const rows = res.data.values || [];
      const rowIdx = rows.findIndex(r => r[0] === id);
      if (rowIdx === -1) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

      const sheetRow = rowIdx + 2;
      const existing = rows[rowIdx];
      const updated = [
        id,
        existing[1],
        fields.system_type ?? existing[2],
        fields.location ?? existing[3],
        fields.estimated_total_hours ?? existing[4],
        fields.estimated_qty ?? existing[5],
        fields.status ?? existing[6],
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Install_Plans!A${sheetRow}:G${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [updated] },
      });
      return NextResponse.json({ ok: true });
    }

    if (type === 'step') {
      // Find the row in Install_Steps
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Install_Steps!A2:G5000',
      });
      const rows = res.data.values || [];
      const rowIdx = rows.findIndex(r => r[0] === id);
      if (rowIdx === -1) return NextResponse.json({ error: 'Step not found' }, { status: 404 });

      const sheetRow = rowIdx + 2; // 1-indexed + header
      const existing = rows[rowIdx];
      const updated = [
        id,
        existing[1],
        fields.step_seq ?? existing[2],
        fields.step_name ?? existing[3],
        fields.allotted_hours ?? existing[4],
        fields.acceptance_criteria ?? existing[5],
        fields.required_photo_yn ?? existing[6],
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Install_Steps!A${sheetRow}:G${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [updated] },
      });
      return NextResponse.json({ ok: true });
    }

    if (type === 'completion') {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Step_Completions!A2:I5000',
      });
      const rows = res.data.values || [];
      const rowIdx = rows.findIndex(r => r[0] === id);
      if (rowIdx === -1) return NextResponse.json({ error: 'Completion not found' }, { status: 404 });

      const sheetRow = rowIdx + 2;
      const existing = rows[rowIdx];
      const updated = [
        id,
        existing[1],
        fields.mark_id ?? existing[2],
        fields.date ?? existing[3],
        fields.crew_lead ?? existing[4],
        fields.hours_spent ?? existing[5],
        fields.percent_complete ?? existing[6],
        fields.notes ?? existing[7],
        fields.photo_urls ?? existing[8],
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Step_Completions!A${sheetRow}:I${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [updated] },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err) {
    console.error('Work breakdown PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update', detail: String(err) }, { status: 500 });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await params;
  const { type, id } = await req.json();

  try {
    const sheets = await getSheets();

    if (type === 'step') {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Install_Steps!A2:G5000',
      });
      const rows = res.data.values || [];
      const rowIdx = rows.findIndex(r => r[0] === id);
      if (rowIdx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const sheetRow = rowIdx + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Install_Steps!A${sheetRow}:G${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [['', '', '', '', '', '', '']] },
      });
      return NextResponse.json({ ok: true });
    }

    if (type === 'plan') {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Install_Plans!A2:G5000',
      });
      const rows = res.data.values || [];
      const rowIdx = rows.findIndex(r => r[0] === id);
      if (rowIdx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const sheetRow = rowIdx + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Install_Plans!A${sheetRow}:G${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [['', '', '', '', '', '', '']] },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err) {
    console.error('Work breakdown DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete', detail: String(err) }, { status: 500 });
  }
}
