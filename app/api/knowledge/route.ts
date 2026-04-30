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
      articles = articles.filter(a => a.product_line === productLineFilter);
    }

    if (q) {
      const lower = q.toLowerCase();
      articles = articles.filter(a =>
        a.title.toLowerCase().includes(lower) ||
        a.body.toLowerCase().includes(lower) ||
        a.tags.some(t => t.toLowerCase().includes(lower))
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
    const { title, body: articleBody, product_line, tags, status, author, parts_refs, sources } = body;

    if (!title || !articleBody || !product_line) {
      return NextResponse.json({ error: 'title, body, and product_line are required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const article_id = 'ka-' + Date.now().toString(36);

    const row = articleToRow({
      article_id,
      title,
      body: articleBody,
      product_line,
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
      status: status === 'published' ? 'published' : 'draft',
      author: author || session?.user?.email || '',
      created_at: now,
      updated_at: now,
      helpful_count: 0,
      not_helpful_count: 0,
      parts_refs: Array.isArray(parts_refs) ? parts_refs : (parts_refs ? [parts_refs] : []),
      sources: Array.isArray(sources) ? sources : (sources ? [sources] : []),
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
