import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();
const TAB = 'Quote_Configurations';
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
];

// Column order: config_id, job_id, config_name, version, status, created_at, created_by,
//               total_amount, labor_json, materials_json, markup_pct, get_rate,
//               overhead_method, breakdown_type, notes, quote_pdf_url
const COLS = [
  'config_id', 'job_id', 'config_name', 'version', 'status', 'created_at', 'created_by',
  'total_amount', 'labor_json', 'materials_json', 'markup_pct', 'get_rate',
  'overhead_method', 'breakdown_type', 'notes', 'quote_pdf_url',
];

function rowToObj(row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  COLS.forEach((c, i) => { obj[c] = row[i] || ''; });
  return obj;
}

function objToRow(obj: Record<string, string>): string[] {
  return COLS.map(c => obj[c] || '');
}

async function getAllRows(sheets: ReturnType<typeof google.sheets>) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A1:P1000`,
  });
  const rows = result.data.values || [];
  if (rows.length < 2) return [];
  // Skip header row (row 0)
  return rows.slice(1).map(r => rowToObj(r as string[]));
}

// ─── GET: all configs for a job ──────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  try {
    const auth = getGoogleAuth(SCOPES);
    const sheets = google.sheets({ version: 'v4', auth });
    const rows = await getAllRows(sheets);
    const configs = rows.filter(r => r.job_id === jobId && r.status !== 'deleted');

    // Group by config_id, return latest version + history
    const byId: Record<string, typeof configs> = {};
    for (const c of configs) {
      if (!byId[c.config_id]) byId[c.config_id] = [];
      byId[c.config_id].push(c);
    }

    const result = Object.values(byId).map(versions => {
      const sorted = versions.sort((a, b) => parseInt(b.version) - parseInt(a.version));
      return {
        ...sorted[0],
        versions: sorted,
        versionCount: sorted.length,
      };
    });

    return NextResponse.json({ configs: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), configs: [] }, { status: 500 });
  }
}

// ─── POST: create new config (v1) ────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      job_id, config_name, total_amount, labor_json, materials_json,
      markup_pct, get_rate, overhead_method, breakdown_type, notes,
      created_by,
    } = body;

    if (!job_id || !config_name) {
      return NextResponse.json({ error: 'job_id and config_name required' }, { status: 400 });
    }

    const auth = getGoogleAuth(SCOPES);
    const sheets = google.sheets({ version: 'v4', auth });

    const config_id = `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const newRow = objToRow({
      config_id,
      job_id: String(job_id),
      config_name,
      version: '1',
      status: 'active',
      created_at: now,
      created_by: created_by || 'system',
      total_amount: String(total_amount || ''),
      labor_json: typeof labor_json === 'string' ? labor_json : JSON.stringify(labor_json || []),
      materials_json: typeof materials_json === 'string' ? materials_json : JSON.stringify(materials_json || {}),
      markup_pct: String(markup_pct || ''),
      get_rate: String(get_rate || ''),
      overhead_method: overhead_method || '',
      breakdown_type: breakdown_type || 'lump_sum',
      notes: notes || '',
      quote_pdf_url: '',
    });

    // Ensure header row exists
    const check = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A1:P1`,
    });
    if (!check.data.values || check.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [COLS] },
      });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [newRow] },
    });

    return NextResponse.json({ success: true, config_id, version: 1, config_name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}

// ─── PUT: create new version of existing config ───────────────────────────────

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const {
      config_id, total_amount, labor_json, materials_json,
      markup_pct, get_rate, overhead_method, breakdown_type, notes,
      created_by, config_name,
    } = body;

    if (!config_id) {
      return NextResponse.json({ error: 'config_id required' }, { status: 400 });
    }

    const auth = getGoogleAuth(SCOPES);
    const sheets = google.sheets({ version: 'v4', auth });

    const rows = await getAllRows(sheets);
    const existingVersions = rows.filter(r => r.config_id === config_id);
    if (existingVersions.length === 0) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    const maxVersion = Math.max(...existingVersions.map(v => parseInt(v.version) || 0));
    const newVersion = maxVersion + 1;

    // Get the latest version to copy config_name etc.
    const latest = existingVersions.sort((a, b) => parseInt(b.version) - parseInt(a.version))[0];
    const now = new Date().toISOString();

    const newRow = objToRow({
      config_id,
      job_id: latest.job_id,
      config_name: config_name || latest.config_name,
      version: String(newVersion),
      status: 'active',
      created_at: now,
      created_by: created_by || 'system',
      total_amount: String(total_amount || ''),
      labor_json: typeof labor_json === 'string' ? labor_json : JSON.stringify(labor_json || []),
      materials_json: typeof materials_json === 'string' ? materials_json : JSON.stringify(materials_json || {}),
      markup_pct: String(markup_pct || ''),
      get_rate: String(get_rate || ''),
      overhead_method: overhead_method || latest.overhead_method || '',
      breakdown_type: breakdown_type || latest.breakdown_type || 'lump_sum',
      notes: notes || '',
      quote_pdf_url: '',
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [newRow] },
    });

    return NextResponse.json({ success: true, config_id, version: newVersion });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}

// ─── DELETE: soft-delete a config ────────────────────────────────────────────

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const configId = searchParams.get('config_id');
  if (!configId) return NextResponse.json({ error: 'config_id required' }, { status: 400 });

  try {
    const auth = getGoogleAuth(SCOPES);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all rows to find which row numbers to update
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A1:P1000`,
    });
    const rows = result.data.values || [];
    if (rows.length < 2) return NextResponse.json({ success: true });

    const updates: Promise<unknown>[] = [];
    rows.slice(1).forEach((row, idx) => {
      if ((row as string[])[0] === configId) {
        // row idx+2 in sheet (1-indexed, skip header)
        updates.push(
          sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${TAB}!E${idx + 2}`,
            valueInputOption: 'RAW',
            requestBody: { values: [['deleted']] },
          })
        );
      }
    });

    await Promise.all(updates);
    return NextResponse.json({ success: true, deleted: updates.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}
