/**
 * BAN-309 Pass 3a.2 PR 3 — list/create for billing_format_config.
 *
 * Per-engagement singleton (unique on (tenant_id, engagement_id)). POST 409s
 * on duplicate. No Activity Spine emission (D3 CRUD-only).
 *
 *   GET  /api/aia/billing-format-config?engagement_id=...
 *   POST /api/aia/billing-format-config
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, billing_format_config, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/billing-format-config';

const BILLING_FORMATS = new Set(['AIA_G702_G703', 'TEXTURA_CSV_EXPORT', 'CUSTOM_TEMPLATE', 'TM_INVOICE', 'LUMP_SUM_PROGRESS', 'MIXED']);
const INTAKE_PLATFORMS = new Set(['TEXTURA', 'DIRECT', 'OTHER']);

interface CreateBody {
  engagement_id?: string;
  billing_format?: string;
  gc_billing_intake_platform?: string;
  custom_template_ref?: string;
  retainage_pct?: string | number;
  retainage_release_trigger?: string;
  payment_terms?: string;
  notarization_required?: boolean;
  architect_cert_required?: boolean;
  lien_waiver_required?: boolean;
  get_handling?: string;
  stored_materials_policy?: string;
  gc_certifier_name?: string;
  gc_certifier_email?: string;
  gc_certifier_title?: string;
  architect_certifier_name?: string;
  architect_certifier_email?: string;
  architect_certifier_title?: string;
  billing_period_definition?: string;
  tm_authorizations_permitted?: boolean;
  tm_billing_doc?: string;
  pay_app_sequence_numbering?: string;
}

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementId = url.searchParams.get('engagement_id');
  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id query param is required' }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(billing_format_config)
    .where(
      and(
        eq(billing_format_config.tenant_id, gate.tenantId),
        eq(billing_format_config.engagement_id, engagementId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: `no billing_format_config for engagement ${engagementId}` },
      { status: 404 },
    );
  }
  return NextResponse.json(rows[0]);
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
  const billingFormat = (body.billing_format ?? '').trim();
  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!BILLING_FORMATS.has(billingFormat)) {
    return NextResponse.json(
      { error: `billing_format must be one of ${[...BILLING_FORMATS].join(', ')}` },
      { status: 400 },
    );
  }
  const intakePlatform = (body.gc_billing_intake_platform ?? 'DIRECT').trim();
  if (!INTAKE_PLATFORMS.has(intakePlatform)) {
    return NextResponse.json(
      { error: `gc_billing_intake_platform must be one of ${[...INTAKE_PLATFORMS].join(', ')}` },
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
    .select({ billing_config_id: billing_format_config.billing_config_id })
    .from(billing_format_config)
    .where(and(
      eq(billing_format_config.tenant_id, gate.tenantId),
      eq(billing_format_config.engagement_id, engagementId),
    ))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      {
        error: `billing_format_config already exists for engagement ${engagementId}; PATCH the existing row`,
        code: 'DUPLICATE_CONFIG',
        billing_config_id: existing[0].billing_config_id,
      },
      { status: 409 },
    );
  }

  const inserted = await db
    .insert(billing_format_config)
    .values({
      tenant_id: gate.tenantId,
      engagement_id: engagementId,
      billing_format: billingFormat,
      gc_billing_intake_platform: intakePlatform,
      custom_template_ref: body.custom_template_ref ?? null,
      retainage_pct: String(body.retainage_pct ?? '10'),
      retainage_release_trigger: body.retainage_release_trigger ?? 'SUBSTANTIAL_COMPLETION',
      payment_terms: body.payment_terms ?? 'NET_30',
      notarization_required: body.notarization_required ?? false,
      architect_cert_required: body.architect_cert_required ?? false,
      lien_waiver_required: body.lien_waiver_required ?? false,
      get_handling: body.get_handling ?? 'SUMMARY_LINE_ONLY',
      stored_materials_policy: body.stored_materials_policy ?? 'G703_COLUMN_G',
      gc_certifier_name: body.gc_certifier_name ?? null,
      gc_certifier_email: body.gc_certifier_email ?? null,
      gc_certifier_title: body.gc_certifier_title ?? null,
      architect_certifier_name: body.architect_certifier_name ?? null,
      architect_certifier_email: body.architect_certifier_email ?? null,
      architect_certifier_title: body.architect_certifier_title ?? null,
      billing_period_definition: body.billing_period_definition ?? 'MONTHLY_CALENDAR',
      tm_authorizations_permitted: body.tm_authorizations_permitted ?? true,
      tm_billing_doc: body.tm_billing_doc ?? 'SAME_AS_PAY_APP',
      pay_app_sequence_numbering: body.pay_app_sequence_numbering ?? 'CONTINUOUS',
    })
    .returning({ billing_config_id: billing_format_config.billing_config_id });

  return NextResponse.json(
    { ok: true, billing_config_id: inserted[0].billing_config_id },
    { status: 201 },
  );
}
