import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

export const BANYAN_DRIVE_ID = '0AKSVpf3AnH7CUk9PVA';

export const STANDARD_SUBFOLDERS = [
  'Photos',
  'Quotes',
  'Correspondence',
  'Field Issues',
  'Daily Reports',
  'Measurements',
] as const;

export const KAI_SHADOW_FOLDER = '10 - AI Project Documents [Kai]';

export const KAI_SHADOW_SUBFOLDERS = [
  'Photos',
  'Daily Reports',
  'Measurements',
  'Field Issues',
  'System Generated',
] as const;

export type DriveClient = ReturnType<typeof google.drive>;

export class ServiceWOFolderCreationError extends Error {
  constructor(cause?: unknown) {
    const detail = cause instanceof Error ? ` ${cause.message}` : '';
    super(`Work order was not created because the Drive folder could not be created.${detail}`);
    this.name = 'ServiceWOFolderCreationError';
  }
}

export function getWODriveClient(): DriveClient {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive']);
  return google.drive({ version: 'v3', auth });
}

export function requireServiceWOFolderUrl(folderUrl: string | null | undefined): string {
  const normalized = String(folderUrl || '').trim();
  if (!normalized) throw new ServiceWOFolderCreationError();
  return normalized;
}

/**
 * Extract a Drive folder ID from a /folders/<id> URL or a bare ID. Returns null
 * if no plausible Drive id is present. Accepts trailing query strings.
 */
export function extractFolderIdFromUrl(url: string | null | undefined): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const folderMatch = raw.match(/\/folders\/([^/?&#]+)/);
  if (folderMatch) return folderMatch[1];
  const openMatch = raw.match(/[?&]id=([^&]+)/);
  if (openMatch) return openMatch[1];
  if (/^[-\w]{20,}$/.test(raw)) return raw;
  return null;
}

/**
 * Find an existing folder by name inside `parentId` within the Banyan shared
 * drive, or create it. Always shared-drive-scoped (corpora/driveId set).
 */
export async function findOrCreateFolder(
  drive: DriveClient,
  name: string,
  parentId: string,
): Promise<string> {
  const safeName = name.replace(/[^\w\s\-—()]/g, '').trim();
  const search = await drive.files.list({
    q: `name = '${safeName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`,
    driveId: BANYAN_DRIVE_ID,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: 'drive',
    fields: 'files(id,name)',
  });
  if (search.data.files && search.data.files.length > 0) {
    return search.data.files[0].id!;
  }
  const created = await drive.files.create({
    requestBody: { name: safeName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    supportsAllDrives: true,
    fields: 'id',
  });
  return created.data.id!;
}

/**
 * Creates the WO folder structure in the BanyanOS shared Drive:
 *   Service / [Island] / WO-[number] — [Customer Name] /
 *     Photos / Quotes / Correspondence / Field Issues / Daily Reports / Measurements
 *   plus Kai shadow tree (non-fatal).
 *
 * Returns the webViewLink of the WO folder.
 */
export async function createWOFolderStructure(
  woId: string,
  customerName: string,
  island: string,
  driveOverride?: DriveClient,
): Promise<string> {
  try {
    const drive = driveOverride || getWODriveClient();

    const serviceFolderId = await findOrCreateFolder(drive, 'Service', BANYAN_DRIVE_ID);
    const islandLabel = island || 'Unassigned';
    const islandFolderId = await findOrCreateFolder(drive, islandLabel, serviceFolderId);
    const woFolderName = `${woId} — ${customerName}`;
    const woFolderId = await findOrCreateFolder(drive, woFolderName, islandFolderId);

    await ensureStandardSubfolders(drive, woFolderId);
    await ensureKaiShadowTree(drive, woFolderId);

    try {
      await drive.permissions.create({
        fileId: woFolderId,
        supportsAllDrives: true,
        requestBody: { type: 'domain', domain: 'kulaglass.com', role: 'writer' },
      });
    } catch { /* non-fatal if already shared via drive inheritance */ }

    const meta = await drive.files.get({
      fileId: woFolderId,
      supportsAllDrives: true,
      fields: 'webViewLink',
    });

    return meta.data.webViewLink || `https://drive.google.com/drive/folders/${woFolderId}`;
  } catch (e) {
    console.error('WO folder creation failed:', e);
    throw new ServiceWOFolderCreationError(e);
  }
}

/**
 * Ensure the six canonical subfolders exist under `woFolderId`. Idempotent.
 * Returns the names that were created (subset of STANDARD_SUBFOLDERS).
 */
export async function ensureStandardSubfolders(
  drive: DriveClient,
  woFolderId: string,
): Promise<string[]> {
  const present = await listChildFolders(drive, woFolderId);
  const created: string[] = [];
  await Promise.all(STANDARD_SUBFOLDERS.map(async name => {
    if (present.has(name)) return;
    await findOrCreateFolder(drive, name, woFolderId);
    created.push(name);
  }));
  return created;
}

/**
 * Ensure the Kai shadow folder + its subfolders exist under `woFolderId`.
 * Non-fatal: failures are logged and swallowed (matches dispatch behavior).
 */
export async function ensureKaiShadowTree(
  drive: DriveClient,
  woFolderId: string,
): Promise<void> {
  try {
    const shadowFolderId = await findOrCreateFolder(drive, KAI_SHADOW_FOLDER, woFolderId);
    await Promise.all(KAI_SHADOW_SUBFOLDERS.map(name =>
      findOrCreateFolder(drive, name, shadowFolderId)
    ));
  } catch (shadowErr) {
    console.error('[createWOFolderStructure] shadow folder creation failed (non-fatal):', shadowErr);
  }
}

async function listChildFolders(drive: DriveClient, parentId: string): Promise<Set<string>> {
  const present = new Set<string>();
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      driveId: BANYAN_DRIVE_ID,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: 'drive',
      fields: 'nextPageToken, files(id,name)',
      pageToken,
    });
    for (const f of res.data.files || []) {
      if (f.name) present.add(f.name);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return present;
}

export type WOFolderClassification =
  | { kind: 'empty'; reason: string }
  | { kind: 'unparseable'; folderUrl: string; reason: string }
  | { kind: 'inaccessible'; folderId: string; folderUrl: string; reason: string }
  | { kind: 'trashed'; folderId: string; folderUrl: string; name?: string }
  | {
      kind: 'my_drive';
      folderId: string;
      folderUrl: string;
      name?: string;
      parents?: string[];
      owners?: Array<{ emailAddress?: string | null }>;
      driveId?: string | null;
    }
  | {
      kind: 'shared_drive_canonical';
      folderId: string;
      folderUrl: string;
      name?: string;
      driveId: string;
    }
  | {
      kind: 'shared_drive_missing_subfolders';
      folderId: string;
      folderUrl: string;
      name?: string;
      driveId: string;
      missingSubfolders: string[];
    };

/**
 * Inspect a Drive folder URL and classify its routing health for repair
 * decisions. Read-only — never mutates Drive.
 */
export async function classifyWOFolder(
  drive: DriveClient,
  folderUrl: string | null | undefined,
): Promise<WOFolderClassification> {
  const trimmed = String(folderUrl || '').trim();
  if (!trimmed) {
    return { kind: 'empty', reason: 'folder_url is empty on Service_Work_Orders' };
  }
  const folderId = extractFolderIdFromUrl(trimmed);
  if (!folderId) {
    return { kind: 'unparseable', folderUrl: trimmed, reason: 'Could not parse a Drive folder ID from folder_url' };
  }
  let meta;
  try {
    meta = await drive.files.get({
      fileId: folderId,
      supportsAllDrives: true,
      fields: 'id,name,driveId,parents,owners(emailAddress),trashed,webViewLink,mimeType',
    });
  } catch (err) {
    return {
      kind: 'inaccessible',
      folderId,
      folderUrl: trimmed,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  const data = meta.data;
  const resolvedUrl = data.webViewLink || trimmed;
  if (data.trashed) {
    return {
      kind: 'trashed',
      folderId,
      folderUrl: resolvedUrl,
      name: data.name || undefined,
    };
  }
  const driveId = data.driveId || null;
  if (driveId !== BANYAN_DRIVE_ID) {
    return {
      kind: 'my_drive',
      folderId,
      folderUrl: resolvedUrl,
      name: data.name || undefined,
      parents: data.parents || undefined,
      owners: data.owners || undefined,
      driveId,
    };
  }
  const present = await listChildFolders(drive, folderId);
  const missing = STANDARD_SUBFOLDERS.filter(n => !present.has(n));
  if (missing.length === 0) {
    return {
      kind: 'shared_drive_canonical',
      folderId,
      folderUrl: resolvedUrl,
      name: data.name || undefined,
      driveId,
    };
  }
  return {
    kind: 'shared_drive_missing_subfolders',
    folderId,
    folderUrl: resolvedUrl,
    name: data.name || undefined,
    driveId,
    missingSubfolders: missing,
  };
}
