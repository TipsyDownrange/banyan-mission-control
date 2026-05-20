/**
 * BAN-376 Customer Pipeline P2 — POST /api/inquiries/intake-email
 *
 * Webhook entrypoint for the Outlook → Banyan email connector. Microsoft
 * Graph (or an Outlook-side forwarding script) POSTs the canonical JSON
 * payload to this route with the shared-secret header. We resolve the
 * tenant from the intake address, parse the From + subject, render the
 * email body to a PDF, upload it and all original attachments to the
 * per-inquiry Drive folder, create the inquiry row, persist the
 * inquiry_attachments registry, and write an inquiry_state_transitions
 * audit row in place of Activity Spine emission (Charter Rule 2 keeps the
 * five §19 INQUIRY_* event types ADR-gated for now).
 *
 * Status codes:
 *   201 — inquiry created (returns inquiry_id + inquiry_number)
 *   400 — payload malformed
 *   401 — secret missing or wrong
 *   404 — tenant kid did not resolve to an active tenant
 *   413 — payload exceeded the attachment count / size cap
 *   502 — Drive upload failed (operator should resend)
 *   503 — INTAKE_EMAIL_WEBHOOK_SECRET not configured on server
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  inquiries,
  inquiry_attachments,
  inquiry_state_transitions,
  users,
} from '@/db';
import {
  INTAKE_SECRET_HEADER,
  checkIntakeSecret,
  resolveTenantByKid,
} from '@/lib/inquiries/email-intake-gate';
import {
  MAX_ATTACHMENT_COUNT,
  MAX_TOTAL_ATTACHMENT_BYTES,
  buildInquiryDescriptionFromBody,
  classifyEmailIntake,
  deriveCustomerName,
  extractTenantKidFromIntakeTo,
  parseFromAddress,
  totalAttachmentBytes,
} from '@/lib/inquiries/email-parser';
import { nextInquiryNumber } from '@/lib/inquiries/helpers';
import {
  type EmailAttachmentInput,
  uploadEmailIntakeToDrive,
} from '@/lib/inquiries/email-to-drive';

interface RawAttachment {
  filename?: unknown;
  mime_type?: unknown;
  base64_content?: unknown;
}

interface RawPayload {
  to?: unknown;
  from?: unknown;
  forwarder?: unknown;
  subject?: unknown;
  body_text?: unknown;
  body_html?: unknown;
  received_at?: unknown;
  attachments?: unknown;
}

const EMAIL_BASIC_REGEX = /^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/;

export async function POST(req: Request) {
  const secretCheck = checkIntakeSecret(req.headers.get(INTAKE_SECRET_HEADER));
  if (!secretCheck.ok) return secretCheck.response;

  let body: RawPayload;
  try {
    body = (await req.json()) as RawPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const toRaw = typeof body.to === 'string' ? body.to.trim() : '';
  const fromRaw = typeof body.from === 'string' ? body.from.trim() : '';
  const forwarderRaw = typeof body.forwarder === 'string' ? body.forwarder.trim() : '';
  const subjectRaw = typeof body.subject === 'string' ? body.subject : '';
  const bodyText = typeof body.body_text === 'string' ? body.body_text : '';
  const receivedAtRaw = typeof body.received_at === 'string' ? body.received_at : '';

  if (!toRaw) {
    return NextResponse.json({ error: '`to` is required' }, { status: 400 });
  }
  const tenantKid = extractTenantKidFromIntakeTo(toRaw);
  if (!tenantKid) {
    return NextResponse.json(
      { error: '`to` must match intake+{tenant_kid}@banyan-os.app' },
      { status: 400 },
    );
  }

  const fromParsed = parseFromAddress(fromRaw);
  if (!fromParsed) {
    return NextResponse.json({ error: '`from` must be a valid email address' }, { status: 400 });
  }

  let forwarderEmail: string | null = null;
  if (forwarderRaw) {
    const fwd = parseFromAddress(forwarderRaw);
    if (!fwd) {
      return NextResponse.json(
        { error: '`forwarder` must be a valid email address when supplied' },
        { status: 400 },
      );
    }
    forwarderEmail = fwd.email;
  }

  const receivedAtDate = new Date(receivedAtRaw);
  if (!receivedAtRaw || Number.isNaN(receivedAtDate.getTime())) {
    return NextResponse.json(
      { error: '`received_at` must be an ISO 8601 timestamp' },
      { status: 400 },
    );
  }

  const rawAttachments: RawAttachment[] = Array.isArray(body.attachments)
    ? (body.attachments as RawAttachment[])
    : [];
  if (rawAttachments.length > MAX_ATTACHMENT_COUNT) {
    return NextResponse.json(
      {
        error: `too many attachments (${rawAttachments.length}); max is ${MAX_ATTACHMENT_COUNT}`,
        code: 'ATTACHMENT_COUNT_EXCEEDED',
      },
      { status: 413 },
    );
  }

  const normalisedAttachments: EmailAttachmentInput[] = [];
  for (let i = 0; i < rawAttachments.length; i++) {
    const a = rawAttachments[i];
    const filename = typeof a.filename === 'string' ? a.filename.trim() : '';
    const mimeType = typeof a.mime_type === 'string' ? a.mime_type.trim() : '';
    const base64 = typeof a.base64_content === 'string' ? a.base64_content : '';
    if (!filename || !base64) {
      return NextResponse.json(
        { error: `attachments[${i}] requires filename and base64_content` },
        { status: 400 },
      );
    }
    normalisedAttachments.push({ filename, mime_type: mimeType, base64_content: base64 });
  }

  const totalBytes = totalAttachmentBytes(normalisedAttachments);
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return NextResponse.json(
      {
        error: `attachment payload too large (${totalBytes} bytes); max is ${MAX_TOTAL_ATTACHMENT_BYTES}`,
        code: 'ATTACHMENT_BYTES_EXCEEDED',
      },
      { status: 413 },
    );
  }

  const tenantResolution = await resolveTenantByKid(tenantKid);
  if (!tenantResolution.ok) return tenantResolution.response;
  const { tenantId, tenantKid: tenantKidStored } = tenantResolution;

  const forwarderUserId = forwarderEmail
    ? await lookupActiveUserIdByEmail(forwarderEmail)
    : null;
  const orphanForwardNote =
    forwarderEmail && !forwarderUserId
      ? `Forwarder ${forwarderEmail} not in users table — orphan forward`
      : null;

  const classification = classifyEmailIntake({ subject: subjectRaw });
  const customerName = deriveCustomerName(fromRaw) || fromParsed.email;
  const contactEmail = fromParsed.email;
  const baseDescription = buildInquiryDescriptionFromBody(bodyText);
  const inquiryDescription = orphanForwardNote
    ? appendNote(baseDescription, orphanForwardNote)
    : baseDescription;

  const assignedToUserId = classification.isRFP
    ? await lookupGmUserId(tenantId)
    : null;
  const assignedRole = classification.isRFP ? 'GM' : null;
  const assignedAt = assignedToUserId ? new Date() : null;

  const inquiryNumber = await nextInquiryNumber(tenantId);

  const inserted = await db
    .insert(inquiries)
    .values({
      tenant_id: tenantId,
      inquiry_number: inquiryNumber,
      source: classification.source,
      source_detail: fromParsed.email,
      source_evidence: `email:${fromParsed.email}|received:${receivedAtDate.toISOString()}`,
      first_contact_user_id: forwarderUserId,
      first_contact_at: receivedAtDate,
      first_contact_method: 'OFFICE_FORWARD',
      customer_name: customerName,
      contact_email: contactEmail,
      inquiry_type_initial: classification.inquiryTypeInitial,
      inquiry_description: inquiryDescription || null,
      estimated_value_band: 'UNKNOWN',
      assigned_to_user_id: assignedToUserId,
      assigned_at: assignedAt,
      assigned_role: assignedRole,
      state: 'NEW',
      state_changed_at: new Date(),
      notes: subjectRaw ? `Subject: ${subjectRaw}` : null,
      is_test_project: false,
    })
    .returning();
  const inquiryRow = inserted[0];

  let driveResult;
  try {
    driveResult = await uploadEmailIntakeToDrive({
      tenantKid: tenantKidStored,
      inquiryNumber,
      pdfData: {
        inquiry_number: inquiryNumber,
        to: toRaw,
        from: fromRaw,
        forwarder: forwarderEmail,
        subject: subjectRaw,
        received_at: receivedAtDate.toISOString(),
        body_text: bodyText,
      },
      attachments: normalisedAttachments,
    });
  } catch (err) {
    console.error('[intake-email] Drive upload failed', err);
    return NextResponse.json(
      {
        error: 'Drive upload failed; inquiry was created but attachments are missing',
        code: 'DRIVE_UPLOAD_FAILED',
        inquiry_id: inquiryRow.inquiry_id,
        inquiry_number: inquiryNumber,
      },
      { status: 502 },
    );
  }

  const attachmentRows = [
    {
      tenant_id: tenantId,
      inquiry_id: inquiryRow.inquiry_id,
      attachment_kind: 'EMAIL_BODY',
      drive_file_id: driveResult.emailBody.driveFileId,
      original_filename: driveResult.emailBody.filename,
      mime_type: driveResult.emailBody.mimeType,
      size_bytes: driveResult.emailBody.sizeBytes,
    },
    ...driveResult.attachments.map(a => ({
      tenant_id: tenantId,
      inquiry_id: inquiryRow.inquiry_id,
      attachment_kind: 'EMAIL_ATTACHMENT',
      drive_file_id: a.driveFileId,
      original_filename: a.filename,
      mime_type: a.mimeType,
      size_bytes: a.sizeBytes,
    })),
  ];
  await db.insert(inquiry_attachments).values(attachmentRows);

  const auditReason = classification.isRFP
    ? 'auto_created_from_email_intake;auto_routed_to_gm_rfp_detected'
    : 'auto_created_from_email_intake';
  await db.insert(inquiry_state_transitions).values({
    tenant_id: tenantId,
    inquiry_id: inquiryRow.inquiry_id,
    from_state: null,
    to_state: 'NEW',
    changed_by: null,
    reason: auditReason,
  });

  return NextResponse.json(
    {
      ok: true,
      inquiry_id: inquiryRow.inquiry_id,
      inquiry_number: inquiryNumber,
      drive_folder_id: driveResult.folderId,
      attachment_count: attachmentRows.length,
      rfp_detected: classification.isRFP,
      orphan_forward: Boolean(orphanForwardNote),
    },
    { status: 201 },
  );
}

async function lookupActiveUserIdByEmail(email: string): Promise<string | null> {
  if (!EMAIL_BASIC_REGEX.test(email)) return null;
  const rows = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(and(eq(users.email, email), eq(users.active, true)))
    .limit(1);
  return rows[0]?.user_id ?? null;
}

async function lookupGmUserId(_tenantId: string): Promise<string | null> {
  // Spec §12.2: RFP detection routes to the GM. Kula has a single GM (Sean);
  // we resolve by role and pick deterministically by email so multiple GMs
  // (other tenants) still get a stable assignment until tenant-specific
  // routing arrives in a later dispatch.
  const rows = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(and(eq(users.role, 'gm'), eq(users.active, true)))
    .orderBy(users.email)
    .limit(1);
  return rows[0]?.user_id ?? null;
}

function appendNote(base: string, note: string): string {
  const trimmed = base.trim();
  if (!trimmed) return note;
  return `${trimmed} — ${note}`;
}
