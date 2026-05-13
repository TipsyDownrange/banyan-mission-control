import { NextResponse, type NextRequest } from 'next/server';
import { getBusinessRule } from '@/lib/business_rules';
import { emitMCEvent } from '@/lib/events';
import { getDefaultTenantId } from '@/lib/env';
import { query, queryOne } from '@/lib/work-records/db';
import { requireKulaSession } from '@/lib/work-records/authz';

export const runtime = 'nodejs';

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function ruleNumber(key: string, effectiveDate: string): Promise<number | null> {
  try {
    const rule = await getBusinessRule(key, effectiveDate);
    return num(rule.rule_value);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const tenantId = getDefaultTenantId();
  const values: unknown[] = [tenantId];
  const where = ['tenant_id = $1'];
  const estimateId = searchParams.get('estimate_id');
  if (estimateId) { values.push(estimateId); where.push(`estimate_id = $${values.length}`); }
  values.push(Math.min(Number(searchParams.get('limit') || '100'), 500));
  const rows = await query(
    `select * from estimate_versions where ${where.join(' and ')} order by version_number desc limit $${values.length}`,
    values,
  );
  return NextResponse.json({ data: rows, total: rows.length });
}

export async function POST(req: NextRequest) {
  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tenantId = getDefaultTenantId();
  const body = await req.json() as Record<string, unknown>;
  const estimateId = String(body.estimate_id || '');
  if (!estimateId) return NextResponse.json({ error: 'estimate_id required' }, { status: 400 });

  const effectiveDate = String(body.effective_date || new Date().toISOString().slice(0, 10));
  const existing = await queryOne<{ next_version: number }>(
    'select coalesce(max(version_number), 0) + 1 as next_version from estimate_versions where tenant_id = $1 and estimate_id = $2',
    [tenantId, estimateId],
  );
  const versionNumber = Number(body.version_number || existing?.next_version || 1);
  const snapshotGetRate = body.snapshot_get_rate ?? await ruleNumber('default_get_rate_pct', effectiveDate);
  const snapshotLaborRate = body.snapshot_labor_rate ?? await ruleNumber('glazier_journeyman_burdened_rate_hourly', effectiveDate);
  const snapshotProfit = body.snapshot_profit_markup_pct ?? await ruleNumber('default_profit_pct', effectiveDate);

  const row = await queryOne(
    `insert into estimate_versions
      (estimate_id, version_number, priced_against_document_set_id, snapshot_get_rate, snapshot_labor_rate,
       snapshot_overhead_markup_pct, snapshot_profit_markup_pct, total_amount, accepted_at, frozen_at,
       tenant_id, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
     returning *`,
    [
      estimateId,
      versionNumber,
      body.priced_against_document_set_id || null,
      snapshotGetRate,
      snapshotLaborRate,
      body.snapshot_overhead_markup_pct ?? null,
      snapshotProfit,
      body.total_amount || null,
      body.accepted_at || null,
      body.frozen_at || new Date().toISOString(),
      tenantId,
      auth.user?.user_id || null,
    ],
  );

  await emitMCEvent({
    entity_kid: String(row?.estimate_version_id || estimateId),
    entity_type: 'estimate',
    event_type: 'ESTIMATE_VERSION_FROZEN',
    submitted_by: auth.email,
    origin: 'office',
  });
  return NextResponse.json({ ok: true, data: row }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json() as Record<string, unknown>;
  if (!body.estimate_version_id) return NextResponse.json({ error: 'estimate_version_id required' }, { status: 400 });
  const row = await queryOne(
    `update estimate_versions
        set accepted_at = coalesce($2, accepted_at),
            frozen_at = coalesce($3, frozen_at),
            total_amount = coalesce($4, total_amount),
            updated_by = $5,
            updated_at = now()
      where estimate_version_id = $1
      returning *`,
    [body.estimate_version_id, body.accepted_at || null, body.frozen_at || null, body.total_amount || null, auth.user?.user_id || null],
  );
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (body.accepted_at) {
    await emitMCEvent({ entity_kid: String(body.estimate_version_id), entity_type: 'estimate', event_type: 'ESTIMATE_VERSION_ACCEPTED', submitted_by: auth.email, origin: 'office' });
  }
  return NextResponse.json({ ok: true, data: row });
}
