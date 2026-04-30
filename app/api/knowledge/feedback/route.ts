import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getBackendSheetId } from '@/lib/backend-config';
import {
  KB_FEEDBACK_SHEET,
  getFeedback,
  getSheets,
} from '@/lib/knowledge';

function isAuthorized(email?: string | null) {
  return email?.endsWith('@kulaglass.com');
}

const SHEET_ID = getBackendSheetId();

// GET — list feedback
export async function GET(req: Request) {
  const session = await getServerSession();
  if (!isAuthorized(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const articleId = searchParams.get('article_id') || undefined;
    const feedback = await getFeedback(articleId);
    return NextResponse.json({ ok: true, feedback });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load feedback', detail: String(err) }, { status: 500 });
  }
}

// POST — submit feedback
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!isAuthorized(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
