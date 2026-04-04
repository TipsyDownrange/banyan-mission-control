import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB_NAME = 'Tasks';
const HEADERS = ['task_id', 'title', 'detail', 'status', 'priority', 'category', 'assignedTo', 'createdAt', 'updatedAt'];

async function ensureTab(sheets: ReturnType<typeof google.sheets>) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets?.some(s => s.properties?.title === TAB_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: TAB_NAME } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    return true; // tab was just created (empty)
  }
  return false;
}

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const wasCreated = await ensureTab(sheets);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A2:I500`,
    });

    const rows = res.data.values || [];

    // If tab is empty, signal client to seed
    if (rows.length === 0) {
      return NextResponse.json({ tasks: [], empty: true });
    }

    const tasks = rows
      .filter(r => r[0])
      .map(r => ({
        id: r[0] || '',
        title: r[1] || '',
        detail: r[2] || '',
        status: r[3] || 'queued',
        priority: r[4] || 'medium',
        category: r[5] || '',
        assignedTo: r[6] || '',
        createdAt: r[7] || '',
        updatedAt: r[8] || '',
      }));

    return NextResponse.json({ tasks, empty: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, tasks: [], empty: false }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tasks } = await req.json();
    if (!tasks || !Array.isArray(tasks)) {
      return NextResponse.json({ error: 'tasks array required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    await ensureTab(sheets);

    const rows = tasks.map((t: Record<string, string>) => [
      t.id, t.title, t.detail, t.status, t.priority, t.category, t.assignedTo, t.createdAt, t.updatedAt,
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A:I`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });

    return NextResponse.json({ ok: true, written: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { task_id, status } = await req.json();
    if (!task_id || !status) {
      return NextResponse.json({ error: 'task_id and status required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A2:I500`,
    });

    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === task_id);
    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    const now = new Date().toISOString().split('T')[0];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `${TAB_NAME}!D${sheetRow}`, values: [[status]] },
          { range: `${TAB_NAME}!I${sheetRow}`, values: [[now]] },
        ],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
