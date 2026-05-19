import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getBackendSheetId } from '@/lib/backend-config';
import {
  KB_FEEDBACK_SHEET,
  getFeedback,
  getSheets,
} from '@/lib/knowledge';
import {
  passKnowledgeAuthGate,
  passKnowledgeTriageGate,
} from '@/lib/knowledge/api-gate';

const SHEET_ID = getBackendSheetId();

// GET — list feedback (triage)
export async function GET(req: Request) {
  const gate = await passKnowledgeTriageGate(req);
  if (!gate.ok) return gate.response;

  try {
    const { searchParams } = new URL(req.url);
    const articleId = searchParams.get('article_id') || undefined;
    const feedback = await getFeedback(articleId);
    return NextResponse.json({ ok: true, feedback });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load feedback', detail: String(err) }, { status: 500 });
  }
}

// POST — submit feedback (any authenticated user)
export async function POST(req: Request) {
  const gate = await passKnowledgeAuthGate(req);
  if (!gate.ok) return gate.response;
  const session = await getServerSession();

  try {
    const body = await req.json();
    const { article_id, feedback_type, feedback_text, kID, slot_id } = body;

    if (!article_id || !feedback_type) {
      return NextResponse.json({ error: 'article_id and feedback_type are required' }, { status: 400 });
    }

    const feedback_id = 'kf-' + Date.now().toString(36);
    const now = new Date().toISOString();

    const sheets = getSheets();

    // Append feedback row (15 cols matching KB_Feedback canon)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${KB_FEEDBACK_SHEET}!A2`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          feedback_id,
          article_id,
          now,
          session?.user?.name || session?.user?.email || '',
          session?.user?.email || '',
          'mission_control',
          kID || '',
          slot_id || '',
          feedback_type,
          feedback_text || '',
          'open',
          '',
          '',
          '',
          '',
        ]],
      },
    });

    return NextResponse.json({ ok: true, feedback_id });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to submit feedback', detail: String(err) }, { status: 500 });
  }
}
