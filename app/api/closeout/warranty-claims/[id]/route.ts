/**
 * BAN-311 Pass 3b.2 PR 3 — GET + PATCH /api/closeout/warranty-claims/{id}
 *
 * Partial update of a warranty claim's mutable fields. PATCH is partial-update:
 * only fields present in the body are updated. No Activity Spine emission
 * per BAN-311 PR 3 dispatch resolution (WARRANTY_STATE_CHANGED is bounded
 * to warranty expiration lifecycle per §8.7; per-claim activity has no
 * allocated event in the canonical 34-value enum).
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, warranty_claims } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/closeout/warranty-claims/[id]';

const TRIAGE_RESULTS = new Set([
  'KULA_RESPONSIBLE', 'MANUFACTURER_RESPONSIBLE', 'OTHER_TRADE_RESPONSIBLE',
  'OUT_OF_WARRANTY', 'DISPUTED',
]);
const RESOLUTIONS = new Set(['COMPLETED', 'REFERRED', 'WRITTEN_OFF', 'UNRESOLVED']);

const PATCHABLE_FIELDS = new Set([
  'inbound_evidence', 'reported_by', 'issue_description', 'affected_scope',
  'triage_result', 'triage_by', 'triage_at', 'triage_reasoning',
  'service_wo_id', 'back_charge_id',
  'resolution', 'resolution_evidence_drive_id', 'resolved_at',
]);

function isValidSrvKid(value: unknown): boolean {
  if (value == null) return true;
  return typeof value === 'string' && /^SRV-/.test(value.trim());
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const rows = await db
    .select()
    .from(warranty_claims)
    .where(
      and(
        eq(warranty_claims.claim_id, id),
        eq(warranty_claims.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `warranty_claim ${id} not found` }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!PATCHABLE_FIELDS.has(k)) {
      return NextResponse.json(
        { error: `field '${k}' is not patchable`, code: 'FIELD_NOT_PATCHABLE' },
        { status: 400 },
      );
    }
    if (k === 'triage_result' && typeof v === 'string' && !TRIAGE_RESULTS.has(v)) {
      return NextResponse.json(
        { error: `triage_result must be one of ${[...TRIAGE_RESULTS].join(', ')}` },
        { status: 400 },
      );
    }
    if (k === 'resolution' && typeof v === 'string' && !RESOLUTIONS.has(v)) {
      return NextResponse.json(
        { error: `resolution must be one of ${[...RESOLUTIONS].join(', ')}` },
        { status: 400 },
      );
    }
    if (k === 'service_wo_id' && !isValidSrvKid(v)) {
      return NextResponse.json(
        { error: 'service_wo_id must start with SRV-', code: 'INVALID_SERVICE_WO_ID' },
        { status: 400 },
      );
    }
    if ((k === 'triage_at' || k === 'resolved_at') && typeof v === 'string') {
      updates[k] = new Date(v);
    } else {
      updates[k] = v;
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no patchable fields provided' }, { status: 400 });
  }
  updates.updated_at = new Date();
  updates.updated_by = null; // caller's user_id not yet wired from session

  const existing = await db
    .select({ claim_id: warranty_claims.claim_id })
    .from(warranty_claims)
    .where(
      and(
        eq(warranty_claims.claim_id, id),
        eq(warranty_claims.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: `warranty_claim ${id} not found` }, { status: 404 });
  }

  await db
    .update(warranty_claims)
    .set(updates)
    .where(
      and(
        eq(warranty_claims.claim_id, id),
        eq(warranty_claims.tenant_id, gate.tenantId),
      ),
    );

  return NextResponse.json({ ok: true, claim_id: id });
}
