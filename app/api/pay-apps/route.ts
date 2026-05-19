/**
 * BAN-336 Pay App Core — POST /api/pay-apps (create wizard).
 *
 * Validates that the engagement has a LOCKED sov_version, allocates the
 * next pay_app_number, inserts the pay_applications row, then pre-fills
 * one pay_app_line_items row per current SOV line.
 *
 * Body: {
 *   engagement_id, sov_version_id?, period_start, period_end,
 *   billing_format? (default AIA_G702_G703)
 * }
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  pay_app_line_items,
  sov_versions,
  schedule_of_values,
  billing_format_config,
  engagements,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { dispatchSourceEvent } from '@/lib/pm/action-items/spine-subscriber';

const VALID_FORMATS = new Set([
  'AIA_G702_G703',
  'CUSTOM_TEMPLATE_AIA_STYLE',
  'CUSTOM_TEMPLATE_SCHEDULE_ABC',
  'TEXTURA_CSV_EXPORT',
]);

interface CreateBody {
  engagement_id: string;
  sov_version_id?: string;
  period_start: string;
  period_end: string;
  billing_format?: string;
}

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, '/api/pay-apps', 'project:edit');
  if (!gate.ok) return gate.response;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.engagement_id || !body.period_start || !body.period_end) {
    return NextResponse.json(
      { error: 'engagement_id, period_start, period_end are required' },
      { status: 400 },
    );
  }
  const billingFormat = body.billing_format ?? 'AIA_G702_G703';
  if (!VALID_FORMATS.has(billingFormat)) {
    return NextResponse.json(
      { error: `billing_format must be one of ${[...VALID_FORMATS].join(', ')}` },
      { status: 400 },
    );
  }

  // Resolve engagement + locked SOV
  const eng = await db
    .select({ engagement_id: engagements.engagement_id, is_test: engagements.is_test_project, kid: engagements.kid })
    .from(engagements)
    .where(and(eq(engagements.engagement_id, body.engagement_id), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: 'engagement not found' }, { status: 404 });
  }

  let sovVersionId = body.sov_version_id;
  if (!sovVersionId) {
    const lockedVersions = await db
      .select({ id: sov_versions.sov_version_id, v: sov_versions.version_number })
      .from(sov_versions)
      .where(and(
        eq(sov_versions.tenant_id, gate.tenantId),
        eq(sov_versions.engagement_id, body.engagement_id),
        eq(sov_versions.state, 'LOCKED'),
      ))
      .orderBy(desc(sov_versions.version_number))
      .limit(1);
    if (lockedVersions.length === 0) {
      return NextResponse.json(
        { error: 'No LOCKED SOV version exists for this engagement' },
        { status: 422 },
      );
    }
    sovVersionId = lockedVersions[0].id;
  } else {
    const v = await db
      .select({ state: sov_versions.state })
      .from(sov_versions)
      .where(and(
        eq(sov_versions.sov_version_id, sovVersionId),
        eq(sov_versions.tenant_id, gate.tenantId),
      ))
      .limit(1);
    if (v.length === 0 || v[0].state !== 'LOCKED') {
      return NextResponse.json(
        { error: 'sov_version_id must reference a LOCKED SOV' },
        { status: 422 },
      );
    }
  }

  // Pull SOV lines + billing format config (for retainage pct)
  const [sovLines, configRows, existingApps] = await Promise.all([
    db
      .select()
      .from(schedule_of_values)
      .where(and(
        eq(schedule_of_values.tenant_id, gate.tenantId),
        eq(schedule_of_values.sov_version_id, sovVersionId),
      )),
    db
      .select()
      .from(billing_format_config)
      .where(and(
        eq(billing_format_config.tenant_id, gate.tenantId),
        eq(billing_format_config.engagement_id, body.engagement_id),
      ))
      .limit(1),
    db
      .select({ n: pay_applications.pay_app_number })
      .from(pay_applications)
      .where(and(
        eq(pay_applications.tenant_id, gate.tenantId),
        eq(pay_applications.engagement_id, body.engagement_id),
      ))
      .orderBy(desc(pay_applications.pay_app_number))
      .limit(1),
  ]);

  if (sovLines.length === 0) {
    return NextResponse.json({ error: 'Locked SOV has no line items' }, { status: 422 });
  }
  const cfg = configRows[0];
  const retainagePct = cfg?.retainage_pct ? Number(cfg.retainage_pct) / 100 : 0.10;
  const notarizationRequired = cfg?.notarization_required ?? true;
  const nextNumber = (existingApps[0]?.n ?? 0) + 1;
  const contractSum = sovLines.reduce((s, l) => s + Number(l.scheduled_value || 0), 0);

  try {
    const result = await db.transaction(async (tx) => {
      // Previous pay app for this engagement supplies work_completed_previous
      // via running totals per sov_line_id.
      const priorRows = await tx
        .select({
          sov_line_id: pay_app_line_items.sov_line_id,
          total: pay_app_line_items.total_completed_and_stored,
        })
        .from(pay_app_line_items)
        .where(eq(pay_app_line_items.tenant_id, gate.tenantId));
      const priorTotals = new Map<string, number>();
      for (const r of priorRows) {
        if (!r.sov_line_id) continue;
        // Take max across pay apps (running total — completed_to_date)
        const v = Number(r.total || 0);
        const cur = priorTotals.get(r.sov_line_id) ?? 0;
        if (v > cur) priorTotals.set(r.sov_line_id, v);
      }

      const inserted = await tx
        .insert(pay_applications)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: body.engagement_id,
          pay_app_number: nextNumber,
          period_start: body.period_start,
          period_end: body.period_end,
          state: 'PENDING_DRAFT',
          sov_version_id: sovVersionId!,
          contract_sum_original: contractSum.toFixed(2),
          contract_sum_to_date: contractSum.toFixed(2),
          billing_format: billingFormat,
          notarization_required: notarizationRequired,
        })
        .returning({ pay_app_id: pay_applications.pay_app_id });

      const payAppId = inserted[0].pay_app_id;

      for (let i = 0; i < sovLines.length; i++) {
        const l = sovLines[i];
        const prevTotal = priorTotals.get(l.sov_line_id) ?? 0;
        await tx.insert(pay_app_line_items).values({
          tenant_id: gate.tenantId,
          pay_app_id: payAppId,
          sov_line_id: l.sov_line_id,
          line_number: l.line_number,
          line_type: l.line_type,
          description: l.description,
          scheduled_value: String(l.scheduled_value ?? '0'),
          work_completed_previous: prevTotal.toFixed(2),
          work_completed_this_period: '0',
          stored_materials: '0',
          total_completed_and_stored: prevTotal.toFixed(2),
          percent_complete: l.scheduled_value && Number(l.scheduled_value) > 0
            ? ((prevTotal / Number(l.scheduled_value)) * 100).toFixed(2)
            : '0',
          retainage_held: (prevTotal * retainagePct).toFixed(2),
          balance_to_finish: (Number(l.scheduled_value || 0) - prevTotal).toFixed(2),
        });
      }

      await emitActivitySpineEvent(tx, {
        event_type: 'PAY_APP_STATE_CHANGED',
        scope_entity_type: 'project',
        scope_entity_id: body.engagement_id,
        entity_kind: 'pay_application',
        entity_id: payAppId,
        notes: `Pay App #${nextNumber} created`,
        test_data: !!eng[0].is_test,
        metadata: {
          from_state: 'NONE',
          to_state: 'PENDING_DRAFT',
          pay_app_number: nextNumber,
          billing_format: billingFormat,
          line_count: sovLines.length,
          actor: gate.actorEmail,
        },
      });

      return { pay_app_id: payAppId, pay_app_number: nextNumber, line_count: sovLines.length };
    });

    // BAN-354 PM-V1.0-E.b — Action Item Tracker subscriber. Fires AFTER the
    // source tx commits; wrapped in try/catch so a subscriber error never
    // rolls back the canonical pay-app create emit.
    try {
      await dispatchSourceEvent({
        eventType: 'PAY_APP_STATE_CHANGED',
        entityKind: 'pay_application',
        entityId: result.pay_app_id,
        tenantId: gate.tenantId,
        engagementId: body.engagement_id,
        kid: eng[0].kid ?? null,
        isTestProject: !!eng[0].is_test,
        metadata: {
          from_state: 'NONE',
          to_state: 'PENDING_DRAFT',
          pay_app_number: result.pay_app_number,
        },
        actorEmail: gate.actorEmail,
      });
    } catch {
      // Subscriber failure must never roll back the source emit.
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
