/**
 * BAN-337 Pay Apps v2b — Drive folder + upload helpers for pay-app artifacts.
 *
 * Pay App artifact tree under the engagement Drive folder:
 *   Pay Apps/
 *     {Pay App #}/
 *       Notarized/{pay_app_id}-notarized.pdf
 *       Textura/{pay_app_id}-invoice.csv
 *       Textura/{pay_app_id}-bundle.zip
 *
 * The engagement Drive folder URL is stored on engagements.drive_folder_url
 * (when present) and/or engagements.drive_folder_id. If neither is set the
 * upload helpers return null so the caller can decide whether to require a
 * Drive folder or to proceed with a synthetic id (test/staging only).
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { findOrCreateFolder, extractFolderIdFromUrl, getWODriveClient } from '@/lib/drive-wo-folder';

export interface EngagementDriveRef {
  drive_folder_url?: string | null;
  drive_folder_id?: string | null;
}

/** Resolve the engagement Drive folder id, preferring the explicit id column. */
export function resolveEngagementDriveFolderId(eng: EngagementDriveRef): string | null {
  if (eng.drive_folder_id) return eng.drive_folder_id;
  return extractFolderIdFromUrl(eng.drive_folder_url ?? null);
}

export interface PayAppFolderRefs {
  pay_apps_folder_id: string;
  pay_app_folder_id: string;
  notarized_folder_id: string;
  textura_folder_id: string;
}

/**
 * Ensure the Pay App folder tree exists under the engagement Drive folder.
 * Returns the resolved folder ids; missing engagement folder → throws.
 */
export async function ensurePayAppFolders(
  engagementFolderId: string,
  payAppNumber: number,
): Promise<PayAppFolderRefs> {
  const drive = getWODriveClient();
  const payAppsFolderId = await findOrCreateFolder(drive, 'Pay Apps', engagementFolderId);
  const payAppFolderId = await findOrCreateFolder(drive, String(payAppNumber), payAppsFolderId);
  const notarizedFolderId = await findOrCreateFolder(drive, 'Notarized', payAppFolderId);
  const texturaFolderId = await findOrCreateFolder(drive, 'Textura', payAppFolderId);
  return {
    pay_apps_folder_id: payAppsFolderId,
    pay_app_folder_id: payAppFolderId,
    notarized_folder_id: notarizedFolderId,
    textura_folder_id: texturaFolderId,
  };
}

export interface UploadResult {
  drive_file_id: string;
  drive_file_name: string;
}

/** Upload a binary buffer to a target Drive folder. */
export async function uploadBufferToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<UploadResult> {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive']);
  const drive = google.drive({ version: 'v3', auth });
  // Stream the buffer through a PassThrough so googleapis can consume it.
  const { Readable } = await import('stream');
  const stream = Readable.from(buffer);
  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: stream },
    supportsAllDrives: true,
    fields: 'id,name',
  });
  if (!created.data.id) throw new Error('Drive upload returned no file id');
  return { drive_file_id: created.data.id, drive_file_name: created.data.name ?? fileName };
}
