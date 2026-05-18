/**
 * BAN-340 PM-V1.0-A — POST /api/submittals (create submittal)
 *
 * Per PM Trunk v1.0 §5.2:
 *   - Caller provides engagement_kid + CSI coordinate + type + (optional)
 *     description, requirements_text, required_quantity, required_by_date,
 *     spec_document_ref, lead_time_days.
 *   - submittal_number is auto-assembled from project kID + CSI coordinate
 *     (PRJ-YY-NNNN-SUB-{spec}-{sub}-{subsub}).
 *   - Initial status defaults to REQUIRED; ball_in_court derives to SUBCONTRACTOR.
 *   - Uniqueness on (engagement_id, csi_spec_section, csi_subsection,
 *     csi_sub_subsection) is enforced at the DB level.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, engagements, submittals } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  validateCsiCoordinate,
  assembleSubmittalNumber,
  deriveCsiDivisionFromSpec,
} from '@/lib/pm/submittals/csi';
import { deriveBallInCourt } from '@/lib/pm/submittals/state-machine';

const ROUTE_PATH = '/api/submittals';
const SUBMITTAL_TYPES = new Set(['ACTION', 'PHYSICAL', 'CLOSEOUT']);

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementKid = typeof body.engagement_kid === 'string' ? body.engagement_kid.trim() : '';
  const csi = {
    csi_spec_section: typeof body.csi_spec_section === 'string' ? body.csi_spec_section.trim() : '',
    csi_subsection: typeof body.csi_subsection === 'string' ? body.csi_subsection.trim() : '',
    csi_sub_subsection: typeof body.csi_sub_subsection === 'string' ? body.csi_sub_subsection.trim() : '',
  };
  const submittalType = typeof body.submittal_type === 'string' ? body.submittal_type.trim() : '';
  const description = typeof body.description === 'string' ? body.description : null;
  const requirementsText = typeof body.requirements_text === 'string' ? body.requirements_text : null;
  const requiredQuantity = Number.isFinite(body.required_quantity as number)
    ? Math.trunc(body.required_quantity as number)
    : null;
  const requiredByDate = typeof body.required_by_date === 'string' && body.required_by_date.length > 0
    ? body.required_by_date
    : null;
  const specDocumentRef = typeof body.spec_document_ref === 'string' ? body.spec_document_ref : null;
  const leadTimeDays = Number.isFinite(body.lead_time_days as number)
    ? Math.trunc(body.lead_time_days as number)
    : null;
  const csiDivision = typeof body.csi_division === 'string' && body.csi_division.length > 0
    ? body.csi_division.trim()
    : deriveCsiDivisionFromSpec(csi.csi_spec_section);
  const displayLabel = typeof body.display_label === 'string' ? body.display_label : null;

  if (!engagementKid) {
    return NextResponse.json(
      { error: 'engagement_kid is required' },
      { status: 400 },
    );
  }
  if (!SUBMITTAL_TYPES.has(submittalType)) {
    return NextResponse.json(
      { error: 'submittal_type must be one of ACTION, PHYSICAL, CLOSEOUT' },
      { status: 400 },
    );
  }
  const csiErrors = validateCsiCoordinate(csi);
  if (csiErrors.length > 0) {
    return NextResponse.json(
      { error: 'Invalid CSI coordinate', validation_errors: csiErrors },
      { status: 400 },
    );
  }

  const engagementRow = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, gate.tenantId),
        eq(engagements.kid, engagementKid),
      ),
    )
    .limit(1);

  if (engagementRow.length === 0) {
    return NextResponse.json(
      { error: `engagement not found for kid: ${engagementKid}` },
      { status: 404 },
    );
  }

  const engagementId = engagementRow[0].engagement_id;
  const submittalNumber = assembleSubmittalNumber(engagementKid, csi);
  const ballInCourt = deriveBallInCourt('REQUIRED', null);

  try {
    const inserted = await db
      .insert(submittals)
      .values({
        tenant_id: gate.tenantId,
        engagement_id: engagementId,
        submittal_number: submittalNumber,
        display_label: displayLabel,
        csi_division: csiDivision,
        csi_spec_section: csi.csi_spec_section,
        csi_subsection: csi.csi_subsection,
        csi_sub_subsection: csi.csi_sub_subsection,
        spec_document_ref: specDocumentRef,
        submittal_type: submittalType as 'ACTION' | 'PHYSICAL' | 'CLOSEOUT',
        description,
        requirements_text: requirementsText,
        required_quantity: requiredQuantity,
        required_by_date: requiredByDate,
        lead_time_days: leadTimeDays,
        status: 'REQUIRED',
        ball_in_court: ballInCourt,
      })
      .returning();

    return NextResponse.json({ ok: true, submittal: inserted[0] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Drizzle/pg surfaces unique violations with code 23505 in the cause.
    if (/duplicate key value violates unique constraint/.test(msg)) {
      return NextResponse.json(
        {
          error: 'A submittal already exists for this engagement + CSI coordinate',
          code: 'DUPLICATE_SUBMITTAL',
          submittal_number: submittalNumber,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
