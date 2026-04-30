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
    if (body.product_line_id !== undefined) updated.product_line_id = body.product_line_id;
    if (body.article_type !== undefined) updated.article_type = body.article_type;
    if (body.status !== undefined) {
      updated.status = body.status;
      if (body.status === 'published' && !article.published_at) {
        updated.published_at = now;
      }
      if (body.status === 'archived' && !article.archived_at) {
        updated.archived_at = now;
      }
    }
    if (body.field_visible !== undefined) updated.field_visible = String(body.field_visible);
    if (body.revision !== undefined) updated.revision = body.revision;
    if (body.symptom_terms !== undefined) updated.symptom_terms = body.symptom_terms;
    if (body.safety_level !== undefined) updated.safety_level = body.safety_level;
    if (body.stop_conditions !== undefined) updated.stop_conditions = body.stop_conditions;
    if (body.quick_checks !== undefined) updated.quick_checks = body.quick_checks;
    if (body.likely_causes !== undefined) updated.likely_causes = body.likely_causes;
    if (body.parts_tools !== undefined) updated.parts_tools = body.parts_tools;
    if (body.escalation !== undefined) updated.escalation = body.escalation;
    if (body.source_document_ids !== undefined) {
      updated.source_document_ids = Array.isArray(body.source_document_ids)
        ? body.source_document_ids
        : [body.source_document_ids];
    }
    if (body.last_reviewed_at !== undefined) updated.last_reviewed_at = body.last_reviewed_at;
    if (body.owner_user !== undefined) updated.owner_user = body.owner_user;
    if (body.approved_by !== undefined) updated.approved_by = body.approved_by;
    if (body.notes !== undefined) updated.notes = body.notes;

    const row = articleToRow(updated);
    const sheets = getSheets();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${KB_ARTICLES_SHEET}!A${rowIndex}:W${rowIndex}`,
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
