/**
 * AIA Submission Packet Export v1 — GET route tests.
 *
 * The route is a thin wrapper around assembleSubmissionBundle; tests focus
 * on the contract surface: permission gating, format param validation,
 * 404/409/413 mapping, and the response header contract.  The assembler
 * itself is mocked here (covered by aiaSubmissionBundleAssembler.test.ts).
 */

jest.mock('@react-pdf/renderer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLocal = require('react');
  const component = (name: string) => ({ children, ...props }: { children?: unknown }) =>
    ReactLocal.createElement(name, props, children);
  return {
    Document: component('Document'),
    Page: component('Page'),
    Text: component('Text'),
    View: component('View'),
    Image: component('Image'),
    StyleSheet: { create: (styles: unknown) => styles },
    pdf: () => ({ toBlob: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) }),
  };
});

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const PAY_APP_ID = '00000000-0000-4000-8000-000000000111';

const assembleMock = jest.fn();

jest.mock('@/lib/aia/submission-bundle-assembler', () => {
  const actual = jest.requireActual('@/lib/aia/submission-bundle-assembler');
  return {
    ...actual,
    assembleSubmissionBundle: (...args: unknown[]) => assembleMock(...args),
  };
});

const passAiaReadGateMock = jest.fn();
jest.mock('@/lib/aia/read-gate', () => ({
  passAiaReadGate: (...args: unknown[]) => passAiaReadGateMock(...args),
  parsePagination: jest.fn(),
}));

import { GET } from '@/app/api/pay-apps/[id]/submission-bundle/route';
import {
  InvalidPayAppStateError,
  PayAppNotFoundError,
  BundleSizeLimitError,
  PAY_APP_STATES_ALLOWED_FOR_BUNDLE,
} from '@/lib/aia/submission-bundle-assembler';

beforeEach(() => {
  assembleMock.mockReset();
  passAiaReadGateMock.mockReset();
});

function ctx() {
  return { params: Promise.resolve({ id: PAY_APP_ID }) };
}

describe('AIA submission bundle — GET /api/pay-apps/[id]/submission-bundle', () => {
  it('returns the 403 from passAiaReadGate when the gate fails', async () => {
    const denied = { json: async () => ({ error: 'Forbidden' }), status: 403 };
    passAiaReadGateMock.mockResolvedValue({ ok: false, response: denied });
    const res = await GET(new Request('http://localhost/api/pay-apps/x/submission-bundle'), ctx());
    expect(res).toBe(denied);
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('400s when format query param is unrecognised', async () => {
    passAiaReadGateMock.mockResolvedValue({ ok: true, actorEmail: 'a@b', tenantId: TENANT_ID });
    const res = await GET(
      new Request('http://localhost/api/pay-apps/x/submission-bundle?format=docx'),
      ctx(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unknown format/);
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('returns the merged PDF with attachment Content-Disposition by default', async () => {
    passAiaReadGateMock.mockResolvedValue({ ok: true, actorEmail: 'a@b', tenantId: TENANT_ID });
    const buffer = Buffer.from('%PDF-bundle');
    assembleMock.mockResolvedValue({
      buffer,
      content_type: 'application/pdf',
      filename: 'PayApp-007-K-2026-HOKHTL-submission.pdf',
      sections: [{ title: 'Cover Letter', source: 'rendered', page_count: 1, signed_status: 'NOT_APPLICABLE' }],
    });
    const res = await GET(
      new Request('http://localhost/api/pay-apps/x/submission-bundle'),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain('PayApp-007-K-2026-HOKHTL-submission.pdf');
    expect(res.headers.get('x-pay-app-id')).toBe(PAY_APP_ID);
    expect(res.headers.get('x-bundle-format')).toBe('pdf');
    expect(res.headers.get('x-bundle-sections')).toBe('1');
    expect(assembleMock).toHaveBeenCalledWith(expect.objectContaining({
      payAppId: PAY_APP_ID,
      format: 'pdf',
      ctx: { tenantId: TENANT_ID, actorEmail: 'a@b' },
    }));
  });

  it('returns the ZIP with application/zip content-type when format=zip', async () => {
    passAiaReadGateMock.mockResolvedValue({ ok: true, actorEmail: 'a@b', tenantId: TENANT_ID });
    const buffer = Buffer.from('PK\x03\x04zipbundle');
    assembleMock.mockResolvedValue({
      buffer,
      content_type: 'application/zip',
      filename: 'PayApp-007-K-submission.zip',
      sections: [],
    });
    const res = await GET(
      new Request('http://localhost/api/pay-apps/x/submission-bundle?format=zip'),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toContain('.zip');
    expect(res.headers.get('x-bundle-format')).toBe('zip');
  });

  it('maps PayAppNotFoundError to 404', async () => {
    passAiaReadGateMock.mockResolvedValue({ ok: true, actorEmail: 'a@b', tenantId: TENANT_ID });
    assembleMock.mockRejectedValue(new PayAppNotFoundError('pay app not found in tenant'));
    const res = await GET(new Request('http://localhost/api/pay-apps/x/submission-bundle'), ctx());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('PAY_APP_NOT_FOUND');
  });

  it('maps InvalidPayAppStateError to 409 with allowed_states', async () => {
    passAiaReadGateMock.mockResolvedValue({ ok: true, actorEmail: 'a@b', tenantId: TENANT_ID });
    assembleMock.mockRejectedValue(new InvalidPayAppStateError('PENDING_DRAFT'));
    const res = await GET(new Request('http://localhost/api/pay-apps/x/submission-bundle'), ctx());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('INVALID_PAY_APP_STATE_FOR_BUNDLE');
    expect(body.state).toBe('PENDING_DRAFT');
    expect(body.allowed_states).toEqual(PAY_APP_STATES_ALLOWED_FOR_BUNDLE);
  });

  it('maps BundleSizeLimitError to 413 with the offending section', async () => {
    passAiaReadGateMock.mockResolvedValue({ ok: true, actorEmail: 'a@b', tenantId: TENANT_ID });
    assembleMock.mockRejectedValue(new BundleSizeLimitError('lien_waiver_CONDITIONAL_PROGRESS', 30_000_000, 25_000_000));
    const res = await GET(new Request('http://localhost/api/pay-apps/x/submission-bundle'), ctx());
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe('BUNDLE_SIZE_LIMIT_EXCEEDED');
    expect(body.section).toBe('lien_waiver_CONDITIONAL_PROGRESS');
    expect(body.bytes).toBe(30_000_000);
    expect(body.limit).toBe(25_000_000);
  });

  it('maps unknown errors to 500', async () => {
    passAiaReadGateMock.mockResolvedValue({ ok: true, actorEmail: 'a@b', tenantId: TENANT_ID });
    assembleMock.mockRejectedValue(new Error('something exploded'));
    const res = await GET(new Request('http://localhost/api/pay-apps/x/submission-bundle'), ctx());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/something exploded/);
  });
});
