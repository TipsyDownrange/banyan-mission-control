/**
 * BAN-311 Pass 3b.2 PR 3 — POST /api/closeout/warranty-claims
 *
 * Closeout v1.1 §8.6 — Creates a warranty claim from any inbound source.
 * Per BAN-311 PR 3 dispatch resolution: NO Activity Spine emission on
 * warranty_claims CRUD. WARRANTY_STATE_CHANGED is bounded to the warranty
 * record's own ACTIVE→PARTIALLY_EXPIRED→EXPIRED expiration lifecycle per
 * §8.7; per-claim activity has its own internal triage_result/resolution
 * state captured in the row's timestamp fields (no event allocated in the
 * canonical 34-value enum).
 *
 * test_data on any related events would be inherited from the parent
 * warranty's engagement.is_test_project (PR 2 pattern); this PR emits no
 * events of its own, so the propagation is unused here.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, warranty_claims, warranties } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';

const ROUTE_PATH = '/api/closeout/warranty-claims';

const INBOUND_SOURCES = new Set(['EMAIL', 'PHONE', 'PORTAL', 'FIELD_DISCOVERY']);
const TRIAGE_RESULTS = new Set([
  'KULA_RESPONSIBLE', 'MANUFACTURER_RESPONSIBLE', 'OTHER_TRADE_RESPONSIBLE',
  'OUT_OF_WARRANTY', 'DISPUTED',
]);
const RESOLUTIONS = new Set(['COMPLETED', 'REFERRED', 'WRITTEN_OFF', 'UNRESOLVED']);

interface CreateBody {
  warranty_id?: string;
  inbound_source?: string;
  inbound_evidence?: string;
  inbound_date?: string;
  reported_by?: Record<string, unknown>;
  issue_description?: string;
  affected_scope?: string;
  triage_result?: string;
  triage_by?: string;
  triage_at?: string;
  triage_reasoning?: string;
  service_wo_id?: string;
  back_charge_id?: string;
  resolution?: string;
  resolution_evidence_drive_id?: string;
  resolved_at?: string;
}

function isValidSrvKid(value: string | null | undefined): boolean {
  if (value == null) return true;
  return typeof value === 'string' && /^SRV-/.test(value.trim());
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

  const warrantyId = (body.warranty_id ?? '').trim();
  const inboundSource = (body.inbound_source ?? '').trim();
  const inboundDate = (body.inbound_date ?? '').trim();
  const issueDescription = (body.issue_description ?? '').trim();

  if (!warrantyId) {
    return NextResponse.json({ error: 'warranty_id is required' }, { status: 400 });
  }
  if (!INBOUND_SOURCES.has(inboundSource)) {
    return NextResponse.json(
      { error: `inbound_source must be one of ${[...INBOUND_SOURCES].join(', ')}` },
      { status: 400 },
    );
  }
  if (!inboundDate) {
    return NextResponse.json({ error: 'inbound_date is required (YYYY-MM-DD)' }, { status: 400 });
  }
  if (!issueDescription) {
    return NextResponse.json({ error: 'issue_description is required' }, { status: 400 });
  }
  if (body.triage_result && !TRIAGE_RESULTS.has(body.triage_result)) {
    return NextResponse.json(
      { error: `triage_result must be one of ${[...TRIAGE_RESULTS].join(', ')}` },
      { status: 400 },
    );
  }
  if (body.resolution && !RESOLUTIONS.has(body.resolution)) {
    return NextResponse.json(
      { error: `resolution must be one of ${[...RESOLUTIONS].join(', ')}` },
      { status: 400 },
    );
  }
  // ADR-026 — service_wo_id is a text kID reference (service WOs remain in
  // Sheets). App-layer validates the SRV- prefix per ADR-013 note.
  if (body.service_wo_id && !isValidSrvKid(body.service_wo_id)) {
    return NextResponse.json(
      { error: 'service_wo_id must start with SRV-', code: 'INVALID_SERVICE_WO_ID' },
      { status: 400 },
    );
  }

  const parent = await db
    .select({
      warranty_id: warranties.warranty_id,
      engagement_id: warranties.engagement_id,
    })
    .from(warranties)
    .where(and(eq(warranties.warranty_id, warrantyId), eq(warranties.tenant_id, gate.tenantId)))
    .limit(1);
  if (parent.length === 0) {
    return NextResponse.json({ error: `warranty ${warrantyId} not found` }, { status: 404 });
  }

  const inserted = await db
    .insert(warranty_claims)
    .values({
      tenant_id: gate.tenantId,
      engagement_id: parent[0].engagement_id,
      warranty_id: warrantyId,
      inbound_source: inboundSource as 'EMAIL' | 'PHONE' | 'PORTAL' | 'FIELD_DISCOVERY',
      inbound_evidence: body.inbound_evidence ?? null,
      inbound_date: inboundDate,
      reported_by: body.reported_by ?? {},
      issue_description: issueDescription,
      affected_scope: body.affected_scope ?? null,
      triage_result: body.triage_result
        ? (body.triage_result as 'KULA_RESPONSIBLE' | 'MANUFACTURER_RESPONSIBLE' | 'OTHER_TRADE_RESPONSIBLE' | 'OUT_OF_WARRANTY' | 'DISPUTED')
        : null,
      triage_by: body.triage_by ?? null,
      triage_at: body.triage_at ? new Date(body.triage_at) : null,
      triage_reasoning: body.triage_reasoning ?? null,
      service_wo_id: body.service_wo_id ?? null,
      back_charge_id: body.back_charge_id ?? null,
      resolution: body.resolution
        ? (body.resolution as 'COMPLETED' | 'REFERRED' | 'WRITTEN_OFF' | 'UNRESOLVED')
        : null,
      resolution_evidence_drive_id: body.resolution_evidence_drive_id ?? null,
      resolved_at: body.resolved_at ? new Date(body.resolved_at) : null,
    })
    .returning({ claim_id: warranty_claims.claim_id });

  return NextResponse.json(
    { ok: true, claim_id: inserted[0].claim_id, warranty_id: warrantyId },
    { status: 201 },
  );
}
