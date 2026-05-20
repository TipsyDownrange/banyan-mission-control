/**
 * BAN-376 Customer Pipeline P2 — Drive upload helper for the email
 * connector. Generates the email-body PDF, ensures the per-inquiry Drive
 * folder exists, uploads the body PDF and every original attachment, and
 * returns the Drive file ids the route will persist into
 * inquiry_attachments.
 *
 * Folder layout (production):
 *   BanyanOS/Inquiries/{tenant_kid}/{inquiry_number}/
 *     • {inquiry_number}-email-body.pdf   (kind = EMAIL_BODY)
 *     • {original filenames…}              (kind = EMAIL_ATTACHMENT)
 *
 * Folder layout (staging): the per-tenant tree is rooted under the
 * STAGING_DRIVE_FOLDER_ID env var instead of the canonical Banyan shared
 * drive root, mirroring lib/drive-wo-folder.ts's staging routing so the
 * staging lane cannot accidentally write into production Drive.
 */

import { Readable } from 'node:stream';
import {
  BANYAN_DRIVE_ID,
  type DriveClient,
  findOrCreateFolder,
  getWODriveClient,
  resolveStagingDriveParentId,
} from '@/lib/drive-wo-folder';
import { isStaging } from '@/lib/env';
import { renderEmailBodyPDF, type EmailBodyPDFData } from '@/lib/pdf-email-body';

export const INQUIRIES_ROOT_FOLDER_NAME = 'Inquiries';
export const BANYAN_ROOT_FOLDER_NAME = 'BanyanOS';

export interface EmailAttachmentInput {
  filename: string;
  mime_type: string;
  base64_content: string;
}

export interface UploadedAttachment {
  driveFileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface EmailToDriveResult {
  folderId: string;
  emailBody: UploadedAttachment;
  attachments: UploadedAttachment[];
}

export interface UploadEmailIntakeArgs {
  tenantKid: string;
  inquiryNumber: string;
  pdfData: EmailBodyPDFData;
  attachments: ReadonlyArray<EmailAttachmentInput>;
  /** Optional Drive client override for tests. */
  driveOverride?: DriveClient;
}

/**
 * Ensure the per-inquiry Drive folder exists, upload the body PDF, then
 * each attachment. Drive operations are sequenced so a failure stops the
 * batch — the route catches and returns 502 so the operator can resend.
 */
export async function uploadEmailIntakeToDrive(args: UploadEmailIntakeArgs): Promise<EmailToDriveResult> {
  const drive = args.driveOverride || getWODriveClient();
  const folderId = await ensureInquiryFolder(drive, args.tenantKid, args.inquiryNumber);

  const bodyBuffer = await renderEmailBodyPDF(args.pdfData);
  const bodyFilename = `${args.inquiryNumber}-email-body.pdf`;
  const emailBody = await uploadBytesToFolder(drive, folderId, {
    filename: bodyFilename,
    mimeType: 'application/pdf',
    bytes: bodyBuffer,
  });

  const uploaded: UploadedAttachment[] = [];
  for (const a of args.attachments) {
    const bytes = Buffer.from(a.base64_content, 'base64');
    const u = await uploadBytesToFolder(drive, folderId, {
      filename: a.filename,
      mimeType: a.mime_type || 'application/octet-stream',
      bytes,
    });
    uploaded.push(u);
  }

  return { folderId, emailBody, attachments: uploaded };
}

/**
 * Find or create BanyanOS/Inquiries/{tenant_kid}/{inquiry_number}/ under
 * the Banyan shared drive root (production) or under STAGING_DRIVE_FOLDER_ID
 * (staging). Idempotent — re-running on the same inquiry resolves the same
 * folder id.
 */
export async function ensureInquiryFolder(
  drive: DriveClient,
  tenantKid: string,
  inquiryNumber: string,
): Promise<string> {
  const stagingParentId = isStaging() ? resolveStagingDriveParentId() : null;
  const rootParentId = stagingParentId !== null ? stagingParentId : BANYAN_DRIVE_ID;
  const banyanRootId = await findOrCreateFolder(drive, BANYAN_ROOT_FOLDER_NAME, rootParentId);
  const inquiriesRootId = await findOrCreateFolder(drive, INQUIRIES_ROOT_FOLDER_NAME, banyanRootId);
  const tenantFolderId = await findOrCreateFolder(drive, tenantKid, inquiriesRootId);
  return findOrCreateFolder(drive, inquiryNumber, tenantFolderId);
}

interface UploadBytesArgs {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

async function uploadBytesToFolder(
  drive: DriveClient,
  parentFolderId: string,
  args: UploadBytesArgs,
): Promise<UploadedAttachment> {
  const res = await drive.files.create({
    requestBody: {
      name: args.filename,
      parents: [parentFolderId],
      mimeType: args.mimeType,
    },
    media: {
      mimeType: args.mimeType,
      body: Readable.from(args.bytes),
    },
    supportsAllDrives: true,
    fields: 'id,name,mimeType,size',
  });
  const data = res.data;
  if (!data.id) {
    throw new Error(`Drive did not return a file id for ${args.filename}`);
  }
  return {
    driveFileId: data.id,
    filename: data.name || args.filename,
    mimeType: data.mimeType || args.mimeType,
    sizeBytes: data.size ? Number(data.size) : args.bytes.byteLength,
  };
}
