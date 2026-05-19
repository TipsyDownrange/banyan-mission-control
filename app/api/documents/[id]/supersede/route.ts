/**
 * BAN-345 PM-V1.0-F — POST /api/documents/[id]/supersede
 *
 * Creates a new document version that supersedes the existing one.  The new
 * row inherits kind/linked entity/engagement from the predecessor unless the
 * caller overrides them.  The predecessor is updated with
 * superseded_by_document_id (which flips is_current to false via the
 * generated column).  Emits DOCUMENT_SUPERSEDED for the predecessor and
 * DOCUMENT_UPLOADED for the new version in the same transaction.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, document_hub_entries } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { passDocumentWriteGate, roleMayWriteKind } from '@/lib/pm/documents/api-gate';
import {
  getDocumentForTenant,
  isUuid,
  optionalString,
  parseDocumentKind,
  resolveUserIdByEmail,
  trimString,
} from '@/lib/pm/documents/route-utils';
import { FILENAME_MAX } from '@/lib/pm/documents/types';

const ROUTE_PATH = '/api/documents/[id]/supersede';

export async function POST(
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

  const driveFileId = trimString(body.drive_file_id);
  if (!driveFileId) return NextResponse.json({ error: 'drive_file_id is required for the new version' }, { status: 400 });

  const filenameInput = trimString(body.filename);
  if (filenameInput.length > FILENAME_MAX) {
    return NextResponse.json({ error: `filename must be ${FILENAME_MAX} characters or fewer` }, { status: 400 });
  }

  const predecessor = await getDocumentForTenant(gate.tenantId, id);
  if (!predecessor) return NextResponse.json({ error: 'document not found' }, { status: 404 });
  if (!predecessor.is_current) {
    return NextResponse.json(
      { error: 'document is already superseded — supersede the current version instead' },
      { status: 409 },
    );
  }

  const kind = body.kind === undefined
    ? predecessor.kind
    : parseDocumentKind(body.kind);
  if (!kind) return NextResponse.json({ error: 'kind is invalid' }, { status: 400 });
  if (!roleMayWriteKind(gate.role, kind)) {
    return NextResponse.json(
      { error: `Forbidden: role ${gate.role} may only upload PHOTO_PACKAGE documents` },
      { status: 403 },
    );
  }

  const filename = filenameInput || predecessor.filename;
  const subkind = body.subkind === undefined ? predecessor.subkind : optionalString(body.subkind);
  const notes = body.notes === undefined ? predecessor.notes : optionalString(body.notes);

  const uploadedByUserId = await resolveUserIdByEmail(gate.actorEmail);

  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(document_hub_entries)
      .values({
        tenant_id: gate.tenantId,
        engagement_id: predecessor.engagement_id,
        kid: predecessor.kid,
        drive_file_id: driveFileId,
        filename,
        kind,
        subkind,
        linked_entity_type: predecessor.linked_entity_type,
        linked_entity_id: predecessor.linked_entity_id,
        external_visible: predecessor.external_visible,
        notes,
        uploaded_by: uploadedByUserId,
        version: (predecessor.version ?? 1) + 1,
        is_test_project: predecessor.is_test_project,
      })
      .returning();

    const next = inserted[0];

    await tx
      .update(document_hub_entries)
      .set({ superseded_by_document_id: next.document_id })
      .where(
        and(
          eq(document_hub_entries.document_id, predecessor.document_id),
          eq(document_hub_entries.tenant_id, gate.tenantId),
        ),
      );

    const supersededEvent = await emitActivitySpineEvent(tx, {
      event_type: 'DOCUMENT_SUPERSEDED',
      scope_entity_type: predecessor.engagement_id ? 'project' : 'internal',
      scope_entity_id: predecessor.engagement_id ?? predecessor.document_id,
      entity_kind: 'document',
      entity_id: predecessor.document_id,
      kid: predecessor.kid ?? null,
      test_data: predecessor.is_test_project === true,
      metadata: {
        from_document_id: predecessor.document_id,
        to_document_id: next.document_id,
        from_version: predecessor.version,
        to_version: next.version,
        kind,
        actor: gate.actorEmail,
      },
    });

    const uploadedEvent = await emitActivitySpineEvent(tx, {
      event_type: 'DOCUMENT_UPLOADED',
      scope_entity_type: next.engagement_id ? 'project' : 'internal',
      scope_entity_id: next.engagement_id ?? next.document_id,
      entity_kind: 'document',
      entity_id: next.document_id,
      kid: next.kid ?? null,
      test_data: next.is_test_project === true,
      metadata: {
        filename,
        kind,
        subkind,
        drive_file_id: driveFileId,
        superseded_predecessor_id: predecessor.document_id,
        version: next.version,
        actor: gate.actorEmail,
      },
    });

    return {
      document: next,
      predecessor_id: predecessor.document_id,
      superseded_event_id: supersededEvent.event_id,
      uploaded_event_id: uploadedEvent.event_id,
    };
  });

  return NextResponse.json({ ok: true, ...result }, { status: 201 });
}
