/**
 * BAN-345 PM-V1.0-F — POST /api/documents + GET /api/documents
 *
 * POST creates a Document Hub entry (drive_file_id supplied by the caller —
 * uploaded to Drive on the client / by a separate uploader).  Emits
 * DOCUMENT_UPLOADED in the same transaction.  If linked_entity_type +
 * linked_entity_id are present, emits DOCUMENT_LINKED in the same tx.
 *
 * Kai-optional (Charter Amendment 2): the body fields are pure metadata.
 * Default mode is fully manual; Kai may pre-fill kind / linked_entity_*
 * but the row shape is identical either way.
 *
 * GET is the cross-project list surface (admin / PM only).  Per-project
 * list lives at /api/documents/by-kid/[kid].
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, engagements, document_hub_entries } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import {
  passDocumentCrossProjectGate,
  passDocumentWriteGate,
  roleMayWriteKind,
} from '@/lib/pm/documents/api-gate';
import {
  documentSelectColumns,
  isUuid,
  optionalString,
  parseDocumentKind,
  parseDocumentLinkedEntityType,
  resolveEngagementByKid,
  resolveUserIdByEmail,
  trimString,
  validateLinkedEntity,
} from '@/lib/pm/documents/route-utils';
import { FILENAME_MAX } from '@/lib/pm/documents/types';

const ROUTE_PATH = '/api/documents';

export async function POST(req: Request) {
  const gate = await passDocumentWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const driveFileId = trimString(body.drive_file_id);
  if (!driveFileId) return NextResponse.json({ error: 'drive_file_id is required' }, { status: 400 });

  const filename = trimString(body.filename);
  if (!filename) return NextResponse.json({ error: 'filename is required' }, { status: 400 });
  if (filename.length > FILENAME_MAX) {
    return NextResponse.json({ error: `filename must be ${FILENAME_MAX} characters or fewer` }, { status: 400 });
  }

  const kind = parseDocumentKind(body.kind);
  if (!kind) return NextResponse.json({ error: 'kind is required and must be a canonical value' }, { status: 400 });

  if (!roleMayWriteKind(gate.role, kind)) {
    return NextResponse.json(
      { error: `Forbidden: role ${gate.role} may only upload PHOTO_PACKAGE documents` },
      { status: 403 },
    );
  }

  const linkedEntityTypeRaw = optionalString(body.linked_entity_type);
  const linkedEntityIdRaw = optionalString(body.linked_entity_id);
  const linkError = validateLinkedEntity(linkedEntityTypeRaw, linkedEntityIdRaw);
  if (linkError) return NextResponse.json({ error: linkError }, { status: 400 });
  const linkedEntityType = linkedEntityTypeRaw ? parseDocumentLinkedEntityType(linkedEntityTypeRaw) : null;

  const engagementKid = trimString(body.engagement_kid);
  const uploadedByUserId = await resolveUserIdByEmail(gate.actorEmail);

  try {
    const result = await db.transaction(async (tx) => {
      let engagementId: string | null = null;
      let engagementKidVal: string | null = null;
      let isTestProject = false;
      if (engagementKid) {
        const engagement = await resolveEngagementByKid(gate.tenantId, engagementKid);
        if (!engagement) return { kind: 'engagement_not_found' as const };
        engagementId = engagement.engagement_id;
        engagementKidVal = engagement.kid ?? null;
        isTestProject = engagement.is_test_project === true;
      }

      const inserted = await tx
        .insert(document_hub_entries)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          kid: engagementKidVal,
          drive_file_id: driveFileId,
          filename,
          kind,
          subkind: optionalString(body.subkind),
          linked_entity_type: linkedEntityType,
          linked_entity_id: linkedEntityIdRaw,
          external_visible: body.external_visible === true,
          notes: optionalString(body.notes),
          uploaded_by: uploadedByUserId,
          is_test_project: isTestProject,
        })
        .returning();

      const row = inserted[0];

      const uploaded = await emitActivitySpineEvent(tx, {
        event_type: 'DOCUMENT_UPLOADED',
        scope_entity_type: engagementId ? 'project' : 'internal',
        scope_entity_id: engagementId ?? row.document_id,
        entity_kind: 'document',
        entity_id: row.document_id,
        kid: engagementKidVal,
        test_data: isTestProject,
        metadata: {
          filename,
          kind,
          subkind: optionalString(body.subkind),
          drive_file_id: driveFileId,
          linked_entity_type: linkedEntityType,
          linked_entity_id: linkedEntityIdRaw,
          actor: gate.actorEmail,
        },
      });

      let linkedEventId: string | null = null;
      if (linkedEntityType && linkedEntityIdRaw) {
        const linked = await emitActivitySpineEvent(tx, {
          event_type: 'DOCUMENT_LINKED',
          scope_entity_type: engagementId ? 'project' : 'internal',
          scope_entity_id: engagementId ?? row.document_id,
          entity_kind: 'document',
          entity_id: row.document_id,
          kid: engagementKidVal,
          test_data: isTestProject,
          metadata: {
            kind,
            linked_entity_type: linkedEntityType,
            linked_entity_id: linkedEntityIdRaw,
            filename,
            actor: gate.actorEmail,
          },
        });
        linkedEventId = linked.event_id;
      }

      return {
        kind: 'ok' as const,
        document: row,
        uploaded_event_id: uploaded.event_id,
        linked_event_id: linkedEventId,
      };
    });

    if (result.kind === 'engagement_not_found') {
      return NextResponse.json({ error: `engagement not found for kid: ${engagementKid}` }, { status: 404 });
    }
    return NextResponse.json(
      {
        ok: true,
        document: result.document,
        uploaded_event_id: result.uploaded_event_id,
        linked_event_id: result.linked_event_id,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const gate = await passDocumentCrossProjectGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const kindRaw = url.searchParams.get('kind');
  const linkedTypeRaw = url.searchParams.get('linked_entity_type');
  const currentOnly = url.searchParams.get('current_only') !== 'false';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);

  const whereParts = [eq(document_hub_entries.tenant_id, gate.tenantId)];
  if (kindRaw) {
    const kinds = kindRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const valid = kinds.map(parseDocumentKind).filter((v): v is NonNullable<typeof v> => v !== null);
    if (valid.length > 0) whereParts.push(inArray(document_hub_entries.kind, valid));
  }
  if (linkedTypeRaw) {
    const t = parseDocumentLinkedEntityType(linkedTypeRaw);
    if (t) whereParts.push(eq(document_hub_entries.linked_entity_type, t));
  }
  if (currentOnly) {
    whereParts.push(eq(document_hub_entries.is_current, true));
  }

  const items = await db
    .select({
      ...documentSelectColumns,
      engagement_kid: engagements.kid,
    })
    .from(document_hub_entries)
    .leftJoin(engagements, eq(document_hub_entries.engagement_id, engagements.engagement_id))
    .where(and(...whereParts))
    .orderBy(desc(document_hub_entries.uploaded_at))
    .limit(limit);

  return NextResponse.json({ items, total: items.length });
}
