import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getBackendSheetId } from '@/lib/backend-config';
import {
  KB_ARTICLES_SHEET,
  getArticles,
  articleToRow,
  getSheets,
} from '@/lib/knowledge';

function isAuthorized(email?: string | null) {
  return email?.endsWith('@kulaglass.com');
}

const SHEET_ID = getBackendSheetId();

// GET — list articles
export async function GET(req: Request) {
  let authorizedUser = false;
  try {
    const session = await getServerSession();
    authorizedUser = !!isAuthorized(session?.user?.email);
  } catch {
    // Session check failed — continue as unauthenticated
  }

  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');
    const productLineFilter = searchParams.get('product_line');
    const q = searchParams.get('q');

    // Unauthenticated users only see published; authorized users see all unless ?status=published
    const publishedOnly = !authorizedUser || statusFilter === 'published';
    let articles = await getArticles(publishedOnly);

    if (productLineFilter) {
      articles = articles.filter(a => a.product_line_id === productLineFilter);
    }

    if (q) {
      const lower = q.toLowerCase();
      articles = articles.filter(a =>
        a.title.toLowerCase().includes(lower) ||
        a.symptom_terms.toLowerCase().includes(lower) ||
        a.quick_checks.toLowerCase().includes(lower) ||
        a.notes.toLowerCase().includes(lower)
      );
    }

    return NextResponse.json({ ok: true, articles });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load articles', detail: String(err) }, { status: 500 });
  }
}

// POST — create article
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!isAuthorized(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      title,
      product_line_id,
      article_type,
      status,
      field_visible,
      revision,
      symptom_terms,
      safety_level,
      stop_conditions,
      quick_checks,
      likely_causes,
      parts_tools,
      escalation,
      source_document_ids,
      owner_user,
      notes,
    } = body;

    if (!title || !product_line_id) {
      return NextResponse.json({ error: 'title and product_line_id are required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const article_id = 'ka-' + Date.now().toString(36);

    const row = articleToRow({
      article_id,
      title,
      product_line_id,
      article_type: article_type || '',
      status: status || 'draft',
      field_visible: field_visible !== undefined ? String(field_visible) : 'FALSE',
      revision: revision || '',
      symptom_terms: symptom_terms || '',
      safety_level: safety_level || '',
      stop_conditions: stop_conditions || '',
      quick_checks: quick_checks || '',
      likely_causes: likely_causes || '',
      parts_tools: parts_tools || '',
      escalation: escalation || '',
      source_document_ids: Array.isArray(source_document_ids) ? source_document_ids : [],
      last_reviewed_at: '',
      owner_user: owner_user || session?.user?.email || '',
      approved_by: '',
      published_at: '',
      created_at: now,
      updated_at: now,
      archived_at: '',
      notes: notes || '',
    });

    const sheets = getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${KB_ARTICLES_SHEET}!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });

    return NextResponse.json({ ok: true, article_id });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create article', detail: String(err) }, { status: 500 });
  }
}
