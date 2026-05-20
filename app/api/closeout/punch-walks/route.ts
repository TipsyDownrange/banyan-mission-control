/**
 * BAN-375 Closeout v1.1.1 Phase 1 — GET / POST /api/closeout/punch-walks
 *
 * Multi-source walkthrough aggregator (Closeout v1.1 §6.1).
 * GET: list walks by engagement_id (required query param).
 * POST: create a new walk.
 *
 * Permission: project:view for read, project:edit for write (passAiaApiGate
 * default). Engagement existence + tenant scoping is checked on POST so the
 * route returns 404 cleanly when the engagement_id doesn't resolve.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, punch_walks, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/closeout/punch-walks';

const ALLOWED_TYPES = [
  'initial', 'reinspection', 'substantial_completion',
  'owner_walkthrough', 'architect', 'final', 'internal_qa',
] as const;

interface CreateBody {
  engagement_id?: string;
  type?: string;
  walk_date?: string;
  walked_by?: string;
  attendees?: unknown[];
  notes?: string;
  status?: string;
}

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementId = url.searchParams.get('engagement_id');
  if (!engagementId) {
    return NextResponse.json(
      { error: 'engagement_id query param is required' },
      { status: 400 },
    );
  }

  const rows = await db
    .select()
    .from(punch_walks)
    .where(
      and(
        eq(punch_walks.tenant_id, gate.tenantId),
        eq(punch_walks.engagement_id, engagementId),
      ),
    )
    .orderBy(desc(punch_walks.walk_date));

  return NextResponse.json({ punch_walks: rows });
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
  const type = (body.type ?? '').trim();
  const walkDate = (body.walk_date ?? '').trim();
  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!type) {
    return NextResponse.json({ error: 'type is required' }, { status: 400 });
  }
  if (!(ALLOWED_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json(
      { error: `type must be one of ${ALLOWED_TYPES.join(', ')}`, code: 'INVALID_TYPE' },
      { status: 400 },
    );
  }
  if (!walkDate) {
    return NextResponse.json({ error: 'walk_date is required (YYYY-MM-DD)' }, { status: 400 });
  }

  // Tenant-scoped engagement check — surface 404 before insert so callers
  // don't see a Postgres FK error.
  const eng = await db
    .select({ engagement_id: engagements.engagement_id })
    .from(engagements)
    .where(and(eq(engagements.engagement_id, engagementId), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: `engagement ${engagementId} not found` }, { status: 404 });
  }

  const inserted = await db
    .insert(punch_walks)
    .values({
      tenant_id: gate.tenantId,
      engagement_id: engagementId,
      type,
      walk_date: walkDate,
      walked_by: body.walked_by ?? null,
      attendees: body.attendees ?? [],
      notes: body.notes ?? null,
      status: body.status === 'complete' ? 'complete' : 'in_progress',
    })
    .returning();

  return NextResponse.json({ ok: true, punch_walk: inserted[0] }, { status: 201 });
}
