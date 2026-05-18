/**
 * BAN-309 Pass 3a.2 PR 2 — POST /api/aia/handoff-validations
 *
 * Creates a handoff_validations row. handoff_validations.mode CHECK enum is
 * {ACCEPT, REJECT_NEEDS_FIX, ACCEPT_WITH_EXCEPTIONS}. We always insert the
 * row (REJECT_NEEDS_FIX is a valid audit record), but emit HANDOFF_PROCESSED
 * only when mode ∈ {ACCEPT, ACCEPT_WITH_EXCEPTIONS} per the dispatch's
 * "Emit only on successful creation with success-state column value".
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  handoff_validations,
  engagements,
  sov_versions,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/aia/handoff-validations';

const VALID_MODES = ['ACCEPT', 'REJECT_NEEDS_FIX', 'ACCEPT_WITH_EXCEPTIONS'] as const;
type HandoffMode = typeof VALID_MODES[number];
const SUCCESS_MODES: ReadonlySet<HandoffMode> = new Set(['ACCEPT', 'ACCEPT_WITH_EXCEPTIONS']);

interface HandoffBody {
  engagement_id?: string;
  mode?: string;
  validated_by?: string;
  sov_version_id?: string;
  sov_state_at_handoff?: string;
  missing_fields?: unknown[];
  exceptions?: unknown[];
  required_field_snapshot?: Record<string, unknown>;
}

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: HandoffBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementId = (body.engagement_id ?? '').trim();
  const mode = (body.mode ?? '').trim() as HandoffMode;

  if (!engagementId) {
    return NextResponse.json(
      { error: 'engagement_id is required' },
      { status: 400 },
    );
  }
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json(
      {
        error: `mode must be one of: ${VALID_MODES.join(', ')}`,
        code: 'INVALID_MODE',
      },
      { status: 400 },
    );
  }

  const engagementLookup = await db
    .select({
      engagement_id: engagements.engagement_id,
      is_test_project: engagements.is_test_project,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagement_id, engagementId),
        eq(engagements.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (engagementLookup.length === 0) {
    return NextResponse.json(
      { error: `engagement ${engagementId} not found` },
      { status: 404 },
    );
  }

  if (body.sov_version_id) {
    const sovCheck = await db
      .select({ sov_version_id: sov_versions.sov_version_id })
      .from(sov_versions)
      .where(
        and(
          eq(sov_versions.sov_version_id, body.sov_version_id),
          eq(sov_versions.tenant_id, gate.tenantId),
          eq(sov_versions.engagement_id, engagementId),
        ),
      )
      .limit(1);
    if (sovCheck.length === 0) {
      return NextResponse.json(
        {
          error: `sov_version_id ${body.sov_version_id} does not belong to engagement ${engagementId}`,
          code: 'INVALID_SOV_VERSION_ID',
        },
        { status: 400 },
      );
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(handoff_validations)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          mode,
          validated_by: body.validated_by ?? null,
          sov_state_at_handoff: body.sov_state_at_handoff ?? null,
          sov_version_id: body.sov_version_id ?? null,
          missing_fields: body.missing_fields ?? [],
          exceptions: body.exceptions ?? [],
          required_field_snapshot: body.required_field_snapshot ?? {},
        })
        .returning({
          validation_id: handoff_validations.validation_id,
          validated_at: handoff_validations.validated_at,
        });

      const validation = inserted[0];

      if (!SUCCESS_MODES.has(mode)) {
        return {
          validation_id: validation.validation_id,
          validated_at: validation.validated_at?.toISOString() ?? null,
          emitted: false,
          event_id: null as string | null,
        };
      }

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'HANDOFF_PROCESSED',
        scope_entity_type: 'project',
        scope_entity_id: engagementId,
        entity_kind: 'handoff_validation',
        entity_id: validation.validation_id,
        test_data: engagementLookup[0].is_test_project === true,
        metadata: {
          handoff_validation_id: validation.validation_id,
          mode,
          sov_version_id: body.sov_version_id ?? null,
          sov_state_at_handoff: body.sov_state_at_handoff ?? null,
          actor: gate.actorEmail,
        },
      });

      return {
        validation_id: validation.validation_id,
        validated_at: validation.validated_at?.toISOString() ?? null,
        emitted: true,
        event_id: emit.event_id,
      };
    });

    return NextResponse.json({ ok: true, mode, ...result });
  } catch (err) {
    if (err instanceof ActivitySpineEmitError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: 'INTERNAL' },
      { status: 500 },
    );
  }
}
