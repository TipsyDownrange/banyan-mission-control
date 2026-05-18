import { and, eq, sql } from 'drizzle-orm';
import { db, engagements, meetings, meeting_attendees, users } from '@/db';
import {
  isMeetingType,
  isMeetingSourcePlatform,
  type MeetingType,
  type MeetingSourcePlatform,
} from './types';

export function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function optionalString(value: unknown): string | null {
  const trimmed = trimString(value);
  return trimmed || null;
}

export function optionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
}

export function optionalInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseMeetingType(value: unknown): MeetingType | null {
  return isMeetingType(value) ? value : null;
}

export function parseMeetingSourcePlatform(value: unknown): MeetingSourcePlatform {
  return isMeetingSourcePlatform(value) ? value : 'MANUAL';
}

export function parseMeetingDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
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

export async function getMeetingForTenant(tenantId: string, id: string) {
  const rows = await db
    .select({
      meeting_id: meetings.meeting_id,
      tenant_id: meetings.tenant_id,
      engagement_id: meetings.engagement_id,
      title: meetings.title,
      meeting_date: meetings.meeting_date,
      duration_minutes: meetings.duration_minutes,
      meeting_type: meetings.meeting_type,
      summary: meetings.summary,
      key_topics: meetings.key_topics,
      decisions_made: meetings.decisions_made,
      transcript_drive_file_id: meetings.transcript_drive_file_id,
      source_recording_url: meetings.source_recording_url,
      source_platform: meetings.source_platform,
      source_external_id: meetings.source_external_id,
      external_visible: meetings.external_visible,
      created_at: meetings.created_at,
      created_by: meetings.created_by,
      updated_at: meetings.updated_at,
      updated_by: meetings.updated_by,
      kid: engagements.kid,
      is_test_project: engagements.is_test_project,
    })
    .from(meetings)
    .leftJoin(engagements, eq(meetings.engagement_id, engagements.engagement_id))
    .where(
      and(
        eq(meetings.meeting_id, id),
        eq(meetings.tenant_id, tenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getMeetingAttendees(tenantId: string, meetingId: string) {
  return db
    .select()
    .from(meeting_attendees)
    .where(
      and(
        eq(meeting_attendees.tenant_id, tenantId),
        eq(meeting_attendees.meeting_id, meetingId),
      ),
    );
}

export type AttendeeInput = {
  name: string;
  email: string | null;
  organization: string | null;
  role: string | null;
  is_kula_user: boolean;
  kula_user_id: string | null;
  attended: boolean;
};

export function parseAttendeeInput(raw: unknown): { ok: true; attendee: AttendeeInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'attendee must be an object' };
  const body = raw as Record<string, unknown>;
  const name = trimString(body.name);
  if (!name) return { ok: false, error: 'attendee.name is required' };
  const isKula = body.is_kula_user === true;
  const kulaUserId = optionalString(body.kula_user_id);
  if (!isKula && kulaUserId) {
    return { ok: false, error: 'attendee.kula_user_id must be null when is_kula_user is false' };
  }
  return {
    ok: true,
    attendee: {
      name,
      email: optionalString(body.email),
      organization: optionalString(body.organization),
      role: optionalString(body.role),
      is_kula_user: isKula,
      kula_user_id: kulaUserId,
      attended: body.attended === undefined ? true : body.attended === true,
    },
  };
}

export async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  const rows = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(sql`lower(${users.email}) = ${trimmed}`)
    .limit(1);
  return rows[0]?.user_id ?? null;
}

const SUMMARY_TRIGGER_FIELDS = new Set(['summary', 'key_topics', 'decisions_made']);

export function patchTouchesSummary(updates: Record<string, unknown>): boolean {
  for (const k of Object.keys(updates)) {
    if (SUMMARY_TRIGGER_FIELDS.has(k)) return true;
  }
  return false;
}
