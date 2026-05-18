/**
 * BAN-337 Pay Apps v2b — POST /api/sov/[sov_id]/generate-textura-setup-csv
 *
 * Renders the Textura Schedule-of-Values "setup" CSV (byte-exact to
 * sampleSoV.csv). When schedule_of_values rows have no textura_phase_code,
 * one is auto-assigned starting at 100; assignments are persisted back so
 * subsequent runs are stable.
 *
 * Test-project engagements get the row-1 watermark prepended.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  schedule_of_values,
  sov_versions,
  engagements,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { generateTexturaSovSetupCsv } from '@/lib/aia/textura-csv';

export async function POST(
  req: Request,
  context: { params: Promise<{ sov_id: string }> },
) {
  const gate = await passAiaApiGate(
    req,
    '/api/sov/[sov_id]/generate-textura-setup-csv',
    'project:edit',
  );
  if (!gate.ok) return gate.response;

  const { sov_id } = await context.params;

  const versionRow = await db
    .select({
      sov_version_id: sov_versions.sov_version_id,
      engagement_id: sov_versions.engagement_id,
      version_number: sov_versions.version_number,
      state: sov_versions.state,
    })
    .from(sov_versions)
    .where(and(
      eq(sov_versions.sov_version_id, sov_id),
      eq(sov_versions.tenant_id, gate.tenantId),
    ))
    .limit(1);

  if (versionRow.length === 0) {
    return NextResponse.json({ error: 'sov version not found' }, { status: 404 });
  }
  const version = versionRow[0];

  const [eng, lines] = await Promise.all([
    db
      .select({ is_test: engagements.is_test_project, kid: engagements.kid })
      .from(engagements)
      .where(eq(engagements.engagement_id, version.engagement_id))
      .limit(1),
    db
      .select({
        sov_line_id: schedule_of_values.sov_line_id,
        line_number: schedule_of_values.line_number,
        description: schedule_of_values.description,
        scheduled_value: schedule_of_values.scheduled_value,
        textura_phase_code: schedule_of_values.textura_phase_code,
      })
      .from(schedule_of_values)
      .where(and(
        eq(schedule_of_values.tenant_id, gate.tenantId),
        eq(schedule_of_values.sov_version_id, sov_id),
      ))
      .orderBy(schedule_of_values.line_number),
  ]);

  if (lines.length === 0) {
    return NextResponse.json({ error: 'SOV has no line items' }, { status: 422 });
  }

  const result = generateTexturaSovSetupCsv(
    lines.map((l) => ({
      textura_phase_code: l.textura_phase_code,
      description: l.description,
      scheduled_value: l.scheduled_value,
    })),
    {
      is_test_project: !!eng[0]?.is_test,
      default_start_phase_code: 100,
    },
  );

  // Persist newly assigned phase codes so the CSV is stable across re-runs.
  if (result.phase_codes_assigned.length > 0) {
    await db.transaction(async (tx) => {
      for (const assignment of result.phase_codes_assigned) {
        const line = lines[assignment.line_index];
        if (!line) continue;
        await tx
          .update(schedule_of_values)
          .set({ textura_phase_code: assignment.assigned_phase_code, updated_at: new Date() })
          .where(and(
            eq(schedule_of_values.sov_line_id, line.sov_line_id),
            eq(schedule_of_values.tenant_id, gate.tenantId),
          ));
      }
    });
  }

  const kid = eng[0]?.kid ?? 'sov';
  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${kid}-sov-v${version.version_number}-textura-setup.csv"`,
      'x-phase-codes-assigned': String(result.phase_codes_assigned.length),
      'x-test-project': eng[0]?.is_test ? 'true' : 'false',
    },
  });
}
