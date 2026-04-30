import { NextResponse } from 'next/server';
import { getArticles, getProductLines, KBProductLine } from '@/lib/knowledge';

// GET — product line summary cards with article counts
export async function GET() {
  try {
    const [productLines, articles] = await Promise.all([
      getProductLines(),
      getArticles(true), // published only for count
    ]);

    // Count articles per product_line_id
    const countMap: Record<string, number> = {};
    for (const a of articles) {
      if (a.product_line_id) {
        countMap[a.product_line_id] = (countMap[a.product_line_id] || 0) + 1;
      }
    }

    const withCounts: KBProductLine[] = productLines.map(pl => ({
      ...pl,
      article_count: countMap[pl.product_line_id] || 0,
    }));

    return NextResponse.json({ ok: true, product_lines: withCounts });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load product lines', detail: String(err) }, { status: 500 });
  }
}
