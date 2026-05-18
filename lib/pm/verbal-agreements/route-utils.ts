import { and, eq } from 'drizzle-orm';
import { db, engagements, verbal_agreements } from '@/db';
import {
  isFormalDocumentationType,
  isVerbalAgreementStatus,
  isVerbalAgreementType,
  type VerbalAgreementType,
} from './state-machine';

export const SUBJECT_MAX = 200;

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

export function optionalNumberString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

export function optionalInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseAgreementType(value: unknown): VerbalAgreementType {
  return isVerbalAgreementType(value) ? value : 'OTHER';
}

export function parseFormalDocType(value: unknown): 'CHANGE_ORDER' | 'TM_TICKET' | 'RFI' | null {
  return isFormalDocumentationType(value) ? value : null;
}

export function parseStatus(value: unknown): string | null {
  return isVerbalAgreementStatus(value) ? value : null;
}

export async function resolveEngagementByKid(tenantId: string, kid: string) {
  const rows = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      pm_handoff_state: engagements.pm_handoff_state,
      status: engagements.status,
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

export async function getVerbalAgreementForTenant(tenantId: string, id: string) {
  const rows = await db
    .select({
      verbal_agreement_id: verbal_agreements.verbal_agreement_id,
      tenant_id: verbal_agreements.tenant_id,
      engagement_id: verbal_agreements.engagement_id,
      captured_at: verbal_agreements.captured_at,
      captured_by: verbal_agreements.captured_by,
      occurred_at: verbal_agreements.occurred_at,
      subject: verbal_agreements.subject,
      external_party_org: verbal_agreements.external_party_org,
      external_party_contact_name: verbal_agreements.external_party_contact_name,
      external_party_contact_role: verbal_agreements.external_party_contact_role,
      external_party_contact_email: verbal_agreements.external_party_contact_email,
      external_party_contact_phone: verbal_agreements.external_party_contact_phone,
      agreement_type: verbal_agreements.agreement_type,
      cost_impact_estimate: verbal_agreements.cost_impact_estimate,
      schedule_impact_days: verbal_agreements.schedule_impact_days,
      agreement_summary: verbal_agreements.agreement_summary,
      context_or_circumstances: verbal_agreements.context_or_circumstances,
      audio_recording_drive_id: verbal_agreements.audio_recording_drive_id,
      photo_documentation_drive_ids: verbal_agreements.photo_documentation_drive_ids,
      written_followup_email_drive_id: verbal_agreements.written_followup_email_drive_id,
      followup_email_sent: verbal_agreements.followup_email_sent,
      followup_email_sent_date: verbal_agreements.followup_email_sent_date,
      formal_documentation_generated: verbal_agreements.formal_documentation_generated,
      formal_documentation_ref: verbal_agreements.formal_documentation_ref,
      formal_documentation_type: verbal_agreements.formal_documentation_type,
      status: verbal_agreements.status,
      external_visible: verbal_agreements.external_visible,
      created_at: verbal_agreements.created_at,
      updated_at: verbal_agreements.updated_at,
      updated_by: verbal_agreements.updated_by,
      kid: engagements.kid,
      is_test_project: engagements.is_test_project,
    })
    .from(verbal_agreements)
    .innerJoin(engagements, eq(verbal_agreements.engagement_id, engagements.engagement_id))
    .where(
      and(
        eq(verbal_agreements.verbal_agreement_id, id),
        eq(verbal_agreements.tenant_id, tenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
