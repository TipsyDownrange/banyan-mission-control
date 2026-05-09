import type { ServiceWorkOrdersPostgresCandidate } from '@/lib/service-work-orders/postgres-shadow';

export type UserAliasRecord = { user_id: string; name?: string; email?: string };
export type AssignmentResolutionStatus = 'resolved' | 'partial' | 'unresolved' | 'unassigned';

export type AssignmentResolution = {
  raw: string | null;
  tokens: string[];
  assigned_user_ids: string[];
  unresolved_tokens: string[];
  status: AssignmentResolutionStatus;
};

export type LegacyShadowImportRow = {
  stableKey: string;
  values: {
    wo_number: string | null;
    kid: string | null;
    name: string | null;
    description: string | null;
    status: string | null;
    island: string | null;
    org_id: string | null;
    assigned_to: string | null;
    assigned_crew: string[] | null;
    system_type: string | null;
    scheduled_date: string | null;
    quote_total: string | null;
    folder_id: string | null;
    folder_url: string | null;
    legacy_customer_id: string | null;
    legacy_payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  manualReview: boolean;
  payloadHashInput: Record<string, unknown>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function clean(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeAssignmentAlias(value: string): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function splitAssignedTokens(raw: string | null | undefined): string[] {
  return clean(raw).split(/[,;/&]+|\band\b/i).map(clean).filter(Boolean);
}

export function buildUserAliasMap(usersRows: readonly (readonly string[])[]): Map<string, UserAliasRecord> {
  const aliases = new Map<string, UserAliasRecord>();
  for (const row of usersRows) {
    const user = { user_id: clean(row[0]), name: clean(row[1]), email: clean(row[3]) };
    if (!user.user_id) continue;
    for (const alias of [user.user_id, user.name, user.email]) {
      if (alias) aliases.set(normalizeAssignmentAlias(alias), user);
    }
  }
  return aliases;
}

export function resolveAssignment(raw: string | null | undefined, aliases: Map<string, UserAliasRecord>): AssignmentResolution {
  const rawClean = clean(raw) || null;
  const tokens = splitAssignedTokens(rawClean);
  const assigned_user_ids: string[] = [];
  const unresolved_tokens: string[] = [];

  for (const token of tokens) {
    const hit = aliases.get(normalizeAssignmentAlias(token));
    if (hit?.user_id) assigned_user_ids.push(hit.user_id);
    else unresolved_tokens.push(token);
  }

  const uniqueAssigned = Array.from(new Set(assigned_user_ids));
  const uniqueUnresolved = Array.from(new Set(unresolved_tokens));
  const status: AssignmentResolutionStatus = tokens.length === 0
    ? 'unassigned'
    : uniqueAssigned.length === tokens.length
      ? 'resolved'
      : uniqueAssigned.length > 0
        ? 'partial'
        : 'unresolved';

  return { raw: rawClean, tokens, assigned_user_ids: uniqueAssigned, unresolved_tokens: uniqueUnresolved, status };
}

export function isUuid(value: string | null | undefined): boolean {
  return UUID_RE.test(clean(value));
}

export function extractDriveFolderId(folderUrl: string | null | undefined): string | null {
  const value = clean(folderUrl);
  if (!value) return null;
  const foldersMatch = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch) return foldersMatch[1];
  const idParam = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return idParam ? idParam[1] : null;
}

export function buildLegacyShadowImportRow(
  candidate: ServiceWorkOrdersPostgresCandidate,
  assignment: AssignmentResolution,
): LegacyShadowImportRow {
  const stableKey = candidate.kid || (candidate.wo_number ? `WO-${candidate.wo_number}` : 'unknown');
  const assignedCrew = assignment.assigned_user_ids.length > 0 ? assignment.assigned_user_ids : null;
  const primaryAssigned = assignedCrew?.[0] || null;
  const folderId = extractDriveFolderId(candidate.folder_url);
  const orgId = isUuid(candidate.org_id_raw) ? candidate.org_id_raw : null;

  const legacy_payload = {
    ...candidate.legacy_payload,
    legacy_shadow_import: true,
    org_id_raw: candidate.org_id_raw,
    customer_id_raw: candidate.customer_id_raw,
    assigned_to_raw: candidate.assigned_to_raw,
    assigned_tokens: assignment.tokens,
    assigned_user_ids: assignment.assigned_user_ids,
    assigned_unresolved_tokens: assignment.unresolved_tokens,
    source_folder_url: candidate.folder_url,
  };

  const metadata = {
    ...candidate.metadata,
    import_mode: 'legacy_payload_shadow',
    confidence: 'low',
    assignment_resolution_status: assignment.status,
    assigned_unresolved_tokens: assignment.unresolved_tokens,
    org_id_raw_preserved: candidate.org_id_raw,
    org_id_mapped_to_uuid: Boolean(orgId),
    folder_id: folderId,
  };

  const values = {
    wo_number: candidate.wo_number,
    kid: candidate.kid,
    name: candidate.name,
    description: candidate.description,
    status: candidate.status,
    island: candidate.island,
    org_id: orgId,
    assigned_to: primaryAssigned,
    assigned_crew: assignedCrew,
    system_type: candidate.system_type,
    scheduled_date: candidate.scheduled_date,
    quote_total: candidate.quote_total,
    folder_id: folderId,
    folder_url: candidate.folder_url,
    legacy_customer_id: candidate.legacy_customer_id,
    legacy_payload,
    metadata,
  };

  return {
    stableKey,
    values,
    manualReview: Boolean(candidate.metadata.requires_manual_invoice_review),
    payloadHashInput: values,
  };
}
