import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB_NAME = 'Tasks';
const HEADERS = [
  'Task_ID', 'Title', 'Detail', 'Status', 'Priority', 'Category',
  'Assigned_To', 'Created_At', 'Updated_At', 'Due_Date', 'Blocked_By', 'Parent_Task_ID',
  'Phase', 'Source', 'Sort_Order', 'Action_Log',
];
const RANGE = `${TAB_NAME}!A2:P2000`;

async function ensureTab(sheets: ReturnType<typeof google.sheets>) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets?.some(s => s.properties?.title === TAB_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB_NAME } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A1:N1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    return true;
  }
  return false;
}

function rowToTask(r: string[]) {
  return {
    id: r[0] || '',
    title: r[1] || '',
    detail: r[2] || '',
    status: r[3] || 'queued',
    priority: r[4] || 'medium',
    category: r[5] || '',
    assignedTo: r[6] || '',
    createdAt: r[7] || '',
    updatedAt: r[8] || '',
    dueDate: r[9] || '',
    blockedBy: r[10] || '',
    parentTaskId: r[11] || '',
    phase: r[12] || '',
    source: r[13] || 'manual',
    sortOrder: parseInt(r[14] || '999') || 999,
    actionLog: (() => { try { return JSON.parse(r[15] || '[]'); } catch { return []; } })(),
  };
}

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets);

    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: RANGE });
    const rows = res.data.values || [];

    if (rows.length === 0) return NextResponse.json({ tasks: [], empty: true });

    const tasks = rows.filter(r => r[0]).map(rowToTask);
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

    const rows = tasks.map((t: Record<string, string>, i: number) => [
      t.id, t.title, t.detail, t.status, t.priority, t.category,
      t.assignedTo, t.createdAt, t.updatedAt,
      t.dueDate || '', t.blockedBy || '', t.parentTaskId || '',
      t.phase || '', t.source || 'manual',
      t.sortOrder || String(i + 1),
      t.actionLog || JSON.stringify([{ ts: new Date().toISOString(), action: 'created', by: t.assignedTo || 'Sean' }]),
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A:P`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });

    return NextResponse.json({ ok: true, written: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Field → column index mapping (0-based from A)
const FIELD_COL: Record<string, number> = {
  title: 1, detail: 2, status: 3, priority: 4, category: 5,
  assignedTo: 6, createdAt: 7, updatedAt: 8,
  dueDate: 9, blockedBy: 10, parentTaskId: 11,
  phase: 12, source: 13, sortOrder: 14, actionLog: 15,
};

function colLetter(idx: number) {
  return String.fromCharCode(65 + idx);
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { task_id, ...fields } = body;

    if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: RANGE });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === task_id);

    if (rowIndex === -1) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const sheetRow = rowIndex + 2;
    const now = new Date().toISOString();
    const session = await getServerSession();
    const actor = session?.user?.name || session?.user?.email || 'Unknown';

    // Always stamp updatedAt
    const updateData: { range: string; values: string[][] }[] = [
      { range: `${TAB_NAME}!${colLetter(FIELD_COL.updatedAt)}${sheetRow}`, values: [[now.split('T')[0]]] },
    ];

    // Auto-append to action_log when status changes
    if (fields.status) {
      try {
        const existing = JSON.parse(rows[rowIndex][FIELD_COL.actionLog] || '[]');
        existing.push({ ts: now, action: `status_changed_to_${fields.status}`, by: actor });
        updateData.push({ range: `${TAB_NAME}!${colLetter(FIELD_COL.actionLog)}${sheetRow}`, values: [[JSON.stringify(existing)]] });
      } catch { console.error('[tasks PATCH] action_log parse error'); }
    }

    for (const [key, val] of Object.entries(fields)) {
      // actionLog: only skip if we auto-appended it during a status change
      if (key === 'actionLog' && fields.status) continue;
      const col = FIELD_COL[key];
      if (col !== undefined && val !== undefined) {
        updateData.push({
          range: `${TAB_NAME}!${colLetter(col)}${sheetRow}`,
          values: [[String(val)]],
        });
      }
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: updateData },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
