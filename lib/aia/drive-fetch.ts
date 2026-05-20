/**
 * AIA Submission Packet Export — Drive content fetcher.
 *
 * Thin Buffer-fetch wrapper around the googleapis Drive client used by the
 * submission-bundle route to pull notarized pay app PDFs, lien-waiver PDFs,
 * and any GC-attached docs by Drive file id. Kept in its own module so
 * tests can `jest.mock` it without touching the upload helpers in
 * lib/aia/drive-pay-app-folders.ts.
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

/** Hard cap on a single Drive source — protects against runaway memory use. */
export const MAX_DRIVE_FETCH_BYTES = 25 * 1024 * 1024;

export class DriveFetchTooLargeError extends Error {
  constructor(readonly fileId: string, readonly bytes: number) {
    super(`Drive file ${fileId} exceeds MAX_DRIVE_FETCH_BYTES (${bytes} > ${MAX_DRIVE_FETCH_BYTES})`);
    this.name = 'DriveFetchTooLargeError';
  }
}

/**
 * Fetch the binary content of a Drive file as a Buffer.
 * Returns null when fileId is null/empty so callers can fall back gracefully.
 * Throws DriveFetchTooLargeError when the file exceeds the per-file cap.
 */
export async function fetchDriveFileAsBuffer(fileId: string | null | undefined): Promise<Buffer | null> {
  if (!fileId) return null;

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive.readonly']);
  const drive = google.drive({ version: 'v3', auth });

  const meta = await drive.files.get({
    fileId,
    fields: 'id,name,size,mimeType',
    supportsAllDrives: true,
  });
  const sizeStr = meta.data.size;
  if (sizeStr) {
    const size = Number(sizeStr);
    if (Number.isFinite(size) && size > MAX_DRIVE_FETCH_BYTES) {
      throw new DriveFetchTooLargeError(fileId, size);
    }
  }

  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  const data = res.data as ArrayBuffer | Buffer;
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data);
}
