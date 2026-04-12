/**
 * POST /api/kai/feedback
 * Accepts feedback from FA and MC. Creates row in Kai_Feedback sheet.
 * No auth — called cross-origin from Field App.
 */
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { v4: uuidv4 } = require('uuid') as { v4: () => string };

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Kai_Feedback';
const HEADERS = ['feedback_id','timestamp','user_name','user_email','app','page_url','feedback_type','description','screenshot_ref','status','response'];

function getAuth() {
  const saKey = process.env.GOOGLE_SA_KEY_BASE64
    ? JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_BASE64, 'base64').toString())
    : null;
  if (!saKey) throw new Error('GOOGLE_SA_KEY_BASE64 not set');
  return new google.auth.GoogleAuth({ credentials: saKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

async function ensureTab(sheets: ReturnType<typeof google.sheets>) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets?.some(s => s.properties?.title === TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${TAB}!A1`,
      valueInputOption: 'RAW', requestBody: { values: [HEADERS] },
    });
  }
}

export async function POST(req: Request) {
  let body: { user_name?: string; user_email?: string; app?: string; page_url?: string; feedback_type?: string; description?: string; screenshot_ref?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  if (!body.description?.trim()) {
    return NextResponse.json({ error: 'description required' }, { status: 400 });
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets);

    const row = [
      uuidv4(),
      new Date().toISOString(),
      body.user_name || '',
      body.user_email || '',
      body.app || '',
      body.page_url || '',
      body.feedback_type || 'Other',
      body.description,
      body.screenshot_ref || '',
      'NEW',
      '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${TAB}!A:K`,
      valueInputOption: 'USER_ENTERED', requestBody: { values: [row] },
    });

    // Create task card in Tasks sheet for triage
    const now = new Date().toISOString();
    const feedbackLabel = body.feedback_type === 'Bug Report' ? 'BUG'
      : body.feedback_type === 'Feature Suggestion' ? 'FEATURE'
      : body.feedback_type === 'Question' ? 'QUESTION' : 'FEEDBACK';
    const taskId = `TSK-KFB-${Date.now()}`;
    const taskTitle = `[${feedbackLabel}] ${(body.description || '').slice(0, 80)}`;
    const taskDetail = `${body.description}\n\nFrom: ${body.user_name || ''} (${body.user_email || ''})\nApp: ${body.app || ''}\nPage: ${body.page_url || ''}\nSubmitted: ${now}`;
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Tasks!A:N',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[
        taskId, taskTitle, taskDetail, 'queued',
        body.feedback_type === 'Bug Report' ? 'high' : 'medium',
        'Feedback', 'Kai', now, now, '', '', '', 'Inbox', 'feedback',
      ]] },
    }).catch(e => console.error('[feedback] task card failed:', e));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[kai/feedback]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
