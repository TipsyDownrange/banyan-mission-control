import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();
const RANGE_BASE = 'Step_Templates';
const DATA_RANGE = 'Step_Templates!A2:I2000';

function isAuthorized(email?: string | null) {
  return email?.endsWith('@kulaglass.com');
}

async function getAllRows(sheets: ReturnType<typeof google.sheets>) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: DATA_RANGE,
  });
  return res.data.values || [];
}

// GET — read all templates grouped by name
export async function GET() {
  // Auth: try session, but don't block if getServerSession fails on edge
  try {
    const session = await getServerSession();
    if (session?.user?.email && !isAuthorized(session.user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    // Session check failed — allow through (SA key handles sheet auth)
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const rows = await getAllRows(sheets);

    // Group by template name; preserve order
    const templates: Record<string, { step_seq: number; step_name: string; default_hours: number; category: string; notes: string }[]> = {};
    const template_meta: Record<string, { system_type: string; manufacturer: string; installation_type: string }> = {};

    for (const r of rows) {
      if (!r[0]) continue;
      const name = r[0];
      if (!templates[name]) {
        templates[name] = [];
        // Read metadata from first row of each template (cols G, H, I)
        template_meta[name] = {
          system_type: r[6] || '',
          manufacturer: r[7] || '',
          installation_type: r[8] || '',
        };
      }
      templates[name].push({
        step_seq: parseInt(r[1]) || 0,
        step_name: r[2] || '',
        default_hours: parseFloat(r[3]) || 0,
        category: r[4] || '',
        notes: r[5] || '',
      });
    }

    return NextResponse.json({ ok: true, templates, template_meta });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load templates', detail: String(err) }, { status: 500 });
  }
}

// POST — create a new template with steps
// Body: { template_name: string, system_type?: string, manufacturer?: string, installation_type?: string, steps: { step_name, default_hours, category, notes }[] }
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!isAuthorized(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { template_name, steps = [], system_type = '', manufacturer = '', installation_type = '' } = body;
    if (!template_name) return NextResponse.json({ error: 'template_name required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Check for duplicate name
    const existing = await getAllRows(sheets);
    if (existing.some(r => r[0] === template_name)) {
      return NextResponse.json({ error: 'Template name already exists' }, { status: 409 });
    }

    // Append rows — include metadata cols G/H/I on every row
    const newRows = (steps as { step_name: string; default_hours: number; category: string; notes: string }[]).map((s, i) => [
      template_name,
      String(i + 1),
      s.step_name || '',
      String(s.default_hours || 0),
      s.category || '',
      s.notes || '',
      system_type,
      manufacturer,
      installation_type,
    ]);

    // If no steps, add a placeholder row to store the template metadata
    if (newRows.length === 0) {
      newRows.push([template_name, '', '', '', '', '', system_type, manufacturer, installation_type]);
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${RANGE_BASE}!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: newRows },
    });

    return NextResponse.json({ ok: true, template_name });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create template', detail: String(err) }, { status: 500 });
  }
}

// PUT — replace all steps for a template
// Body: { template_name: string, system_type?: string, manufacturer?: string, installation_type?: string, steps: { step_name, default_hours, category, notes }[] }
export async function PUT(req: Request) {
  const session = await getServerSession();
  if (!isAuthorized(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { template_name, steps = [] } = body;
    if (!template_name) return NextResponse.json({ error: 'template_name required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all rows, find which ones belong to this template
    const allRows = await getAllRows(sheets);

    // Preserve existing metadata if not explicitly provided
    const firstRow = allRows.find(r => r[0] === template_name);
    const system_type = body.system_type !== undefined ? body.system_type : (firstRow?.[6] || '');
    const manufacturer = body.manufacturer !== undefined ? body.manufacturer : (firstRow?.[7] || '');
    const installation_type = body.installation_type !== undefined ? body.installation_type : (firstRow?.[8] || '');

    const nonMatchingRows = allRows.filter(r => r[0] !== template_name);
    const newStepRows = (steps as { step_name: string; default_hours: number; category: string; notes: string }[]).map((s, i) => [
      template_name,
      String(i + 1),
      s.step_name || '',
      String(s.default_hours || 0),
      s.category || '',
      s.notes || '',
      system_type,
      manufacturer,
      installation_type,
    ]);

    // If no steps, keep a metadata-only row
    if (newStepRows.length === 0) {
      newStepRows.push([template_name, '', '', '', '', '', system_type, manufacturer, installation_type]);
    }

    const allNewRows = [...nonMatchingRows, ...newStepRows];

    // Clear and rewrite
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: DATA_RANGE,
    });

    if (allNewRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${RANGE_BASE}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values: allNewRows },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update template', detail: String(err) }, { status: 500 });
  }
}

// DELETE — remove all rows for a template
// Body: { template_name: string }
export async function DELETE(req: Request) {
  const session = await getServerSession();
  if (!isAuthorized(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { template_name } = body;
    if (!template_name) return NextResponse.json({ error: 'template_name required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const allRows = await getAllRows(sheets);
    const remaining = allRows.filter(r => r[0] !== template_name);

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: DATA_RANGE,
    });

    if (remaining.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${RANGE_BASE}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values: remaining },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete template', detail: String(err) }, { status: 500 });
  }
}

// PATCH — rename a template OR update template metadata (system_type, manufacturer, installation_type)
// Body (rename): { old_name: string, new_name: string }
// Body (meta update): { template_name: string, system_type?: string, manufacturer?: string, installation_type?: string }
export async function PATCH(req: Request) {
  const session = await getServerSession();
  if (!isAuthorized(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const allRows = await getAllRows(sheets);

    // Rename template
    if (body.old_name && body.new_name) {
      const { old_name, new_name } = body;
      // Check new name doesn't already exist
      if (allRows.some(r => r[0] === new_name)) {
        return NextResponse.json({ error: 'Template name already exists' }, { status: 409 });
      }

      const updatedRows = allRows.map(r => r[0] === old_name ? [new_name, ...r.slice(1)] : r);

      await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: DATA_RANGE });
      if (updatedRows.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${RANGE_BASE}!A2`,
          valueInputOption: 'RAW',
          requestBody: { values: updatedRows },
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Update template metadata (system_type, manufacturer, installation_type)
    if (body.template_name && (body.system_type !== undefined || body.manufacturer !== undefined || body.installation_type !== undefined)) {
      const { template_name } = body;

      const updatedRows = allRows.map(r => {
        if (r[0] !== template_name) return r;
        const row = [...r];
        // Pad to at least 9 cols
        while (row.length < 9) row.push('');
        if (body.system_type !== undefined) row[6] = body.system_type;
        if (body.manufacturer !== undefined) row[7] = body.manufacturer;
        if (body.installation_type !== undefined) row[8] = body.installation_type;
        return row;
      });

      await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: DATA_RANGE });
      if (updatedRows.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${RANGE_BASE}!A2`,
          valueInputOption: 'RAW',
          requestBody: { values: updatedRows },
        });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid PATCH body' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to patch template', detail: String(err) }, { status: 500 });
  }
}
