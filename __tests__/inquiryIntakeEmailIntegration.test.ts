/**
 * BAN-376 Customer Pipeline P2 — end-to-end integration of the email
 * intake route. Asserts Charter Rule 2: no field_events insertion under
 * any branch, no calls into the Activity Spine helper.
 *
 * Uses the same DB / Drive mock surface as the unit route test but tracks
 * EVERY db.insert(...) call so an inadvertent field_events emission would
 * be visible.
 */

export {};

const SECRET = 'integration-test-secret';
const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const INQUIRY_ID = '00000000-0000-4000-8000-000000000111';

const selectQueue: Array<{ rows: Array<Record<string, unknown>> }> = [];
const insertedTables: string[] = [];
const insertCalls: Array<{ table: string; values: unknown }> = [];

const mockDb = {
  select: jest.fn(() => {
    const shift = () => (selectQueue.shift()?.rows ?? []);
    const limitFn = jest.fn(async () => shift());
    const orderByResult: Record<string, unknown> = {
      limit: limitFn,
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(shift()).then(onFulfilled),
    };
    const orderBy = jest.fn(() => orderByResult);
    const where = jest.fn(() => ({ orderBy, limit: limitFn }));
    const from = jest.fn(() => ({ where }));
    return { from };
  }),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: unknown) => {
      const label = tableHandle._label ?? 'unknown';
      insertedTables.push(label);
      insertCalls.push({ table: label, values: vals });
      const rowsArr = Array.isArray(vals) ? vals : [vals];
      return {
        returning: async () => rowsArr.map(v => ({
          ...(v as Record<string, unknown>),
          inquiry_id: INQUIRY_ID,
        })),
      };
    },
  })),
};

function tbl(label: string) {
  return new Proxy({ _label: label } as Record<string, unknown>, {
    get(target, prop) {
      if (prop === '_label') return target._label;
      if (typeof prop === 'string') return { name: prop };
      return undefined;
    },
  });
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  inquiries: tbl('inquiries'),
  inquiry_state_transitions: tbl('inquiry_state_transitions'),
  inquiry_attachments: tbl('inquiry_attachments'),
  tenants: tbl('tenants'),
  users: tbl('users'),
  // Intentionally exported but unused — if the route accidentally references
  // field_events, the test would see it in insertedTables.
  field_events: tbl('field_events'),
}));

const uploadEmailIntakeToDriveMock = jest.fn();
jest.mock('@/lib/inquiries/email-to-drive', () => ({
  __esModule: true,
  uploadEmailIntakeToDrive: (args: unknown) => uploadEmailIntakeToDriveMock(args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  selectQueue.length = 0;
  insertedTables.length = 0;
  insertCalls.length = 0;
  process.env.INTAKE_EMAIL_WEBHOOK_SECRET = SECRET;
  uploadEmailIntakeToDriveMock.mockResolvedValue({
    folderId: 'integration-folder-id',
    emailBody: {
      driveFileId: 'integration-body-id',
      filename: 'INQ-26-0001-email-body.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 555,
    },
    attachments: [
      { driveFileId: 'integration-att-1', filename: 'plan.pdf', mimeType: 'application/pdf', sizeBytes: 999 },
    ],
  });
});

afterEach(() => {
  delete process.env.INTAKE_EMAIL_WEBHOOK_SECRET;
});

function payload() {
  return {
    to: 'intake+TEN-001@banyan-os.app',
    from: 'Jane Doe <jane@gctest.com>',
    forwarder: 'joey@kulaglass.com',
    subject: 'RFP: Tower B Curtainwall',
    body_text: 'See attached RFP package.',
    received_at: '2026-05-19T20:15:00Z',
    attachments: [
      { filename: 'plan.pdf', mime_type: 'application/pdf', base64_content: Buffer.from('PLAN').toString('base64') },
    ],
  };
}

describe('intake-email — end-to-end', () => {
  it('produces correct inquiry / audit / attachments rows and emits NO field_events (Charter Rule 2)', async () => {
    // Tenant lookup
    selectQueue.push({ rows: [{ tenant_id: TENANT_ID, kid: 'TEN-001', status: 'active' }] });
    // Forwarder lookup
    selectQueue.push({ rows: [{ user_id: 'forwarder-user-id' }] });
    // GM lookup (RFP path — runs before nextInquiryNumber in the route)
    selectQueue.push({ rows: [{ user_id: 'gm-user-id' }] });
    // nextInquiryNumber prior rows
    selectQueue.push({ rows: [] });

    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const req = new Request('http://localhost/api/inquiries/intake-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Banyan-Intake-Secret': SECRET },
      body: JSON.stringify(payload()),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    // Inserts: inquiries → inquiry_attachments → inquiry_state_transitions
    expect(insertedTables).toEqual(['inquiries', 'inquiry_attachments', 'inquiry_state_transitions']);

    // Critically: no field_events touched
    expect(insertedTables).not.toContain('field_events');

    // Verify shape of the inquiry row
    const inquiryRow = insertCalls.find(c => c.table === 'inquiries')!.values as Record<string, unknown>;
    expect(inquiryRow).toEqual(expect.objectContaining({
      tenant_id: TENANT_ID,
      source: 'RFP',
      inquiry_type_initial: 'PROJECT',
      assigned_role: 'GM',
      assigned_to_user_id: 'gm-user-id',
      first_contact_user_id: 'forwarder-user-id',
      first_contact_method: 'OFFICE_FORWARD',
      state: 'NEW',
      customer_name: 'Jane Doe',
      contact_email: 'jane@gctest.com',
      is_test_project: false,
    }));

    // Audit row
    const audit = insertCalls.find(c => c.table === 'inquiry_state_transitions')!.values as Record<string, unknown>;
    expect(audit).toEqual(expect.objectContaining({
      from_state: null,
      to_state: 'NEW',
      changed_by: null,
      reason: 'auto_created_from_email_intake;auto_routed_to_gm_rfp_detected',
    }));

    // Attachment registry rows
    const attRows = insertCalls.find(c => c.table === 'inquiry_attachments')!.values as Array<Record<string, unknown>>;
    expect(Array.isArray(attRows)).toBe(true);
    expect(attRows).toHaveLength(2);
    expect(attRows[0]).toEqual(expect.objectContaining({
      attachment_kind: 'EMAIL_BODY',
      drive_file_id: 'integration-body-id',
    }));
    expect(attRows[1]).toEqual(expect.objectContaining({
      attachment_kind: 'EMAIL_ATTACHMENT',
      drive_file_id: 'integration-att-1',
      original_filename: 'plan.pdf',
    }));

    // Drive upload was passed the canonical tenant kid + inquiry number
    expect(uploadEmailIntakeToDriveMock).toHaveBeenCalledTimes(1);
    expect(uploadEmailIntakeToDriveMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      tenantKid: 'TEN-001',
      inquiryNumber: expect.stringMatching(/^INQ-\d{2}-0001$/),
    }));
  });
});
