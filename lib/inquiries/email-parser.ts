/**
 * BAN-376 Customer Pipeline P2 — pure email-intake parsing helpers.
 *
 * Kept free of @/db / drizzle / next imports so the unit tests can exercise
 * the regex matrix and the From-line parser without bringing the Postgres
 * driver or NextRequest into jsdom. The webhook route in
 * app/api/inquiries/intake-email/route.ts composes these helpers with the
 * DB-touching gate + helpers.
 *
 * v1.0 scope: deterministic parsing only. v1.1+ Kai parsing is out of scope
 * per dispatch (spec §14 enhanced mode is not implemented here).
 */

export const INTAKE_TO_REGEX = /^intake\+([A-Za-z0-9][A-Za-z0-9_-]*)@banyan-os\.app$/i;

const EMAIL_REGEX = /^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/;

/**
 * Spec §12.2 — RFP keyword matrix. We trigger on the standalone words /
 * phrases (RFP, ITB, "request for proposal", "invitation to bid",
 * "bid request") OR a bracketed [RFP] tag a forwarder may add. The
 * subject is matched case-insensitive; word boundaries prevent matching
 * substrings inside unrelated words like "DRAFP" or "ITBoyer".
 */
export const RFP_SUBJECT_REGEX =
  /(\[RFP\]|\bRFP\b|\bITB\b|\brequest for proposal\b|\binvitation to bid\b|\bbid request\b)/i;

export type InquiryTypeInitialLite = 'WORK_ORDER' | 'PROJECT' | 'UNCLEAR';
export type InquirySourceLite =
  | 'PHONE' | 'EMAIL' | 'WALK_IN' | 'RFP'
  | 'WEBSITE_FORM' | 'GBA_REVIEW' | 'REFERRAL' | 'OTHER';

export interface ParsedFromAddress {
  /** The address portion (e.g. "jane@co.com"), lower-cased. */
  email: string;
  /** The unquoted display name if present, else null. */
  displayName: string | null;
}

/**
 * Parse an email From-style header value. Accepts:
 *   "Jane Doe <jane@co.com>"         → { email: 'jane@co.com', displayName: 'Jane Doe' }
 *   "\"Doe, Jane\" <jane@co.com>"    → { email: 'jane@co.com', displayName: 'Doe, Jane' }
 *   "<jane@co.com>"                   → { email: 'jane@co.com', displayName: null }
 *   "jane@co.com"                     → { email: 'jane@co.com', displayName: null }
 *
 * Returns null on anything that isn't a recognisable email shape (no @, etc).
 * Whitespace is trimmed; the email is normalised to lowercase. The display
 * name keeps its original casing.
 */
export function parseFromAddress(raw: string | null | undefined): ParsedFromAddress | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  const angle = trimmed.match(/^(.*?)<\s*([^>]+?)\s*>\s*$/);
  if (angle) {
    const namePart = angle[1].trim();
    const emailPart = angle[2].trim();
    if (!EMAIL_REGEX.test(emailPart)) return null;
    let displayName: string | null = null;
    if (namePart) {
      const unquoted = namePart.replace(/^"(.*)"$/, '$1').trim();
      displayName = unquoted || null;
    }
    return { email: emailPart.toLowerCase(), displayName };
  }

  if (EMAIL_REGEX.test(trimmed)) {
    return { email: trimmed.toLowerCase(), displayName: null };
  }
  return null;
}

/**
 * Derive a customer_name from a From header. Priority:
 *   1. display name if present.
 *   2. local-part of the email, hyphens/underscores/dots → spaces, with
 *      first-letter caps per word ("jane.doe" → "Jane Doe").
 *   3. null if the From cannot be parsed at all.
 */
export function deriveCustomerName(raw: string | null | undefined): string | null {
  const parsed = parseFromAddress(raw);
  if (!parsed) return null;
  if (parsed.displayName) return parsed.displayName;
  const local = parsed.email.split('@')[0] || '';
  if (!local) return null;
  return local
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)
    .join(' ');
}

/**
 * Validate a "to" address against the canonical intake pattern and extract
 * the tenant kid. Returns the kid (preserved casing) or null if it doesn't
 * match. The kid is *not* lower-cased here because tenants.kid is unique on
 * the raw stored value; the route will perform the DB lookup in whatever
 * form the payload supplied.
 */
export function extractTenantKidFromIntakeTo(to: string | null | undefined): string | null {
  const trimmed = String(to || '').trim();
  if (!trimmed) return null;
  const m = trimmed.match(INTAKE_TO_REGEX);
  return m ? m[1] : null;
}

export interface ClassifyEmailIntakeArgs {
  subject: string | null | undefined;
}

export interface ClassifyEmailIntakeResult {
  /** True if the subject matches the RFP keyword matrix (spec §12.2). */
  isRFP: boolean;
  inquiryTypeInitial: InquiryTypeInitialLite;
  /**
   * The §5 source bucket. v1.0 deterministic rule:
   *   • RFP if subject matches the RFP regex (a forwarded RFP is canonically
   *     an RFP regardless of channel)
   *   • EMAIL otherwise (the inbound channel attribute is itself email)
   */
  source: InquirySourceLite;
}

export function classifyEmailIntake(args: ClassifyEmailIntakeArgs): ClassifyEmailIntakeResult {
  const subject = String(args.subject || '');
  const isRFP = RFP_SUBJECT_REGEX.test(subject);
  if (isRFP) {
    return { isRFP: true, inquiryTypeInitial: 'PROJECT', source: 'RFP' };
  }
  return { isRFP: false, inquiryTypeInitial: 'UNCLEAR', source: 'EMAIL' };
}

/**
 * Trim a free-text email body for the inquiry_description field (spec §5).
 * The full body is preserved in Drive as the email-body PDF; this is the
 * inline summary used by the inquiry inbox. Falls back to empty string if
 * the body is null/blank. Whitespace is collapsed to single spaces so the
 * inbox preview reads cleanly.
 */
export function buildInquiryDescriptionFromBody(
  body: string | null | undefined,
  maxLen = 500,
): string {
  const collapsed = String(body || '').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLen) return collapsed;
  return collapsed.slice(0, maxLen);
}

/** Total payload-attachment size, in bytes. */
export function totalAttachmentBytes(
  attachments: ReadonlyArray<{ base64_content?: string | null | undefined }> | null | undefined,
): number {
  if (!Array.isArray(attachments)) return 0;
  let total = 0;
  for (const a of attachments) {
    const b64 = String(a?.base64_content || '');
    // 4 base64 chars → 3 bytes (ignoring trailing `=` padding for the rough
    // size estimate that the 25 MB cap uses).
    const padding = (b64.match(/=+$/)?.[0] || '').length;
    total += Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
  }
  return total;
}

export const MAX_ATTACHMENT_COUNT = 25;
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
