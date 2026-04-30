import { NextResponse } from 'next/server';
import { getArticleById } from '@/lib/knowledge';

// GET — get parts refs for an article
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const article_id = searchParams.get('article_id');

  if (!article_id) {
    return NextResponse.json({ error: 'article_id is required' }, { status: 400 });
  }

  try {
    const result = await getArticleById(article_id);
    if (!result) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, parts_refs: result.article.parts_refs });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load parts refs', detail: String(err) }, { status: 500 });
  }
}
