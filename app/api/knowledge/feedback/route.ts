import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getBackendSheetId } from '@/lib/backend-config';
import {
  KB_FEEDBACK_SHEET,
  KB_ARTICLES_SHEET,
  getFeedback,
  getArticleById,
  articleToRow,
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
    const { article_id, helpful, comment, submitted_by } = body;

    if (!article_id || helpful === undefined) {
      return NextResponse.json({ error: 'article_id and helpful are required' }, { status: 400 });
    }

    const feedback_id = 'kf-' + Date.now().toString(36);
    const now = new Date().toISOString();

    const sheets = getSheets();

    // Append feedback row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${KB_FEEDBACK_SHEET}!A2`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          feedback_id,
          article_id,
          String(!!helpful),
          comment || '',
          submitted_by || session?.user?.email || '',
          now,
        ]],
      },
    });

    // Increment helpful_count or not_helpful_count on article row
    const articleResult = await getArticleById(article_id);
    if (articleResult) {
      const { article, rowIndex } = articleResult;
      const updated = { ...article };
      if (helpful) {
        updated.helpful_count = (article.helpful_count || 0) + 1;
      } else {
        updated.not_helpful_count = (article.not_helpful_count || 0) + 1;
      }
      const row = articleToRow(updated);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${KB_ARTICLES_SHEET}!A${rowIndex}:M${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    }

    return NextResponse.json({ ok: true, feedback_id });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to submit feedback', detail: String(err) }, { status: 500 });
  }
}
