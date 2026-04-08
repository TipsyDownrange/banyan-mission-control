import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface GoldDataEntry {
  system_type: string;
  step_name: string;
  step_category: string;
  avg_hours: number;
  sample_count: number;
  min_hours: number;
  max_hours: number;
  avg_allotted: number;
  avg_delta: number; // actual - estimated (positive = over estimate)
  last_updated: string;
}

export interface GoldDataSummary {
  total_templates: number;
  templates_with_data: number;
  most_accurate: { template: string; avg_abs_delta: number } | null;
  needs_review: { template: string; avg_delta: number } | null;
  last_computed: string;
  by_step: GoldDataEntry[];
  by_category: {
    system_type: string;
    step_category: string;
    avg_hours: number;
    sample_count: number;
    min_hours: number;
    max_hours: number;
    avg_delta: number;
    last_updated: string;
  }[];
}

// ─── GET: Read computed gold data from Production_Rates ───────────────────────
export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Read Production_Rates tab
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Production_Rates!A2:K5000',
    });
    const rows = res.data.values || [];

    const byStep: GoldDataEntry[] = [];
    const byCategory: GoldDataSummary['by_category'] = [];

    for (const r of rows) {
      if (!r[0]) continue;
      const rowType = r[1] || ''; // 'step' or 'category'

      if (rowType === 'step') {
        byStep.push({
          system_type: r[0] || '',
          step_name: r[2] || '',
          step_category: r[3] || '',
          avg_hours: parseFloat(r[4]) || 0,
          sample_count: parseInt(r[5]) || 0,
          min_hours: parseFloat(r[6]) || 0,
          max_hours: parseFloat(r[7]) || 0,
          avg_allotted: parseFloat(r[8]) || 0,
          avg_delta: parseFloat(r[9]) || 0,
          last_updated: r[10] || '',
        });
      } else if (rowType === 'category') {
        byCategory.push({
          system_type: r[0] || '',
          step_category: r[2] || '',
          avg_hours: parseFloat(r[4]) || 0,
          sample_count: parseInt(r[5]) || 0,
          min_hours: parseFloat(r[6]) || 0,
          max_hours: parseFloat(r[7]) || 0,
          avg_delta: parseFloat(r[9]) || 0,
          last_updated: r[10] || '',
        });
      }
    }

    // Build template-level summary from by_step
    const templateMap: Record<string, { totalAbsDelta: number; totalDelta: number; count: number }> = {};
    for (const entry of byStep) {
      const key = entry.system_type;
      if (!templateMap[key]) templateMap[key] = { totalAbsDelta: 0, totalDelta: 0, count: 0 };
      templateMap[key].totalAbsDelta += Math.abs(entry.avg_delta);
      templateMap[key].totalDelta += entry.avg_delta;
      templateMap[key].count += 1;
    }

    let mostAccurate: GoldDataSummary['most_accurate'] = null;
    let needsReview: GoldDataSummary['needs_review'] = null;

    for (const [template, stats] of Object.entries(templateMap)) {
      if (stats.count === 0) continue;
      const avgAbsDelta = stats.totalAbsDelta / stats.count;
      const avgDelta = stats.totalDelta / stats.count;

      if (!mostAccurate || avgAbsDelta < mostAccurate.avg_abs_delta) {
        mostAccurate = { template, avg_abs_delta: avgAbsDelta };
      }
      if (!needsReview || Math.abs(avgDelta) > Math.abs(needsReview.avg_delta)) {
        needsReview = { template, avg_delta: avgDelta };
      }
    }

    const templatesWithData = Object.keys(templateMap).length;

    return NextResponse.json({
      ok: true,
      summary: {
        total_templates: 0, // filled in by frontend from step-templates API
        templates_with_data: templatesWithData,
        most_accurate: mostAccurate,
        needs_review: needsReview,
        last_computed: rows.length > 0 ? (rows[rows.length - 1][10] || '') : '',
        by_step: byStep,
        by_category: byCategory,
      } as Omit<GoldDataSummary, 'total_templates'> & { total_templates: number },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load gold data', detail: String(err) }, { status: 500 });
  }
}

// ─── POST: Compute gold data from raw sheets and write to Production_Rates ────
export async function POST() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Read Step_Completions: A=Step_Completion_ID, B=Install_Step_ID, C=Mark_ID, D=Date, E=Crew_Lead, F=Hours_Spent, G=Percent_Complete, H=Notes
    const compRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Step_Completions!A2:H5000',
    });
    const completions = (compRes.data.values || []).filter(r => r[0] && r[1] && r[5]);

    if (completions.length === 0) {
      return NextResponse.json({ ok: true, message: 'No completions found', by_step: [], by_category: [] });
    }

    // 2. Read Install_Steps: A=Install_Step_ID, B=Install_Plan_ID, C=Step_Seq, D=Step_Name, E=Allotted_Hours, F=..., G=..., H=Category
    const stepRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Install_Steps!A2:H5000',
    });
    const installSteps = stepRes.data.values || [];

    // Build map: Install_Step_ID -> { step_name, allotted_hours, category, install_plan_id }
    const stepMap: Record<string, { step_name: string; allotted_hours: number; category: string; install_plan_id: string }> = {};
    for (const r of installSteps) {
      if (!r[0]) continue;
      stepMap[r[0]] = {
        step_name: r[3] || '',
        allotted_hours: parseFloat(r[4]) || 0,
        category: r[7] || '',
        install_plan_id: r[1] || '',
      };
    }

    // 3. Read Install_Plans: A=Install_Plan_ID, B=Job_ID, C=System_Type
    const planRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Install_Plans!A2:C5000',
    });
    const installPlans = planRes.data.values || [];

    // Build map: Install_Plan_ID -> system_type
    const planMap: Record<string, string> = {};
    for (const r of installPlans) {
      if (!r[0]) continue;
      planMap[r[0]] = r[2] || 'Unknown';
    }

    // 4. Join: completion -> install_step -> install_plan -> system_type
    interface JoinedRow {
      system_type: string;
      step_name: string;
      category: string;
      hours_spent: number;
      allotted_hours: number;
    }
    const joined: JoinedRow[] = [];

    for (const comp of completions) {
      const install_step_id = comp[1];
      const hours_spent = parseFloat(comp[5]) || 0;
      if (hours_spent <= 0) continue;

      const step = stepMap[install_step_id];
      if (!step) continue;

      const system_type = planMap[step.install_plan_id];
      if (!system_type) continue;

      joined.push({
        system_type,
        step_name: step.step_name,
        category: step.category,
        hours_spent,
        allotted_hours: step.allotted_hours,
      });
    }

    // 5. Group by (system_type, step_name) for per-step rates
    const stepAgg: Record<string, { hours: number[]; allotted: number[] }> = {};
    for (const row of joined) {
      const key = `${row.system_type}|||${row.step_name}`;
      if (!stepAgg[key]) stepAgg[key] = { hours: [], allotted: [] };
      stepAgg[key].hours.push(row.hours_spent);
      stepAgg[key].allotted.push(row.allotted_hours);
    }

    // 6. Group by (system_type, category) for category rates
    const catAgg: Record<string, { hours: number[]; allotted: number[]; category: string }> = {};
    for (const row of joined) {
      if (!row.category) continue;
      const key = `${row.system_type}|||${row.category}`;
      if (!catAgg[key]) catAgg[key] = { hours: [], allotted: [], category: row.category };
      catAgg[key].hours.push(row.hours_spent);
      catAgg[key].allotted.push(row.allotted_hours);
    }

    const now = new Date().toISOString();

    // 7. Build output rows for Production_Rates
    // Format: system_type | row_type(step/category) | name | category | avg_hours | sample_count | min_hours | max_hours | avg_allotted | avg_delta | last_updated
    const outputRows: string[][] = [];
    const byStep: GoldDataEntry[] = [];

    for (const [key, agg] of Object.entries(stepAgg)) {
      const [system_type, step_name] = key.split('|||');
      const n = agg.hours.length;
      const avg_hours = agg.hours.reduce((a, b) => a + b, 0) / n;
      const min_hours = Math.min(...agg.hours);
      const max_hours = Math.max(...agg.hours);
      const avg_allotted = agg.allotted.reduce((a, b) => a + b, 0) / n;
      const avg_delta = avg_hours - avg_allotted;

      // Need category — pull from first joined row
      const firstRow = joined.find(j => j.system_type === system_type && j.step_name === step_name);
      const category = firstRow?.category || '';

      const entry: GoldDataEntry = {
        system_type,
        step_name,
        step_category: category,
        avg_hours,
        sample_count: n,
        min_hours,
        max_hours,
        avg_allotted,
        avg_delta,
        last_updated: now,
      };
      byStep.push(entry);

      outputRows.push([
        system_type,
        'step',
        step_name,
        category,
        avg_hours.toFixed(2),
        String(n),
        min_hours.toFixed(2),
        max_hours.toFixed(2),
        avg_allotted.toFixed(2),
        avg_delta.toFixed(2),
        now,
      ]);
    }

    const byCategory: GoldDataSummary['by_category'] = [];
    for (const [key, agg] of Object.entries(catAgg)) {
      const [system_type] = key.split('|||');
      const n = agg.hours.length;
      const avg_hours = agg.hours.reduce((a, b) => a + b, 0) / n;
      const min_hours = Math.min(...agg.hours);
      const max_hours = Math.max(...agg.hours);
      const avg_allotted = agg.allotted.reduce((a, b) => a + b, 0) / n;
      const avg_delta = avg_hours - avg_allotted;

      byCategory.push({
        system_type,
        step_category: agg.category,
        avg_hours,
        sample_count: n,
        min_hours,
        max_hours,
        avg_delta,
        last_updated: now,
      });

      outputRows.push([
        system_type,
        'category',
        agg.category,
        agg.category,
        avg_hours.toFixed(2),
        String(n),
        min_hours.toFixed(2),
        max_hours.toFixed(2),
        avg_allotted.toFixed(2),
        avg_delta.toFixed(2),
        now,
      ]);
    }

    // 8. Write to Production_Rates tab (clear and rewrite)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: 'Production_Rates!A2:K5000',
    });

    if (outputRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: 'Production_Rates!A2',
        valueInputOption: 'RAW',
        requestBody: { values: outputRows },
      });
    }

    return NextResponse.json({ ok: true, by_step: byStep, by_category: byCategory, computed_at: now });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to compute gold data', detail: String(err) }, { status: 500 });
  }
}

// ─── PATCH: Update a single step's default_hours in Step_Templates ────────────
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { template_name, step_name, new_default_hours } = body;

    if (!template_name || !step_name || new_default_hours == null) {
      return NextResponse.json({ error: 'template_name, step_name, and new_default_hours required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Read Step_Templates
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Step_Templates!A2:F5000',
    });
    const rows = res.data.values || [];

    // Update matching row
    let updated = false;
    const newRows = rows.map(r => {
      if (r[0] === template_name && r[2] === step_name) {
        updated = true;
        return [r[0], r[1], r[2], String(new_default_hours), r[4] || '', r[5] || ''];
      }
      return r;
    });

    if (!updated) {
      return NextResponse.json({ error: 'Step not found in template' }, { status: 404 });
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: 'Step_Templates!A2:F5000',
    });

    if (newRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: 'Step_Templates!A2',
        valueInputOption: 'RAW',
        requestBody: { values: newRows },
      });
    }

    return NextResponse.json({ ok: true, updated_step: step_name, new_default_hours });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update step default hours', detail: String(err) }, { status: 500 });
  }
}
