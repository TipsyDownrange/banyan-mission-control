/**
 * BAN-345 PM-V1.0-F — GET/PATCH /api/documents/[id]
 *
 * GET returns the document row.
 * PATCH applies allowed-field updates.  When linked_entity_type changes (and
 * resolves to a non-null pair), emits DOCUMENT_LINKED.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, document_hub_entries } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { passDocumentWriteGate } from '@/lib/pm/documents/api-gate';
import {
  getDocumentForTenant,
  isPatchField,
  isUuid,
  optionalString,
  parseDocumentLinkedEntityType,
  validateLinkedEntity,
} from '@/lib/pm/documents/route-utils';
import { FILENAME_MAX } from '@/lib/pm/documents/types';

const ROUTE_PATH = '/api/documents/[id]';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'id must be a uuid' }, { status: 400 });

  const document = await getDocumentForTenant(gate.tenantId, id);
  if (!document) return NextResponse.json({ error: 'document not found' }, { status: 404 });

  return NextResponse.json({ document });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passDocumentWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'id must be a uuid' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const existing = await getDocumentForTenant(gate.tenantId, id);
  if (!existing) return NextResponse.json({ error: 'document not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!isPatchField(k)) continue;
    if (k === 'filename') {
      const filename = optionalString(v);
      if (!filename) return NextResponse.json({ error: 'filename cannot be blank' }, { status: 400 });
      if (filename.length > FILENAME_MAX) {
        return NextResponse.json({ error: `filename must be ${FILENAME_MAX} characters or fewer` }, { status: 400 });
      }
      updates.filename = filename;
    } else if (k === 'external_visible') {
      updates.external_visible = v === true;
    } else if (k === 'linked_entity_type' || k === 'linked_entity_id') {
      updates[k] = optionalString(v);
    } else {
      updates[k] = optionalString(v);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No allowed fields provided in PATCH body' }, { status: 400 });
  }

  // If either link field is being patched, validate the resulting pair.
  const willTouchLink = 'linked_entity_type' in updates || 'linked_entity_id' in updates;
  let nextLinkType: string | null = existing.linked_entity_type as string | null;
  let nextLinkId: string | null = existing.linked_entity_id as string | null;
  if ('linked_entity_type' in updates) nextLinkType = (updates.linked_entity_type as string | null) ?? null;
  if ('linked_entity_id' in updates) nextLinkId = (updates.linked_entity_id as string | null) ?? null;
  if (willTouchLink) {
    const linkError = validateLinkedEntity(nextLinkType, nextLinkId);
    if (linkError) return NextResponse.json({ error: linkError }, { status: 400 });
  }

  const linkBecameNonNull =
    willTouchLink
    && nextLinkType !== null
    && nextLinkId !== null
    && (existing.linked_entity_type !== nextLinkType
      || existing.linked_entity_id !== nextLinkId);

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(document_hub_entries)
      .set(updates)
      .where(
        and(
          eq(document_hub_entries.document_id, id),
          eq(document_hub_entries.tenant_id, gate.tenantId),
        ),
      )
      .returning();

    let event_id: string | null = null;
    if (linkBecameNonNull && nextLinkType && nextLinkId) {
      const linkedType = parseDocumentLinkedEntityType(nextLinkType);
      if (linkedType) {
        const event = await emitActivitySpineEvent(tx, {
          event_type: 'DOCUMENT_LINKED',
          scope_entity_type: existing.engagement_id ? 'project' : 'internal',
          scope_entity_id: existing.engagement_id ?? existing.document_id,
          entity_kind: 'document',
          entity_id: existing.document_id,
          kid: existing.kid ?? null,
          test_data: existing.is_test_project === true,
          metadata: {
            kind: existing.kind,
            linked_entity_type: linkedType,
            linked_entity_id: nextLinkId,
            filename: updated[0]?.filename ?? existing.filename,
            actor: gate.actorEmail,
          },
        });
        event_id = event.event_id;
      }
    }

    return { document: updated[0], event_id };
  });

  return NextResponse.json({ ok: true, ...result });
}
