/**
 * BAN-345 PM-V1.0-F — GET /api/documents/by-kid/[kid]
 *
 * Project-scoped Document Hub list surface for ProjectsPanel.  Supports
 * filtering by kind, linked_entity_type, and from/to date.  Returns a
 * summary block (counts by kind + by-linked-entity) so the DocumentsTab
 * header chips render without an extra round-trip.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { db, engagements, document_hub_entries } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import {
  documentSelectColumns,
  parseDocumentKind,
  parseDocumentLinkedEntityType,
} from '@/lib/pm/documents/route-utils';
import { DOCUMENT_KINDS, DOCUMENT_LINKED_ENTITY_TYPES } from '@/lib/pm/documents/types';

type DocRowLite = {
  kind: string;
  linked_entity_type: string | null;
  is_current: boolean | null;
};

function summarize(items: DocRowLite[]) {
  const by_kind: Record<string, number> = {};
  for (const k of DOCUMENT_KINDS) by_kind[k] = 0;
  const by_linked_entity: Record<string, number> = {};
  for (const t of DOCUMENT_LINKED_ENTITY_TYPES) by_linked_entity[t] = 0;
  let current_count = 0;
  let linked_count = 0;
  for (const it of items) {
    if (it.kind in by_kind) by_kind[it.kind] += 1;
    if (it.linked_entity_type && it.linked_entity_type in by_linked_entity) {
      by_linked_entity[it.linked_entity_type] += 1;
      linked_count += 1;
    }
    if (it.is_current) current_count += 1;
  }
  return {
    total: items.length,
    current_count,
    linked_count,
    by_kind,
    by_linked_entity,
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ kid: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { kid: rawKid } = await context.params;
  const kid = decodeURIComponent(rawKid).trim();
  if (!kid) return NextResponse.json({ error: 'kid path param is required' }, { status: 400 });

  const url = new URL(req.url);
  const kindRaw = url.searchParams.get('kind');
  const linkedTypeRaw = url.searchParams.get('linked_entity_type');
  const fromDate = url.searchParams.get('from_date');
  const toDate = url.searchParams.get('to_date');
  const currentOnly = url.searchParams.get('current_only') !== 'false';

  const engagementRows = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      is_test_project: engagements.is_test_project,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, gate.tenantId),
        eq(engagements.kid, kid),
      ),
    )
    .limit(1);

  if (engagementRows.length === 0) {
    return NextResponse.json({
      kIDFound: false,
      engagement: null,
      items: [],
      summary: summarize([]),
    });
  }

  const engagement = engagementRows[0];

  const whereParts = [
    eq(document_hub_entries.tenant_id, gate.tenantId),
    eq(document_hub_entries.engagement_id, engagement.engagement_id),
  ];

  if (currentOnly) {
    whereParts.push(eq(document_hub_entries.is_current, true));
  }
  if (kindRaw) {
    const kinds = kindRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const valid = kinds.map(parseDocumentKind).filter((v): v is NonNullable<typeof v> => v !== null);
    if (valid.length > 0) whereParts.push(inArray(document_hub_entries.kind, valid));
  }
  if (linkedTypeRaw) {
    const t = parseDocumentLinkedEntityType(linkedTypeRaw);
    if (t) {
      whereParts.push(eq(document_hub_entries.linked_entity_type, t));
    } else if (linkedTypeRaw === 'ANY') {
      whereParts.push(isNotNull(document_hub_entries.linked_entity_type));
    }
  }
  if (fromDate) {
    const d = new Date(fromDate);
    if (!Number.isNaN(d.getTime())) whereParts.push(gte(document_hub_entries.uploaded_at, d));
  }
  if (toDate) {
    const d = new Date(toDate);
    if (!Number.isNaN(d.getTime())) whereParts.push(lte(document_hub_entries.uploaded_at, d));
  }

  const items = await db
    .select(documentSelectColumns)
    .from(document_hub_entries)
    .where(and(...whereParts))
    .orderBy(desc(document_hub_entries.uploaded_at));

  return NextResponse.json({
    kIDFound: true,
    engagement,
    items,
    summary: summarize(items as unknown as DocRowLite[]),
  });
}
