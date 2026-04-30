import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getBackendSheetId } from '@/lib/backend-config';
import {
  KB_ARTICLES_SHEET,
  getArticleById,
  articleToRow,
  getSheets,
  KBArticle,
} from '@/lib/knowledge';

function isAuthorized(email?: string | null) {
  return email?.endsWith('@kulaglass.com');
}

const SHEET_ID = getBackendSheetId();

// GET — fetch single article
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ articleId: string }> }
) {
  const { articleId } = await params;
  try {
    const result = await getArticleById(articleId);
    if (!result) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, article: result.article });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch article', detail: String(err) }, { status: 500 });
  }
}

// PATCH — update article
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ articleId: string }> }
) {
  const session = await getServerSession();
  if (!isAuthorized(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { articleId } = await params;

  try {
    const body = await req.json();
    const result = await getArticleById(articleId);
    if (!result) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const { article, rowIndex } = result;
    const now = new Date().toISOString();

    // Merge patch fields
    const updated: KBArticle = {
      ...article,
      updated_at: now,
    };

    if (body.title !== undefined) updated.title = body.title;
    if (body.body !== undefined) updated.body = body.body;
    if (body.product_line !== undefined) updated.product_line = body.product_line;
    if (body.tags !== undefined) {
      updated.tags = Array.isArray(body.tags) ? body.tags : [body.tags];
    }
    if (body.status !== undefined) updated.status = body.status;
    if (body.parts_refs !== undefined) {
      updated.parts_refs = Array.isArray(body.parts_refs) ? body.parts_refs : [body.parts_refs];
    }
    if (body.sources !== undefined) {
      updated.sources = Array.isArray(body.sources) ? body.sources : [body.sources];
    }

    const row = articleToRow(updated);
    const sheets = getSheets();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${KB_ARTICLES_SHEET}!A${rowIndex}:M${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update article', detail: String(err) }, { status: 500 });
  }
}

// DELETE — delete article
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ articleId: string }> }
) {
  const session = await getServerSession();
  if (!isAuthorized(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { articleId } = await params;

  try {
    const result = await getArticleById(articleId);
    if (!result) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const { rowIndex } = result;

    // Get the sheet ID (numeric sheetId) for the KB_Articles tab
    const sheets = getSheets();
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheet = (spreadsheet.data.sheets || []).find(
      s => s.properties?.title === KB_ARTICLES_SHEET
    );
    const sheetId = sheet?.properties?.sheetId;

    if (sheetId === undefined || sheetId === null) {
      return NextResponse.json({ error: 'Sheet not found' }, { status: 404 });
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete article', detail: String(err) }, { status: 500 });
  }
}
