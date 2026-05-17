/**
 * BAN-309 Pass 3a.2 PR 3 — integration tests for AIA CRUD routes covering
 * 6 child/config tables across 13 route files. No Activity Spine emission
 * is expected from any of these routes (D3 classification: CRUD-only).
 *
 * DB layer is mocked: db.select returns staged rows; db.insert/update/delete
 * return fakes that record values. There is no transaction wrapper since
 * CRUD writes are single-statement.
 */

const lookupRowsByLabel: Record<string, Array<Record<string, unknown>>> = {};
let lookupKeyForNextSelect: string | null = null;

const insertValuesSpy = jest.fn<unknown, [string, Record<string, unknown>]>();
const insertReturningByLabel: Record<string, Array<Record<string, unknown>>> = {};
const updateSetSpy = jest.fn<unknown, [string, Record<string, unknown>]>();
const deleteSpy = jest.fn<unknown, [string]>();

function tbl(label: string) {
  const columnNames = [
    'pay_app_line_id', 'pay_app_id', 'engagement_id', 'tenant_id',
    'sov_line_id', 'tm_authorization_id', 'line_number', 'line_type',
    'description', 'scheduled_value', 'state',
    'billing_config_id', 'billing_format', 'gc_billing_intake_platform',
    'deposit_terms_id', 'deposit_pattern', 'deposit_received_date', 'draw_down_logic',
    'session_id', 'target_kind', 'provider', 'notary_name',
    'receipt_id', 'reconciliation_status', 'amount', 'receipt_date', 'source',
    'submission_id', 'submission_status', 'textura_submission_id',
  ];
  const cols: Record<string, { name: string }> = {};
  for (const c of columnNames) cols[c] = { name: c };
  return { _label: label, ...cols };
}

jest.mock('@/db', () => {
  const select = jest.fn(() => {
    const limit = jest.fn(async () => {
      const key = lookupKeyForNextSelect ?? 'default';
      lookupKeyForNextSelect = null;
      return lookupRowsByLabel[key] ?? [];
    });
    const offset = jest.fn(async () => {
      const key = lookupKeyForNextSelect ?? 'default';
      lookupKeyForNextSelect = null;
      return lookupRowsByLabel[key] ?? [];
    });
    const limitChain = jest.fn(() => ({ then: undefined, offset }));
    const where = jest.fn(() => ({
      limit: (n: number) => {
        if (n === 1) return limit();
        return limitChain();
      },
    }));
    const from = jest.fn(() => ({ where }));
    return { from };
  });

  const insert = jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      const label = tableHandle._label ?? 'unknown';
      insertValuesSpy(label, vals);
      return {
        returning: () => Promise.resolve(insertReturningByLabel[label] ?? [{ id: 'unknown' }]),
      };
    },
  }));

  const update = jest.fn((tableHandle: { _label?: string }) => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(tableHandle._label ?? 'unknown', vals);
      return { where: () => Promise.resolve() };
    },
  }));

  const del = jest.fn((tableHandle: { _label?: string }) => ({
    where: () => {
      deleteSpy(tableHandle._label ?? 'unknown');
      return Promise.resolve();
    },
  }));

  return {
    __esModule: true,
    db: { select, insert, update, delete: del },
    pay_applications: tbl('pay_applications'),
    pay_app_line_items: tbl('pay_app_line_items'),
    billing_format_config: tbl('billing_format_config'),
    deposit_terms: tbl('deposit_terms'),
    notarization_sessions: tbl('notarization_sessions'),
    cash_receipts: tbl('cash_receipts'),
    textura_submissions: tbl('textura_submissions'),
    engagements: tbl('engagements'),
  };
});

const mockCheckPermission: jest.Mock<Promise<{ allowed: boolean; role: string; email: string | null }>, unknown[]> = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

const mockBlockStagingMutation: jest.Mock<Response | null, unknown[]> = jest.fn(() => null);
jest.mock('@/lib/service-work-orders/postgres-read-guard', () => ({
  blockWOStagingPostgresReadOnlyMutation: (...args: unknown[]) =>
    mockBlockStagingMutation(...args),
}));

const mockIsPostgresWriteEnabled = jest.fn(() => true);
jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => TENANT_ID,
  isPostgresWriteEnabled: () => mockIsPostgresWriteEnabled(),
}));

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-0000000000aa';
const PAY_APP_ID = '00000000-0000-4000-8000-0000000000bb';
const LINE_ID = '00000000-0000-4000-8000-0000000000cc';
const CONFIG_ID = '00000000-0000-4000-8000-0000000000dd';
const TERMS_ID = '00000000-0000-4000-8000-0000000000ee';
const SESSION_ID = '00000000-0000-4000-8000-0000000000ff';
const RECEIPT_ID = '00000000-0000-4000-8000-000000000111';
const SUBMISSION_ID = '00000000-0000-4000-8000-000000000222';

function jsonReq(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(lookupRowsByLabel)) delete lookupRowsByLabel[k];
  for (const k of Object.keys(insertReturningByLabel)) delete insertReturningByLabel[k];
  lookupKeyForNextSelect = null;
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'kai@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

// ─── pay-app-line-items ─────────────────────────────────────────────────────

describe('pay-app-line-items', () => {
  describe('GET list', () => {
    it('400 without pay_app_id', async () => {
      const route = require('@/app/api/aia/pay-app-line-items/route');
      const res = await route.GET(jsonReq('GET', 'https://x/api/aia/pay-app-line-items'));
      expect(res.status).toBe(400);
    });
    it('403 when permission denied', async () => {
      mockCheckPermission.mockResolvedValueOnce({ allowed: false, role: 'none', email: null });
      const route = require('@/app/api/aia/pay-app-line-items/route');
      const res = await route.GET(jsonReq('GET', `https://x/api/aia/pay-app-line-items?pay_app_id=${PAY_APP_ID}`));
      expect(res.status).toBe(403);
    });
    it('200 returns items array', async () => {
      lookupKeyForNextSelect = 'lines';
      lookupRowsByLabel.lines = [{ pay_app_line_id: LINE_ID, description: 'x' }];
      const route = require('@/app/api/aia/pay-app-line-items/route');
      const res = await route.GET(jsonReq('GET', `https://x/api/aia/pay-app-line-items?pay_app_id=${PAY_APP_ID}`));
      expect(res.status).toBe(200);
      const j = await res.json();
      expect(j.items).toHaveLength(1);
      expect(j.limit).toBe(50);
    });
  });

  describe('POST', () => {
    it('503 when postgres writes disabled', async () => {
      mockIsPostgresWriteEnabled.mockReturnValueOnce(false);
      const route = require('@/app/api/aia/pay-app-line-items/route');
      const res = await route.POST(jsonReq('POST', 'https://x/api/aia/pay-app-line-items', { pay_app_id: PAY_APP_ID }));
      expect(res.status).toBe(503);
    });
    it('400 missing pay_app_id', async () => {
      const route = require('@/app/api/aia/pay-app-line-items/route');
      const res = await route.POST(jsonReq('POST', 'https://x/api/aia/pay-app-line-items', { description: 'foo', line_number: 1 }));
      expect(res.status).toBe(400);
    });
    it('400 bad line_type', async () => {
      const route = require('@/app/api/aia/pay-app-line-items/route');
      const res = await route.POST(jsonReq('POST', 'https://x/api/aia/pay-app-line-items', {
        pay_app_id: PAY_APP_ID, description: 'x', line_number: 1, line_type: 'BOGUS',
      }));
      expect(res.status).toBe(400);
    });
    it('404 missing parent pay app', async () => {
      lookupKeyForNextSelect = 'payApp';
      lookupRowsByLabel.payApp = [];
      const route = require('@/app/api/aia/pay-app-line-items/route');
      const res = await route.POST(jsonReq('POST', 'https://x/api/aia/pay-app-line-items', {
        pay_app_id: PAY_APP_ID, description: 'x', line_number: 1,
      }));
      expect(res.status).toBe(404);
    });
    it('201 happy path', async () => {
      lookupKeyForNextSelect = 'payApp';
      lookupRowsByLabel.payApp = [{ pay_app_id: PAY_APP_ID }];
      insertReturningByLabel.pay_app_line_items = [{ pay_app_line_id: LINE_ID }];
      const route = require('@/app/api/aia/pay-app-line-items/route');
      const res = await route.POST(jsonReq('POST', 'https://x/api/aia/pay-app-line-items', {
        pay_app_id: PAY_APP_ID, description: 'x', line_number: 2,
      }));
      expect(res.status).toBe(201);
      expect(insertValuesSpy).toHaveBeenCalledWith('pay_app_line_items', expect.objectContaining({
        pay_app_id: PAY_APP_ID, line_number: 2, tenant_id: TENANT_ID,
      }));
    });
  });

  describe('PATCH [id]', () => {
    it('400 non-patchable field', async () => {
      const route = require('@/app/api/aia/pay-app-line-items/[id]/route');
      const res = await route.PATCH(
        jsonReq('PATCH', `https://x/api/aia/pay-app-line-items/${LINE_ID}`, { pay_app_id: 'changed' }),
        ctx(LINE_ID),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('FIELD_NOT_PATCHABLE');
    });
    it('404 not found', async () => {
      lookupKeyForNextSelect = 'line';
      lookupRowsByLabel.line = [];
      const route = require('@/app/api/aia/pay-app-line-items/[id]/route');
      const res = await route.PATCH(
        jsonReq('PATCH', `https://x/api/aia/pay-app-line-items/${LINE_ID}`, { description: 'updated' }),
        ctx(LINE_ID),
      );
      expect(res.status).toBe(404);
    });
    it('200 updates description', async () => {
      lookupKeyForNextSelect = 'line';
      lookupRowsByLabel.line = [{ pay_app_line_id: LINE_ID }];
      const route = require('@/app/api/aia/pay-app-line-items/[id]/route');
      const res = await route.PATCH(
        jsonReq('PATCH', `https://x/api/aia/pay-app-line-items/${LINE_ID}`, { description: 'updated' }),
        ctx(LINE_ID),
      );
      expect(res.status).toBe(200);
      expect(updateSetSpy).toHaveBeenCalledWith(
        'pay_app_line_items',
        expect.objectContaining({ description: 'updated' }),
      );
    });
  });

  describe('DELETE [id]', () => {
    function stageLineAndParent(state: string) {
      // First lookup: line itself
      lookupKeyForNextSelect = 'line';
      lookupRowsByLabel.line = [{ pay_app_line_id: LINE_ID, pay_app_id: PAY_APP_ID }];
      // The second lookup will fire with key still null; stage default for the parent
      lookupRowsByLabel.default = [{ state }];
    }
    it('404 line not found', async () => {
      lookupKeyForNextSelect = 'line';
      lookupRowsByLabel.line = [];
      const route = require('@/app/api/aia/pay-app-line-items/[id]/route');
      const res = await route.DELETE(jsonReq('DELETE', `https://x/api/aia/pay-app-line-items/${LINE_ID}`), ctx(LINE_ID));
      expect(res.status).toBe(404);
    });
    it('409 when parent state is post-lock', async () => {
      stageLineAndParent('SUBMITTED');
      const route = require('@/app/api/aia/pay-app-line-items/[id]/route');
      const res = await route.DELETE(jsonReq('DELETE', `https://x/api/aia/pay-app-line-items/${LINE_ID}`), ctx(LINE_ID));
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('PARENT_LOCKED');
    });
    it('200 when parent state is PENDING_DRAFT', async () => {
      stageLineAndParent('PENDING_DRAFT');
      const route = require('@/app/api/aia/pay-app-line-items/[id]/route');
      const res = await route.DELETE(jsonReq('DELETE', `https://x/api/aia/pay-app-line-items/${LINE_ID}`), ctx(LINE_ID));
      expect(res.status).toBe(200);
      expect(deleteSpy).toHaveBeenCalledWith('pay_app_line_items');
    });
  });
});

// ─── billing-format-config ──────────────────────────────────────────────────

describe('billing-format-config', () => {
  describe('GET list', () => {
    it('400 missing engagement_id', async () => {
      const route = require('@/app/api/aia/billing-format-config/route');
      const res = await route.GET(jsonReq('GET', 'https://x/api/aia/billing-format-config'));
      expect(res.status).toBe(400);
    });
    it('404 when no config exists', async () => {
      lookupKeyForNextSelect = 'cfg';
      lookupRowsByLabel.cfg = [];
      const route = require('@/app/api/aia/billing-format-config/route');
      const res = await route.GET(jsonReq('GET', `https://x/api/aia/billing-format-config?engagement_id=${ENG_ID}`));
      expect(res.status).toBe(404);
    });
    it('200 returns config row', async () => {
      lookupKeyForNextSelect = 'cfg';
      lookupRowsByLabel.cfg = [{ billing_config_id: CONFIG_ID, billing_format: 'AIA_G702_G703' }];
      const route = require('@/app/api/aia/billing-format-config/route');
      const res = await route.GET(jsonReq('GET', `https://x/api/aia/billing-format-config?engagement_id=${ENG_ID}`));
      expect(res.status).toBe(200);
      expect((await res.json()).billing_config_id).toBe(CONFIG_ID);
    });
  });

  describe('POST', () => {
    it('400 invalid billing_format', async () => {
      const route = require('@/app/api/aia/billing-format-config/route');
      const res = await route.POST(jsonReq('POST', 'https://x/api/aia/billing-format-config', {
        engagement_id: ENG_ID, billing_format: 'BOGUS',
      }));
      expect(res.status).toBe(400);
    });
    it('404 engagement missing', async () => {
      lookupKeyForNextSelect = 'eng';
      lookupRowsByLabel.eng = [];
      const route = require('@/app/api/aia/billing-format-config/route');
      const res = await route.POST(jsonReq('POST', 'https://x/api/aia/billing-format-config', {
        engagement_id: ENG_ID, billing_format: 'AIA_G702_G703',
      }));
      expect(res.status).toBe(404);
    });
    it('409 when duplicate config exists', async () => {
      // First select = engagement; second select = existing config
      lookupRowsByLabel.eng = [{ engagement_id: ENG_ID }];
      lookupRowsByLabel.existing = [{ billing_config_id: CONFIG_ID }];
      const flags = ['eng', 'existing'];
      lookupKeyForNextSelect = null;
      // Replace global select behaviour for this test by staging both into default-fallback chain:
      // Easier: pre-populate default to engagement, then on second call return existing.
      // We'll simulate by setting up sequencing through lookupKeyForNextSelect via beforeEach + manual:
      let callCount = 0;
      const origSelect = (require('@/db').db.select as jest.Mock);
      origSelect.mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve(lookupRowsByLabel[flags[callCount++]] ?? []) }) }),
      }));
      origSelect.mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve(lookupRowsByLabel[flags[callCount++]] ?? []) }) }),
      }));
      const route = require('@/app/api/aia/billing-format-config/route');
      const res = await route.POST(jsonReq('POST', 'https://x/api/aia/billing-format-config', {
        engagement_id: ENG_ID, billing_format: 'AIA_G702_G703',
      }));
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('DUPLICATE_CONFIG');
    });
    it('201 happy path', async () => {
      // Both engagement lookup and duplicate-check return non-empty / empty respectively
      let callCount = 0;
      const origSelect = (require('@/db').db.select as jest.Mock);
      origSelect.mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve(callCount++ === 0 ? [{ engagement_id: ENG_ID }] : []) }) }),
      }));
      origSelect.mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve(callCount++ === 0 ? [{ engagement_id: ENG_ID }] : []) }) }),
      }));
      insertReturningByLabel.billing_format_config = [{ billing_config_id: CONFIG_ID }];
      const route = require('@/app/api/aia/billing-format-config/route');
      const res = await route.POST(jsonReq('POST', 'https://x/api/aia/billing-format-config', {
        engagement_id: ENG_ID, billing_format: 'AIA_G702_G703',
      }));
      expect(res.status).toBe(201);
      expect((await res.json()).billing_config_id).toBe(CONFIG_ID);
    });
  });

  describe('PATCH [id]', () => {
    it('400 invalid billing_format', async () => {
      const route = require('@/app/api/aia/billing-format-config/[id]/route');
      const res = await route.PATCH(
        jsonReq('PATCH', `https://x/api/aia/billing-format-config/${CONFIG_ID}`, { billing_format: 'BOGUS' }),
        ctx(CONFIG_ID),
      );
      expect(res.status).toBe(400);
    });
    it('200 updates payment_terms', async () => {
      lookupKeyForNextSelect = 'cfg';
      lookupRowsByLabel.cfg = [{ billing_config_id: CONFIG_ID }];
      const route = require('@/app/api/aia/billing-format-config/[id]/route');
      const res = await route.PATCH(
        jsonReq('PATCH', `https://x/api/aia/billing-format-config/${CONFIG_ID}`, { payment_terms: 'NET_45' }),
        ctx(CONFIG_ID),
      );
      expect(res.status).toBe(200);
      expect(updateSetSpy).toHaveBeenCalledWith(
        'billing_format_config',
        expect.objectContaining({ payment_terms: 'NET_45' }),
      );
    });
  });
});

// ─── deposit-terms ──────────────────────────────────────────────────────────

describe('deposit-terms', () => {
  it('GET 400 without engagement_id', async () => {
    const route = require('@/app/api/aia/deposit-terms/route');
    const res = await route.GET(jsonReq('GET', 'https://x/api/aia/deposit-terms'));
    expect(res.status).toBe(400);
  });

  it('POST 400 invalid deposit_pattern', async () => {
    const route = require('@/app/api/aia/deposit-terms/route');
    const res = await route.POST(jsonReq('POST', 'https://x/api/aia/deposit-terms', {
      engagement_id: ENG_ID, deposit_pattern: 'BOGUS',
    }));
    expect(res.status).toBe(400);
  });

  it('POST 201 happy path', async () => {
    let callCount = 0;
    const origSelect = (require('@/db').db.select as jest.Mock);
    origSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(callCount++ === 0 ? [{ engagement_id: ENG_ID }] : []) }) }),
    }));
    origSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(callCount++ === 0 ? [{ engagement_id: ENG_ID }] : []) }) }),
    }));
    insertReturningByLabel.deposit_terms = [{ deposit_terms_id: TERMS_ID }];
    const route = require('@/app/api/aia/deposit-terms/route');
    const res = await route.POST(jsonReq('POST', 'https://x/api/aia/deposit-terms', {
      engagement_id: ENG_ID, deposit_pattern: 'MOBILIZATION_LINE',
    }));
    expect(res.status).toBe(201);
  });

  it('DELETE 409 when deposit_received_date set', async () => {
    lookupKeyForNextSelect = 'terms';
    lookupRowsByLabel.terms = [{ deposit_terms_id: TERMS_ID, deposit_received_date: '2026-01-15' }];
    const route = require('@/app/api/aia/deposit-terms/[id]/route');
    const res = await route.DELETE(jsonReq('DELETE', `https://x/api/aia/deposit-terms/${TERMS_ID}`), ctx(TERMS_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('DEPOSIT_RECORDED');
  });

  it('DELETE 200 when deposit_received_date null', async () => {
    lookupKeyForNextSelect = 'terms';
    lookupRowsByLabel.terms = [{ deposit_terms_id: TERMS_ID, deposit_received_date: null }];
    const route = require('@/app/api/aia/deposit-terms/[id]/route');
    const res = await route.DELETE(jsonReq('DELETE', `https://x/api/aia/deposit-terms/${TERMS_ID}`), ctx(TERMS_ID));
    expect(res.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith('deposit_terms');
  });

  it('PATCH 400 invalid draw_down_logic', async () => {
    const route = require('@/app/api/aia/deposit-terms/[id]/route');
    const res = await route.PATCH(
      jsonReq('PATCH', `https://x/api/aia/deposit-terms/${TERMS_ID}`, { draw_down_logic: 'BOGUS' }),
      ctx(TERMS_ID),
    );
    expect(res.status).toBe(400);
  });
});

// ─── notarization-sessions ──────────────────────────────────────────────────

describe('notarization-sessions', () => {
  it('GET 400 without engagement_id or pay_app_id', async () => {
    const route = require('@/app/api/aia/notarization-sessions/route');
    const res = await route.GET(jsonReq('GET', 'https://x/api/aia/notarization-sessions'));
    expect(res.status).toBe(400);
  });
  it('GET 400 invalid target_kind', async () => {
    const route = require('@/app/api/aia/notarization-sessions/route');
    const res = await route.GET(jsonReq('GET', `https://x/api/aia/notarization-sessions?engagement_id=${ENG_ID}&target_kind=BOGUS`));
    expect(res.status).toBe(400);
  });
  it('GET 200 with filters', async () => {
    lookupKeyForNextSelect = 'sessions';
    lookupRowsByLabel.sessions = [{ session_id: SESSION_ID }];
    const route = require('@/app/api/aia/notarization-sessions/route');
    const res = await route.GET(jsonReq('GET', `https://x/api/aia/notarization-sessions?engagement_id=${ENG_ID}&target_kind=PAY_APP`));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
  });

  describe('PATCH [id]', () => {
    it('400 rejects state field (lifecycle protected)', async () => {
      const route = require('@/app/api/aia/notarization-sessions/[id]/route');
      const res = await route.PATCH(
        jsonReq('PATCH', `https://x/api/aia/notarization-sessions/${SESSION_ID}`, { state: 'COMPLETED' }),
        ctx(SESSION_ID),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('FIELD_NOT_PATCHABLE');
    });
    it('400 rejects pay_app_id field', async () => {
      const route = require('@/app/api/aia/notarization-sessions/[id]/route');
      const res = await route.PATCH(
        jsonReq('PATCH', `https://x/api/aia/notarization-sessions/${SESSION_ID}`, { pay_app_id: PAY_APP_ID }),
        ctx(SESSION_ID),
      );
      expect(res.status).toBe(400);
    });
    it('200 updates notary_name', async () => {
      lookupKeyForNextSelect = 'session';
      lookupRowsByLabel.session = [{ session_id: SESSION_ID }];
      const route = require('@/app/api/aia/notarization-sessions/[id]/route');
      const res = await route.PATCH(
        jsonReq('PATCH', `https://x/api/aia/notarization-sessions/${SESSION_ID}`, { notary_name: 'Jane Doe' }),
        ctx(SESSION_ID),
      );
      expect(res.status).toBe(200);
      expect(updateSetSpy).toHaveBeenCalledWith(
        'notarization_sessions',
        expect.objectContaining({ notary_name: 'Jane Doe' }),
      );
    });
  });
});

// ─── cash-receipts ──────────────────────────────────────────────────────────

describe('cash-receipts', () => {
  it('GET 400 missing engagement_id', async () => {
    const route = require('@/app/api/aia/cash-receipts/route');
    const res = await route.GET(jsonReq('GET', 'https://x/api/aia/cash-receipts'));
    expect(res.status).toBe(400);
  });
  it('POST 400 missing amount', async () => {
    const route = require('@/app/api/aia/cash-receipts/route');
    const res = await route.POST(jsonReq('POST', 'https://x/api/aia/cash-receipts', {
      engagement_id: ENG_ID, receipt_date: '2026-04-01',
    }));
    expect(res.status).toBe(400);
  });
  it('POST 201 happy path', async () => {
    lookupKeyForNextSelect = 'eng';
    lookupRowsByLabel.eng = [{ engagement_id: ENG_ID }];
    insertReturningByLabel.cash_receipts = [{ receipt_id: RECEIPT_ID }];
    const route = require('@/app/api/aia/cash-receipts/route');
    const res = await route.POST(jsonReq('POST', 'https://x/api/aia/cash-receipts', {
      engagement_id: ENG_ID, receipt_date: '2026-04-01', amount: '1000.00',
    }));
    expect(res.status).toBe(201);
  });
  it('DELETE 409 when reconciliation_status FULL', async () => {
    lookupKeyForNextSelect = 'receipt';
    lookupRowsByLabel.receipt = [{ receipt_id: RECEIPT_ID, reconciliation_status: 'FULL' }];
    const route = require('@/app/api/aia/cash-receipts/[id]/route');
    const res = await route.DELETE(jsonReq('DELETE', `https://x/api/aia/cash-receipts/${RECEIPT_ID}`), ctx(RECEIPT_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('RECEIPT_RECONCILED');
  });
  it('DELETE 200 when reconciliation_status UNMATCHED', async () => {
    lookupKeyForNextSelect = 'receipt';
    lookupRowsByLabel.receipt = [{ receipt_id: RECEIPT_ID, reconciliation_status: 'UNMATCHED' }];
    const route = require('@/app/api/aia/cash-receipts/[id]/route');
    const res = await route.DELETE(jsonReq('DELETE', `https://x/api/aia/cash-receipts/${RECEIPT_ID}`), ctx(RECEIPT_ID));
    expect(res.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith('cash_receipts');
  });
  it('PATCH 400 non-patchable engagement_id', async () => {
    const route = require('@/app/api/aia/cash-receipts/[id]/route');
    const res = await route.PATCH(
      jsonReq('PATCH', `https://x/api/aia/cash-receipts/${RECEIPT_ID}`, { engagement_id: 'changed' }),
      ctx(RECEIPT_ID),
    );
    expect(res.status).toBe(400);
  });
});

// ─── textura-submissions ────────────────────────────────────────────────────

describe('textura-submissions', () => {
  it('GET 400 missing pay_app_id', async () => {
    const route = require('@/app/api/aia/textura-submissions/route');
    const res = await route.GET(jsonReq('GET', 'https://x/api/aia/textura-submissions'));
    expect(res.status).toBe(400);
  });
  it('POST 400 invalid status', async () => {
    const route = require('@/app/api/aia/textura-submissions/route');
    const res = await route.POST(jsonReq('POST', 'https://x/api/aia/textura-submissions', {
      pay_app_id: PAY_APP_ID, engagement_id: ENG_ID, submission_status: 'BOGUS',
    }));
    expect(res.status).toBe(400);
  });
  it('POST 404 missing parent pay app', async () => {
    lookupKeyForNextSelect = 'parent';
    lookupRowsByLabel.parent = [];
    const route = require('@/app/api/aia/textura-submissions/route');
    const res = await route.POST(jsonReq('POST', 'https://x/api/aia/textura-submissions', {
      pay_app_id: PAY_APP_ID, engagement_id: ENG_ID,
    }));
    expect(res.status).toBe(404);
  });
  it('POST 201 happy path', async () => {
    lookupKeyForNextSelect = 'parent';
    lookupRowsByLabel.parent = [{ pay_app_id: PAY_APP_ID }];
    insertReturningByLabel.textura_submissions = [{ submission_id: SUBMISSION_ID }];
    const route = require('@/app/api/aia/textura-submissions/route');
    const res = await route.POST(jsonReq('POST', 'https://x/api/aia/textura-submissions', {
      pay_app_id: PAY_APP_ID, engagement_id: ENG_ID,
    }));
    expect(res.status).toBe(201);
  });
  it('PATCH 200 updates submission_status', async () => {
    lookupKeyForNextSelect = 'sub';
    lookupRowsByLabel.sub = [{ submission_id: SUBMISSION_ID }];
    const route = require('@/app/api/aia/textura-submissions/[id]/route');
    const res = await route.PATCH(
      jsonReq('PATCH', `https://x/api/aia/textura-submissions/${SUBMISSION_ID}`, { submission_status: 'ACCEPTED' }),
      ctx(SUBMISSION_ID),
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      'textura_submissions',
      expect.objectContaining({ submission_status: 'ACCEPTED' }),
    );
  });
  it('PATCH 400 non-patchable pay_app_id', async () => {
    const route = require('@/app/api/aia/textura-submissions/[id]/route');
    const res = await route.PATCH(
      jsonReq('PATCH', `https://x/api/aia/textura-submissions/${SUBMISSION_ID}`, { pay_app_id: 'changed' }),
      ctx(SUBMISSION_ID),
    );
    expect(res.status).toBe(400);
  });
});

// ─── auth-gate smoke for one read-route ─────────────────────────────────────

describe('read-gate smoke (using deposit-terms)', () => {
  it('403 when checkPermission denies', async () => {
    mockCheckPermission.mockResolvedValueOnce({ allowed: false, role: 'none', email: null });
    const route = require('@/app/api/aia/deposit-terms/route');
    const res = await route.GET(jsonReq('GET', `https://x/api/aia/deposit-terms?engagement_id=${ENG_ID}`));
    expect(res.status).toBe(403);
  });
});
