import { BANYAN_DRIVE_ID, findOrCreateFolder, getWODriveClient, resolveStagingDriveParentId, type DriveClient } from '@/lib/drive-wo-folder';
import { isStaging } from '@/lib/env';
import type { DriveFolderTemplate } from '@/lib/work-records/engagement-mapping';

export const DRIVE_FOLDER_TEMPLATES: Record<DriveFolderTemplate, string[]> = {
  project_full: ['00. Site Info', '01. Submittals', '02. Shop Drawings', '03. Field', '04. Closeout'],
  wo_small: ['00. Site Info', '03. Field', '04. Closeout'],
  wo_large: ['00. Site Info', '01. Submittals', '03. Field', '04. Closeout'],
};

function engagementParentFolderId(): string {
  if (isStaging()) return resolveStagingDriveParentId();
  return process.env.BG1_ENGAGEMENT_PARENT_FOLDER_ID?.trim() || BANYAN_DRIVE_ID;
}

export async function createEngagementDriveFolder(input: {
  kid: string;
  name: string;
  template: DriveFolderTemplate;
  drive?: DriveClient;
}): Promise<{ folderId: string; folderUrl: string; subfolders: string[] }> {
  const drive = input.drive || getWODriveClient();
  const parentId = engagementParentFolderId();
  const folderName = `${input.kid} — ${input.name}`;
  const folderId = await findOrCreateFolder(drive, folderName, parentId);
  const subfolders: string[] = [];
  for (const subfolder of DRIVE_FOLDER_TEMPLATES[input.template]) {
    subfolders.push(await findOrCreateFolder(drive, subfolder, folderId));
  }
  return { folderId, folderUrl: `https://drive.google.com/drive/folders/${folderId}`, subfolders };
}
