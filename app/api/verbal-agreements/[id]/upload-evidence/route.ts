/**
 * BAN-342 PM-V1.0-C — POST /api/verbal-agreements/[id]/upload-evidence
 *
 * v1 does not manage recording capture. This route records Drive IDs for
 * evidence the PM already uploaded elsewhere.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, verbal_agreements } from '@/db';
import { passVerbalAgreementWriteGate } from '@/lib/pm/verbal-agreements/api-gate';
import { getVerbalAgreementForTenant, optionalString, optionalStringArray } from '@/lib/pm/verbal-agreements/route-utils';

const ROUTE_PATH = '/api/verbal-agreements/[id]/upload-evidence';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passVerbalAgreementWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const existing = await getVerbalAgreementForTenant(gate.tenantId, id);
  if (!existing) return NextResponse.json({ error: 'verbal agreement not found' }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date() };
  const audioId = optionalString(body.audio_recording_drive_id);
  const followupId = optionalString(body.written_followup_email_drive_id);
  const photoIds = optionalStringArray(body.photo_documentation_drive_ids);

  if (audioId) updates.audio_recording_drive_id = audioId;
  if (followupId) updates.written_followup_email_drive_id = followupId;
  if (photoIds.length > 0) {
    const prior = Array.isArray(existing.photo_documentation_drive_ids)
      ? existing.photo_documentation_drive_ids
      : [];
    updates.photo_documentation_drive_ids = Array.from(new Set([...prior, ...photoIds]));
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No evidence Drive IDs provided' }, { status: 400 });
  }

  const updated = await db
    .update(verbal_agreements)
    .set(updates)
    .where(
      and(
        eq(verbal_agreements.verbal_agreement_id, id),
        eq(verbal_agreements.tenant_id, gate.tenantId),
      ),
    )
    .returning();

  return NextResponse.json({ ok: true, verbal_agreement: updated[0] });
}
