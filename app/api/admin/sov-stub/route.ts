/**
 * BAN-336 Pay App Core — Admin SOV-stub create route.
 *
 * POST /api/admin/sov-stub
 * Body: {
 *   engagement_id, version_number, source_kind?,
 *   lines: [{ line_number, description, scheduled_value, cost_code?,
 *             parent_line_id?, display_item_number?,
 *             textura_phase_code?, retainage_pct? }, ...]
 * }
 *
 * Gate: super_admin / business_admin only. Inserts a new sov_versions row
 * (state=APPROVED_INTERNAL) plus N schedule_of_values lines in a single
 * transaction, then emits SOV_STATE_CHANGED for auditability.
 *
 * Companion: POST /api/admin/sov-stub/[sov_version_id]/lock transitions
 * APPROVED_INTERNAL → LOCKED so the Pay App create wizard can fire.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import {
  db,
  sov_versions,
  schedule_of_values,
  engagements,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { checkPermission } from '@/lib/permissions';

interface IncomingLine {
  line_number: number;
  description: string;
  scheduled_value: number | string;
  cost_code?: string | null;
  parent_line_id?: string | null;
  display_item_number?: string | null;
  textura_phase_code?: number | null;
  retainage_pct?: number | string | null;
  line_type?: string;
}

interface CreateBody {
  engagement_id: string;
  version_number?: number;
  source_kind?: string;
  lines: IncomingLine[];
}

const ADMIN_ROLES = new Set(['super_admin', 'business_admin', 'gm', 'owner']);

async function gateAdminWrite(req: Request) {
  // super_admin and gm/owner pass on 'admin:all'; business_admin passes on
  // 'business:admin'. checkPermission already allows admin:all to satisfy
  // any granular permission, so we layer our explicit ADMIN_ROLES check on
  // top of the api-gate's 'project:edit' for the staging-guard + write-flag
  // boilerplate.
  const gate = await passAiaApiGate(req, '/api/admin/sov-stub', 'project:edit');
  if (!gate.ok) return gate;
  const { allowed, role } = await checkPermission(req, 'admin:all');
  const roleAllowed = (role && ADMIN_ROLES.has(role)) || allowed;
  if (!roleAllowed) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Forbidden: super_admin or business_admin role required' },
        { status: 403 },
      ),
    };
  }
  return gate;
}

export async function POST(req: Request) {
  const gate = await gateAdminWrite(req);
  if (!gate.ok) return gate.response;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.engagement_id) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'lines must be a non-empty array' }, { status: 400 });
  }

  // Verify engagement exists in tenant
  const eng = await db
    .select({ id: engagements.engagement_id, is_test: engagements.is_test_project })
    .from(engagements)
    .where(and(eq(engagements.engagement_id, body.engagement_id), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: 'engagement not found in tenant' }, { status: 404 });
  }

  // Default version_number = max existing + 1
  let versionNumber = body.version_number;
  if (!versionNumber) {
    const last = await db
      .select({ v: sov_versions.version_number })
      .from(sov_versions)
      .where(and(
        eq(sov_versions.tenant_id, gate.tenantId),
        eq(sov_versions.engagement_id, body.engagement_id),
      ))
      .orderBy(desc(sov_versions.version_number))
      .limit(1);
    versionNumber = (last[0]?.v ?? 0) + 1;
  }

  const totalValue = body.lines.reduce((sum, l) => sum + Number(l.scheduled_value || 0), 0);

  try {
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(sov_versions)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: body.engagement_id,
          version_number: versionNumber!,
          state: 'APPROVED_INTERNAL',
          source_kind: body.source_kind ?? 'MANAGER_OVERRIDE',
          total_value: totalValue.toFixed(2),
        })
        .returning({ sov_version_id: sov_versions.sov_version_id });

      const versionId = inserted[0].sov_version_id;

      // Two-pass insert so parent_line_id can reference earlier rows:
      // first pass without parent refs; collect id map; second pass updates.
      const idMap = new Map<number, string>(); // line_number → sov_line_id
      for (const l of body.lines) {
        const ins = await tx
          .insert(schedule_of_values)
          .values({
            tenant_id: gate.tenantId,
            engagement_id: body.engagement_id,
            sov_version_id: versionId,
            line_number: l.line_number,
            description: l.description,
            scheduled_value: String(l.scheduled_value ?? 0),
            cost_code: l.cost_code ?? null,
            line_type: l.line_type ?? 'LUMP_SUM',
            retainage_pct: l.retainage_pct != null ? String(l.retainage_pct) : null,
            display_item_number: l.display_item_number ?? null,
            textura_phase_code: l.textura_phase_code ?? null,
          })
          .returning({ id: schedule_of_values.sov_line_id });
        idMap.set(l.line_number, ins[0].id);
      }
      // Resolve parent_line_id by line_number ref (caller may pass a number
      // referencing another row by line_number; if they pass a UUID we keep it).
      for (const l of body.lines) {
        if (!l.parent_line_id) continue;
        let parentId: string | null = null;
        const asNumber = Number(l.parent_line_id);
        if (Number.isFinite(asNumber) && idMap.has(asNumber)) {
          parentId = idMap.get(asNumber)!;
        } else if (typeof l.parent_line_id === 'string' && l.parent_line_id.includes('-')) {
          parentId = l.parent_line_id;
        }
        if (!parentId) continue;
        const childId = idMap.get(l.line_number)!;
        await tx
          .update(schedule_of_values)
          .set({ parent_line_id: parentId })
          .where(eq(schedule_of_values.sov_line_id, childId));
      }

      await emitActivitySpineEvent(tx, {
        event_type: 'SOV_STATE_CHANGED',
        scope_entity_type: 'project',
        scope_entity_id: body.engagement_id,
        entity_kind: 'sov_version',
        entity_id: versionId,
        notes: `Admin SOV-stub create: ${body.lines.length} lines, $${totalValue.toFixed(2)}`,
        test_data: !!eng[0].is_test,
        metadata: {
          from_state: 'NONE',
          to_state: 'APPROVED_INTERNAL',
          line_count: body.lines.length,
          actor: gate.actorEmail,
          stub: true,
        },
      });

      return { sov_version_id: versionId, line_count: body.lines.length, total_value: totalValue };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
