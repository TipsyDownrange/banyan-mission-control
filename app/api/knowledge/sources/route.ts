import { NextResponse } from 'next/server';
import { getArticleById } from '@/lib/knowledge';

// GET — get sources for an article
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
    return NextResponse.json({ ok: true, sources: result.article.sources });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load sources', detail: String(err) }, { status: 500 });
  }
}
