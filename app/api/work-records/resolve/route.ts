import { NextResponse, type NextRequest } from 'next/server';
import { requireKulaSession } from '@/lib/work-records/authz';
import { resolveWorkRecord } from '@/lib/work-records/resolver';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const kid = searchParams.get('kid') || searchParams.get('id') || '';
  if (!kid) return NextResponse.json({ error: 'kid or id query parameter required' }, { status: 400 });
  const result = await resolveWorkRecord(kid);
  return NextResponse.json(result, { status: result.found ? 200 : 404 });
}
