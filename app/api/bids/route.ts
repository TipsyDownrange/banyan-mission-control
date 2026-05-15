import { NextResponse, type NextRequest } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getDefaultTenantId } from '@/lib/env';
import { emitMCEvent } from '@/lib/events';
import { query, queryOne } from '@/lib/work-records/db';
import { requireKulaSession } from '@/lib/work-records/authz';
import { nextKid } from '@/lib/work-records/ids';

const BID_LOG_ID = '18QyNI3JPuUw_nRl2EHSUrlWItOmD8PUlu3fysrwyrcA';

async function getLegacyBids(limit: number) {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: BID_LOG_ID,
    range: `Bids!A1:Z${limit + 1}`,
  });
  const rows = result.data.values || [];
  if (rows.length === 0) return { bids: [], total: 0 };
  const headers = rows[0];
  const bids = rows.slice(1).map(row => {
    const b: Record<string, string> = {};
    headers.forEach((h, i) => { b[h as string] = row[i] || ''; });
    return b;
  });
  return { bids, total: bids.length };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source') || 'legacy';
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  if (source !== 'postgres') {
    try {
      return NextResponse.json(await getLegacyBids(limit));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg.slice(0, 300), bids: [] }, { status: 500 });
    }
  }

  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tenantId = getDefaultTenantId();
  const rows = await query(
    'select * from bids where tenant_id = $1 order by created_at desc limit $2',
    [tenantId, limit],
  );
  return NextResponse.json({ data: rows, total: rows.length });
}

export async function POST(req: NextRequest) {
  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tenantId = getDefaultTenantId();
  const body = await req.json() as Record<string, unknown>;
  const kid = String(body.kid || await nextKid('bids', 'BID', tenantId));
  const row = await queryOne(
    `insert into bids (kid, work_record_id, bid_state, estimator_id, source_channel, due_date, bid_amount, tenant_id, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning *`,
    [kid, body.work_record_id || null, body.bid_state || 'candidate', body.estimator_id || null, body.source_channel || null, body.due_date || null, body.bid_amount || null, tenantId, auth.user?.user_id || null],
  );
  return NextResponse.json({ ok: true, data: row }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json() as Record<string, unknown>;
  if (!body.bid_id) return NextResponse.json({ error: 'bid_id required' }, { status: 400 });
  const row = await queryOne(
    `update bids set
       work_record_id = coalesce($2, work_record_id),
       bid_state = coalesce($3, bid_state),
       estimator_id = coalesce($4, estimator_id),
       source_channel = coalesce($5, source_channel),
       due_date = coalesce($6, due_date),
       bid_amount = coalesce($7, bid_amount),
       updated_by = $8,
       updated_at = now()
     where bid_id = $1 returning *`,
    [body.bid_id, body.work_record_id || null, body.bid_state || null, body.estimator_id || null, body.source_channel || null, body.due_date || null, body.bid_amount || null, auth.user?.user_id || null],
  );
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (body.bid_state === 'awarded') {
    await emitMCEvent({ entity_kid: String(row.kid || body.bid_id), entity_type: 'bid', event_type: 'BID_PROMOTED', submitted_by: auth.email, origin: 'office' });
  }
  return NextResponse.json({ ok: true, data: row });
}
