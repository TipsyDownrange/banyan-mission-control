/**
 * BAN-345 PM-V1.0-F — Document Hub route helpers (parsers + shared select
 * fragments).  Mirrors lib/pm/meetings/route-utils.ts.
 */

import { and, eq } from 'drizzle-orm';
import { db, engagements, document_hub_entries, users } from '@/db';
import {
  isDocumentKind,
  isDocumentLinkedEntityType,
  type DocumentKind,
  type DocumentLinkedEntityType,
} from './types';

export function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function optionalString(value: unknown): string | null {
  const trimmed = trimString(value);
  return trimmed || null;
}

export function parseDocumentKind(value: unknown): DocumentKind | null {
  return isDocumentKind(value) ? value : null;
}

export function parseDocumentLinkedEntityType(value: unknown): DocumentLinkedEntityType | null {
  return isDocumentLinkedEntityType(value) ? value : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export async function resolveEngagementByKid(tenantId: string, kid: string) {
  const rows = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      is_test_project: engagements.is_test_project,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, tenantId),
        eq(engagements.kid, kid),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  const rows = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(eq(users.email, trimmed))
    .limit(1);
  return rows[0]?.user_id ?? null;
}

export const documentSelectColumns = {
  document_id: document_hub_entries.document_id,
  tenant_id: document_hub_entries.tenant_id,
  engagement_id: document_hub_entries.engagement_id,
  kid: document_hub_entries.kid,
  drive_file_id: document_hub_entries.drive_file_id,
  filename: document_hub_entries.filename,
  kind: document_hub_entries.kind,
  subkind: document_hub_entries.subkind,
  linked_entity_type: document_hub_entries.linked_entity_type,
  linked_entity_id: document_hub_entries.linked_entity_id,
  external_visible: document_hub_entries.external_visible,
  version: document_hub_entries.version,
  superseded_by_document_id: document_hub_entries.superseded_by_document_id,
  is_current: document_hub_entries.is_current,
  uploaded_by: document_hub_entries.uploaded_by,
  uploaded_at: document_hub_entries.uploaded_at,
  notes: document_hub_entries.notes,
  is_test_project: document_hub_entries.is_test_project,
} as const;

export async function getDocumentForTenant(tenantId: string, id: string) {
  const rows = await db
    .select(documentSelectColumns)
    .from(document_hub_entries)
    .where(
      and(
        eq(document_hub_entries.document_id, id),
        eq(document_hub_entries.tenant_id, tenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

const PATCH_ALLOWED_FIELDS = new Set<string>([
  'filename',
  'subkind',
  'linked_entity_type',
  'linked_entity_id',
  'external_visible',
  'notes',
]);

export function isPatchField(name: string): boolean {
  return PATCH_ALLOWED_FIELDS.has(name);
}

/**
 * Validate a (linked_entity_type, linked_entity_id) pair — both must be
 * present together or both absent.  Returns null when valid, an error
 * message otherwise.
 */
export function validateLinkedEntity(
  type: string | null,
  id: string | null,
): string | null {
  if (type === null && id === null) return null;
  if (type !== null && id !== null) {
    if (!isDocumentLinkedEntityType(type)) return 'linked_entity_type is invalid';
    if (!isUuid(id)) return 'linked_entity_id must be a uuid';
    return null;
  }
  return 'linked_entity_type and linked_entity_id must be provided together';
}
