/**
 * BAN-345 PM-V1.0-F — GET /api/documents/by-entity/[type]/[id]
 *
 * Cross-trunk "Linked Documents" lookup.  Returns all Document Hub entries
 * whose (linked_entity_type, linked_entity_id) match the path params.  Used
 * by every entity's detail drawer to render the Linked Documents panel
 * without each trunk having to know about Document Hub internals.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, document_hub_entries } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { documentSelectColumns, isUuid, parseDocumentLinkedEntityType } from '@/lib/pm/documents/route-utils';

export async function GET(
  req: Request,
  context: { params: Promise<{ type: string; id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { type: rawType, id: rawId } = await context.params;
  const type = parseDocumentLinkedEntityType(decodeURIComponent(rawType));
  if (!type) return NextResponse.json({ error: 'linked_entity_type is invalid' }, { status: 400 });

  const id = decodeURIComponent(rawId);
  if (!isUuid(id)) return NextResponse.json({ error: 'id must be a uuid' }, { status: 400 });

  const url = new URL(req.url);
  const currentOnly = url.searchParams.get('current_only') !== 'false';

  const whereParts = [
    eq(document_hub_entries.tenant_id, gate.tenantId),
    eq(document_hub_entries.linked_entity_type, type),
    eq(document_hub_entries.linked_entity_id, id),
  ];
  if (currentOnly) {
    whereParts.push(eq(document_hub_entries.is_current, true));
  }

  const items = await db
    .select(documentSelectColumns)
    .from(document_hub_entries)
    .where(and(...whereParts))
    .orderBy(desc(document_hub_entries.uploaded_at));

  return NextResponse.json({ items, total: items.length });
}
