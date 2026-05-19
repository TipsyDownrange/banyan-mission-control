/**
 * BAN-346 PM-V1.0-G — PM Handoff Receipt route helpers (parsers + shared
 * select fragments).  Mirrors lib/pm/action-items/route-utils.ts.
 */

import { and, eq } from 'drizzle-orm';
import { db, engagements, pm_handoff_receipts, users } from '@/db';
import {
  isCriticalGapStatus,
  isPmHandoffState,
  type CriticalGap,
  type CriticalGapStatus,
  type PmHandoffState,
} from './types';

export function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function optionalString(value: unknown): string | null {
  const trimmed = trimString(value);
  return trimmed || null;
}

export function parsePmHandoffState(value: unknown): PmHandoffState | null {
  return isPmHandoffState(value) ? value : null;
}

export function parseCriticalGapStatus(value: unknown): CriticalGapStatus | null {
  return isCriticalGapStatus(value) ? value : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Validate + normalize an inbound critical_gaps array.  Returns an array of
 * sanitized gaps, or null if the input is malformed.  Empty array is fine.
 */
export function parseCriticalGaps(value: unknown): CriticalGap[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const out: CriticalGap[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const gap_id = trimString(r.gap_id);
    const gap_type = trimString(r.gap_type);
    const description = trimString(r.description);
    const statusRaw = trimString(r.status) || 'OPEN';
    const status = parseCriticalGapStatus(statusRaw);
    if (!gap_id || !gap_type || !description || !status) return null;
    out.push({ gap_id, gap_type, description, status });
  }
  return out;
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

export async function resolveEngagementById(tenantId: string, engagementId: string) {
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
        eq(engagements.engagement_id, engagementId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getHandoffReceiptForTenant(tenantId: string, id: string) {
  const rows = await db
    .select()
    .from(pm_handoff_receipts)
    .where(
      and(
        eq(pm_handoff_receipts.id, id),
        eq(pm_handoff_receipts.tenant_id, tenantId),
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

const PATCH_ALLOWED_FIELDS = new Set<string>([
  'reviewer_notes',
  'critical_gaps',
  'packet_drive_file_id',
]);

export function isPatchField(name: string): boolean {
  return PATCH_ALLOWED_FIELDS.has(name);
}
