/**
 * BAN-309 Pass 3a.2 PR 3 — by-id GET + PATCH for billing_format_config.
 *
 * No DELETE (singleton; replaced via POST after row removed by ops, or via
 * recreating the engagement). No emission (D3 CRUD-only).
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, billing_format_config } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/billing-format-config/[id]';

const BILLING_FORMATS = new Set(['AIA_G702_G703', 'TEXTURA_CSV_EXPORT', 'CUSTOM_TEMPLATE', 'TM_INVOICE', 'LUMP_SUM_PROGRESS', 'MIXED']);
const INTAKE_PLATFORMS = new Set(['TEXTURA', 'DIRECT', 'OTHER']);

const PATCHABLE_FIELDS = new Set([
  'billing_format', 'gc_billing_intake_platform', 'custom_template_ref',
  'retainage_pct', 'retainage_release_trigger', 'payment_terms',
  'notarization_required', 'architect_cert_required', 'lien_waiver_required',
  'get_handling', 'stored_materials_policy',
  'gc_certifier_name', 'gc_certifier_email', 'gc_certifier_title',
  'architect_certifier_name', 'architect_certifier_email', 'architect_certifier_title',
  'billing_period_definition', 'tm_authorizations_permitted',
  'tm_billing_doc', 'pay_app_sequence_numbering',
]);

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const rows = await db
    .select()
    .from(billing_format_config)
    .where(
      and(
        eq(billing_format_config.billing_config_id, id),
        eq(billing_format_config.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `billing_format_config ${id} not found` }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
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
    if (k === 'billing_format' && typeof v === 'string' && !BILLING_FORMATS.has(v)) {
      return NextResponse.json(
        { error: `billing_format must be one of ${[...BILLING_FORMATS].join(', ')}` },
        { status: 400 },
      );
    }
    if (k === 'gc_billing_intake_platform' && typeof v === 'string' && !INTAKE_PLATFORMS.has(v)) {
      return NextResponse.json(
        { error: `gc_billing_intake_platform must be one of ${[...INTAKE_PLATFORMS].join(', ')}` },
        { status: 400 },
      );
    }
    updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no patchable fields provided' }, { status: 400 });
  }
  updates.updated_at = new Date();

  const existing = await db
    .select({ billing_config_id: billing_format_config.billing_config_id })
    .from(billing_format_config)
    .where(
      and(
        eq(billing_format_config.billing_config_id, id),
        eq(billing_format_config.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: `billing_format_config ${id} not found` }, { status: 404 });
  }

  await db
    .update(billing_format_config)
    .set(updates)
    .where(
      and(
        eq(billing_format_config.billing_config_id, id),
        eq(billing_format_config.tenant_id, gate.tenantId),
      ),
    );

  return NextResponse.json({ ok: true, billing_config_id: id });
}
