/**
 * BAN-309 Pass 3a.2 PR 3 — list/create for deposit_terms.
 *
 * Per-engagement singleton (unique on (tenant_id, engagement_id)); POST 409s
 * on duplicate. No Activity Spine emission (D3 CRUD-only).
 *
 *   GET  /api/aia/deposit-terms?engagement_id=...&limit=&offset=
 *   POST /api/aia/deposit-terms
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, deposit_terms, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/deposit-terms';

const DEPOSIT_PATTERNS = new Set(['MOBILIZATION_LINE', 'SEPARATE_INVOICE', 'STORED_MATERIALS', 'NONE']);
const DRAW_DOWN = new Set(['AUTO', 'MANUAL']);

interface CreateBody {
  engagement_id?: string;
  deposit_pattern?: string;
  deposit_amount?: string | number;
  deposit_amount_pct?: string | number;
  deposit_due_date?: string;
  deposit_received_date?: string;
  draw_down_logic?: string;
}

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementId = url.searchParams.get('engagement_id');
  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id query param is required' }, { status: 400 });
  }
  const { limit, offset } = parsePagination(url);

  const rows = await db
    .select()
    .from(deposit_terms)
    .where(
      and(
        eq(deposit_terms.tenant_id, gate.tenantId),
        eq(deposit_terms.engagement_id, engagementId),
      ),
    )
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items: rows, limit, offset });
}

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementId = (body.engagement_id ?? '').trim();
  const pattern = (body.deposit_pattern ?? 'NONE').trim();
  const drawDown = (body.draw_down_logic ?? 'AUTO').trim();

  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!DEPOSIT_PATTERNS.has(pattern)) {
    return NextResponse.json(
      { error: `deposit_pattern must be one of ${[...DEPOSIT_PATTERNS].join(', ')}` },
      { status: 400 },
    );
  }
  if (!DRAW_DOWN.has(drawDown)) {
    return NextResponse.json(
      { error: `draw_down_logic must be one of ${[...DRAW_DOWN].join(', ')}` },
      { status: 400 },
    );
  }

  const eng = await db
    .select({ engagement_id: engagements.engagement_id })
    .from(engagements)
    .where(and(eq(engagements.engagement_id, engagementId), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: `engagement ${engagementId} not found` }, { status: 404 });
  }

  const existing = await db
    .select({ deposit_terms_id: deposit_terms.deposit_terms_id })
    .from(deposit_terms)
    .where(and(
      eq(deposit_terms.tenant_id, gate.tenantId),
      eq(deposit_terms.engagement_id, engagementId),
    ))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      {
        error: `deposit_terms already exists for engagement ${engagementId}; PATCH the existing row`,
        code: 'DUPLICATE_TERMS',
        deposit_terms_id: existing[0].deposit_terms_id,
      },
      { status: 409 },
    );
  }

  const inserted = await db
    .insert(deposit_terms)
    .values({
      tenant_id: gate.tenantId,
      engagement_id: engagementId,
      deposit_pattern: pattern,
      deposit_amount: body.deposit_amount != null ? String(body.deposit_amount) : null,
      deposit_amount_pct: body.deposit_amount_pct != null ? String(body.deposit_amount_pct) : null,
      deposit_due_date: body.deposit_due_date ?? null,
      deposit_received_date: body.deposit_received_date ?? null,
      draw_down_logic: drawDown,
    })
    .returning({ deposit_terms_id: deposit_terms.deposit_terms_id });

  return NextResponse.json(
    { ok: true, deposit_terms_id: inserted[0].deposit_terms_id },
    { status: 201 },
  );
}
