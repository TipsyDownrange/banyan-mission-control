/**
 * BAN-376 Customer Pipeline P2 — POST /api/inquiries/intake-email
 *
 * Mocks @/db, @/lib/inquiries/email-to-drive, and the INTAKE_EMAIL_WEBHOOK_SECRET
 * env var. Exercises auth, payload validation, tenant resolution,
 * classification, and the Drive-failure 502 branch.
 */

export {};

const SECRET = 'super-secret-test-value';
const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const INQUIRY_ID = '00000000-0000-4000-8000-000000000111';
const GM_USER_ID = '00000000-0000-4000-8000-000000000222';
const FORWARDER_USER_ID = '00000000-0000-4000-8000-000000000333';

interface SelectStep {
  rows: Array<Record<string, unknown>>;
}
const selectQueue: SelectStep[] = [];
const insertSpy = jest.fn();

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
      insertSpy(tableHandle._label ?? 'unknown', vals);
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
}));

const uploadEmailIntakeToDriveMock = jest.fn();
jest.mock('@/lib/inquiries/email-to-drive', () => ({
  __esModule: true,
  uploadEmailIntakeToDrive: (args: unknown) => uploadEmailIntakeToDriveMock(args),
}));

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/inquiries/intake-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    to: 'intake+TEN-001@banyan-os.app',
    from: 'Jane Doe <jane@gctest.com>',
    forwarder: 'joey@kulaglass.com',
    subject: 'Looking for a quote on a small project',
    body_text: 'Hi Banyan, please send a quote.',
    received_at: '2026-05-19T20:15:00Z',
    attachments: [],
    ...overrides,
  };
}

function queueTenantHit() {
  selectQueue.push({ rows: [{ tenant_id: TENANT_ID, kid: 'TEN-001', status: 'active' }] });
}
function queueTenantMiss() {
  selectQueue.push({ rows: [] });
}
function queueForwarderUser(userId: string | null) {
  selectQueue.push({ rows: userId ? [{ user_id: userId }] : [] });
}
function queueNextInquiryNumberPriors(prior: Array<{ inquiry_number: string }> = []) {
  selectQueue.push({ rows: prior });
}
function queueGmLookup(userId: string | null) {
  selectQueue.push({ rows: userId ? [{ user_id: userId }] : [] });
}

beforeEach(() => {
  jest.clearAllMocks();
  selectQueue.length = 0;
  process.env.INTAKE_EMAIL_WEBHOOK_SECRET = SECRET;
  uploadEmailIntakeToDriveMock.mockResolvedValue({
    folderId: 'folder-id',
    emailBody: {
      driveFileId: 'body-id',
      filename: 'INQ-26-0001-email-body.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4321,
    },
    attachments: [],
  });
});

afterEach(() => {
  delete process.env.INTAKE_EMAIL_WEBHOOK_SECRET;
});

describe('POST /api/inquiries/intake-email — auth', () => {
  it('503 when secret env is unset', async () => {
    delete process.env.INTAKE_EMAIL_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody(), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(503);
    const j = await res.json();
    expect(j.code).toBe('INTAKE_SECRET_UNSET');
  });

  it('401 when header missing', async () => {
    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it('401 when secret mismatch', async () => {
    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody(), { 'X-Banyan-Intake-Secret': 'wrong' }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/inquiries/intake-email — payload validation', () => {
  it('400 when body is not valid JSON', async () => {
    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest('not-json', { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(400);
  });

  it('400 when `to` does not match intake pattern', async () => {
    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody({ to: 'hello@banyan-os.app' }), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(400);
  });

  it('400 when `from` is malformed', async () => {
    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody({ from: 'not an email' }), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(400);
  });

  it('400 when `received_at` is invalid', async () => {
    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody({ received_at: 'not-a-date' }), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(400);
  });

  it('413 when attachment count exceeds the cap', async () => {
    const tooMany = Array.from({ length: 30 }, (_, i) => ({
      filename: `f${i}.pdf`,
      mime_type: 'application/pdf',
      base64_content: 'YWJj',
    }));
    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody({ attachments: tooMany }), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(413);
    const j = await res.json();
    expect(j.code).toBe('ATTACHMENT_COUNT_EXCEEDED');
  });

  it('413 when total attachment bytes exceeds the cap', async () => {
    const bigBuf = Buffer.alloc(13 * 1024 * 1024).toString('base64'); // 13 MB each → 2 × 13 = 26 > 25
    const big = [
      { filename: 'a.bin', mime_type: 'application/octet-stream', base64_content: bigBuf },
      { filename: 'b.bin', mime_type: 'application/octet-stream', base64_content: bigBuf },
    ];
    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody({ attachments: big }), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(413);
  });
});

describe('POST /api/inquiries/intake-email — tenant resolution', () => {
  it('404 when tenant kid does not resolve', async () => {
    queueTenantMiss();
    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody(), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(404);
    const j = await res.json();
    expect(j.code).toBe('TENANT_NOT_FOUND');
  });
});

describe('POST /api/inquiries/intake-email — happy path', () => {
  it('201 creates inquiry + audit row + attachment rows; rfp_detected=false', async () => {
    queueTenantHit();
    queueForwarderUser(FORWARDER_USER_ID);
    queueNextInquiryNumberPriors([]);
    uploadEmailIntakeToDriveMock.mockResolvedValueOnce({
      folderId: 'folder-id',
      emailBody: {
        driveFileId: 'body-id',
        filename: 'INQ-26-0001-email-body.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4321,
      },
      attachments: [],
    });

    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody(), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.inquiry_id).toBe(INQUIRY_ID);
    expect(j.inquiry_number).toMatch(/^INQ-\d{2}-0001$/);
    expect(j.rfp_detected).toBe(false);
    expect(j.orphan_forward).toBe(false);

    const inq = insertSpy.mock.calls.find(([t]) => t === 'inquiries');
    expect(inq).toBeDefined();
    expect(inq![1]).toEqual(expect.objectContaining({
      source: 'EMAIL',
      inquiry_type_initial: 'UNCLEAR',
      customer_name: 'Jane Doe',
      contact_email: 'jane@gctest.com',
      first_contact_user_id: FORWARDER_USER_ID,
      first_contact_method: 'OFFICE_FORWARD',
      assigned_role: null,
      assigned_to_user_id: null,
      state: 'NEW',
    }));

    const audit = insertSpy.mock.calls.find(([t]) => t === 'inquiry_state_transitions');
    expect(audit).toBeDefined();
    expect(audit![1]).toEqual(expect.objectContaining({
      from_state: null,
      to_state: 'NEW',
      changed_by: null,
      reason: 'auto_created_from_email_intake',
    }));

    const att = insertSpy.mock.calls.find(([t]) => t === 'inquiry_attachments');
    expect(att).toBeDefined();
    expect(att![1]).toEqual(expect.arrayContaining([
      expect.objectContaining({ attachment_kind: 'EMAIL_BODY', drive_file_id: 'body-id' }),
    ]));
  });

  it('rfp_detected=true → assigns GM, source=RFP, audit reason includes auto_routed_to_gm_rfp_detected', async () => {
    queueTenantHit();
    queueForwarderUser(FORWARDER_USER_ID);
    queueGmLookup(GM_USER_ID);
    queueNextInquiryNumberPriors([]);

    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody({
      subject: 'RFP: Hokuala Phase 2 Tower B Curtainwall',
    }), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.rfp_detected).toBe(true);

    const inq = insertSpy.mock.calls.find(([t]) => t === 'inquiries');
    expect(inq![1]).toEqual(expect.objectContaining({
      source: 'RFP',
      inquiry_type_initial: 'PROJECT',
      assigned_role: 'GM',
      assigned_to_user_id: GM_USER_ID,
    }));

    const audit = insertSpy.mock.calls.find(([t]) => t === 'inquiry_state_transitions');
    expect(audit![1].reason).toBe('auto_created_from_email_intake;auto_routed_to_gm_rfp_detected');
  });

  it('orphan forwarder (not in users) → orphan_forward=true and note appended', async () => {
    queueTenantHit();
    queueForwarderUser(null);
    queueNextInquiryNumberPriors([]);

    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody(), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.orphan_forward).toBe(true);

    const inq = insertSpy.mock.calls.find(([t]) => t === 'inquiries');
    expect(inq![1].first_contact_user_id).toBeNull();
    expect(inq![1].inquiry_description).toMatch(/orphan forward/);
  });

  it('derives customer_name from local-part when display name missing', async () => {
    queueTenantHit();
    queueForwarderUser(FORWARDER_USER_ID);
    queueNextInquiryNumberPriors([]);

    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody({ from: 'jane.doe@gctest.com' }), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(201);
    const inq = insertSpy.mock.calls.find(([t]) => t === 'inquiries');
    expect(inq![1].customer_name).toBe('Jane Doe');
  });

  it('inserts one inquiry_attachments row per uploaded file (body + each attachment)', async () => {
    queueTenantHit();
    queueForwarderUser(FORWARDER_USER_ID);
    queueNextInquiryNumberPriors([]);
    uploadEmailIntakeToDriveMock.mockResolvedValueOnce({
      folderId: 'folder-id',
      emailBody: { driveFileId: 'body-id', filename: 'body.pdf', mimeType: 'application/pdf', sizeBytes: 100 },
      attachments: [
        { driveFileId: 'a1', filename: 'spec.pdf', mimeType: 'application/pdf', sizeBytes: 200 },
        { driveFileId: 'a2', filename: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 300 },
      ],
    });

    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody({
      attachments: [
        { filename: 'spec.pdf', mime_type: 'application/pdf', base64_content: 'YWJj' },
        { filename: 'photo.jpg', mime_type: 'image/jpeg', base64_content: 'YWJj' },
      ],
    }), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.attachment_count).toBe(3);

    const att = insertSpy.mock.calls.find(([t]) => t === 'inquiry_attachments');
    expect(att![1]).toHaveLength(3);
    expect(att![1][0].attachment_kind).toBe('EMAIL_BODY');
    expect(att![1][1].attachment_kind).toBe('EMAIL_ATTACHMENT');
    expect(att![1][2].attachment_kind).toBe('EMAIL_ATTACHMENT');
  });
});

describe('POST /api/inquiries/intake-email — Drive failure', () => {
  it('502 when Drive upload throws; inquiry row stays in DB', async () => {
    queueTenantHit();
    queueForwarderUser(FORWARDER_USER_ID);
    queueNextInquiryNumberPriors([]);
    uploadEmailIntakeToDriveMock.mockRejectedValueOnce(new Error('drive boom'));
    // Silence the console.error from the route's catch.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/inquiries/intake-email/route');
    const res = await POST(postRequest(validBody(), { 'X-Banyan-Intake-Secret': SECRET }));
    expect(res.status).toBe(502);
    const j = await res.json();
    expect(j.code).toBe('DRIVE_UPLOAD_FAILED');
    expect(j.inquiry_id).toBe(INQUIRY_ID);

    const att = insertSpy.mock.calls.find(([t]) => t === 'inquiry_attachments');
    expect(att).toBeUndefined();
    errSpy.mockRestore();
  });
});
