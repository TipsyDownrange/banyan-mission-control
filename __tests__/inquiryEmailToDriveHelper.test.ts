/**
 * BAN-376 Customer Pipeline P2 — Drive upload helper.
 *
 * Verifies folder creation order, body PDF + attachment round-trip, and
 * staging routing. All Drive operations are mocked; @react-pdf/renderer is
 * stubbed so jest does not need to spawn a real PDF render.
 */

const findOrCreateFolderMock = jest.fn(async (_drive: unknown, name: string, parent: string) => {
  return `folder:${parent}/${name}`;
});

const getWODriveClientMock = jest.fn(() => ({
  files: {
    create: jest.fn(),
  },
}));

const resolveStagingDriveParentIdMock = jest.fn(() => 'STAGING_ROOT_ID');

const renderEmailBodyPDFMock = jest.fn(async (_data?: unknown) => Buffer.from('PDFBYTES'));

jest.mock('@/lib/drive-wo-folder', () => ({
  BANYAN_DRIVE_ID: 'BANYAN_DRIVE_ID',
  findOrCreateFolder: (...args: [unknown, string, string]) => findOrCreateFolderMock(...args),
  getWODriveClient: () => getWODriveClientMock(),
  resolveStagingDriveParentId: () => resolveStagingDriveParentIdMock(),
}));

const isStagingMock = jest.fn(() => false);
jest.mock('@/lib/env', () => ({
  isStaging: () => isStagingMock(),
}));

jest.mock('@/lib/pdf-email-body', () => ({
  __esModule: true,
  renderEmailBodyPDF: (data: unknown) => renderEmailBodyPDFMock(data),
}));

import {
  ensureInquiryFolder,
  uploadEmailIntakeToDrive,
  BANYAN_ROOT_FOLDER_NAME,
  INQUIRIES_ROOT_FOLDER_NAME,
} from '@/lib/inquiries/email-to-drive';

interface MockFilesCreateArgs {
  requestBody: { name: string; mimeType?: string; parents?: string[] };
  media?: { mimeType?: string; body?: unknown };
  supportsAllDrives?: boolean;
  fields?: string;
}

function buildMockDrive() {
  const filesCreate = jest.fn(async (args: MockFilesCreateArgs) => ({
    data: {
      id: `file:${args.requestBody.name}`,
      name: args.requestBody.name,
      mimeType: args.requestBody.mimeType || 'application/pdf',
      size: '1234',
    },
  }));
  return {
    drive: { files: { create: filesCreate } } as unknown,
    filesCreate,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  isStagingMock.mockReturnValue(false);
});

describe('ensureInquiryFolder', () => {
  it('walks BanyanOS → Inquiries → {kid} → {inquiry_number} under the shared drive root', async () => {
    const { drive } = buildMockDrive();
    const id = await ensureInquiryFolder(drive as never, 'TEN-001', 'INQ-26-0001');
    expect(findOrCreateFolderMock).toHaveBeenNthCalledWith(1, drive, BANYAN_ROOT_FOLDER_NAME, 'BANYAN_DRIVE_ID');
    expect(findOrCreateFolderMock).toHaveBeenNthCalledWith(2, drive, INQUIRIES_ROOT_FOLDER_NAME, 'folder:BANYAN_DRIVE_ID/BanyanOS');
    expect(findOrCreateFolderMock).toHaveBeenNthCalledWith(3, drive, 'TEN-001', 'folder:folder:BANYAN_DRIVE_ID/BanyanOS/Inquiries');
    expect(findOrCreateFolderMock).toHaveBeenNthCalledWith(4, drive, 'INQ-26-0001', 'folder:folder:folder:BANYAN_DRIVE_ID/BanyanOS/Inquiries/TEN-001');
    expect(id).toBe('folder:folder:folder:folder:BANYAN_DRIVE_ID/BanyanOS/Inquiries/TEN-001/INQ-26-0001');
  });

  it('uses STAGING_DRIVE_FOLDER_ID as root when isStaging() is true', async () => {
    isStagingMock.mockReturnValue(true);
    const { drive } = buildMockDrive();
    await ensureInquiryFolder(drive as never, 'TEN-001', 'INQ-26-0001');
    expect(resolveStagingDriveParentIdMock).toHaveBeenCalled();
    expect(findOrCreateFolderMock).toHaveBeenNthCalledWith(1, drive, BANYAN_ROOT_FOLDER_NAME, 'STAGING_ROOT_ID');
  });
});

describe('uploadEmailIntakeToDrive', () => {
  it('renders the body PDF and uploads it + each attachment', async () => {
    const { drive, filesCreate } = buildMockDrive();
    const result = await uploadEmailIntakeToDrive({
      tenantKid: 'TEN-001',
      inquiryNumber: 'INQ-26-0001',
      pdfData: {
        inquiry_number: 'INQ-26-0001',
        to: 'intake+TEN-001@banyan-os.app',
        from: 'jane@co.com',
        forwarder: 'joey@kulaglass.com',
        subject: 'RFP: Tower B',
        received_at: '2026-05-19T20:15:00Z',
        body_text: 'hello',
      },
      attachments: [
        {
          filename: 'spec.pdf',
          mime_type: 'application/pdf',
          base64_content: Buffer.from('SPEC').toString('base64'),
        },
        {
          filename: 'photo.jpg',
          mime_type: 'image/jpeg',
          base64_content: Buffer.from('JPG').toString('base64'),
        },
      ],
      driveOverride: drive as never,
    });

    expect(renderEmailBodyPDFMock).toHaveBeenCalledTimes(1);
    expect(filesCreate).toHaveBeenCalledTimes(3);

    const bodyCall = filesCreate.mock.calls[0][0];
    expect(bodyCall.requestBody.name).toBe('INQ-26-0001-email-body.pdf');
    expect(bodyCall.requestBody.mimeType).toBe('application/pdf');

    expect(result.emailBody.filename).toBe('INQ-26-0001-email-body.pdf');
    expect(result.emailBody.driveFileId).toBe('file:INQ-26-0001-email-body.pdf');
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0].filename).toBe('spec.pdf');
    expect(result.attachments[1].filename).toBe('photo.jpg');
    expect(result.folderId).toMatch(/INQ-26-0001/);
  });

  it('does not call Drive when no attachments are supplied (body PDF still uploaded)', async () => {
    const { drive, filesCreate } = buildMockDrive();
    const result = await uploadEmailIntakeToDrive({
      tenantKid: 'TEN-001',
      inquiryNumber: 'INQ-26-0002',
      pdfData: {
        inquiry_number: 'INQ-26-0002',
        to: 'intake+TEN-001@banyan-os.app',
        from: 'jane@co.com',
        forwarder: null,
        subject: 'hello',
        received_at: '2026-05-19T20:15:00Z',
        body_text: 'just a body',
      },
      attachments: [],
      driveOverride: drive as never,
    });
    expect(filesCreate).toHaveBeenCalledTimes(1);
    expect(result.attachments).toHaveLength(0);
  });

  it('throws when Drive returns no file id', async () => {
    const filesCreate = jest.fn(async () => ({ data: { id: null, name: 'x' } }));
    const drive = { files: { create: filesCreate } };
    await expect(uploadEmailIntakeToDrive({
      tenantKid: 'TEN-001',
      inquiryNumber: 'INQ-26-0003',
      pdfData: {
        inquiry_number: 'INQ-26-0003',
        to: 'intake+TEN-001@banyan-os.app',
        from: 'jane@co.com',
        forwarder: null,
        subject: '',
        received_at: '2026-05-19T20:15:00Z',
        body_text: '',
      },
      attachments: [],
      driveOverride: drive as never,
    })).rejects.toThrow(/did not return a file id/);
  });
});
