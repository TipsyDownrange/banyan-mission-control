/**
 * BAN-336 follow-up — itemized G702 line-2 net-change footnote.
 */

export {};

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const PAY_APP_ID = '00000000-0000-4000-8000-000000000111';
const ENG_ID = '00000000-0000-4000-8000-000000000099';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const sheetsGetMock = jest.fn();

function pushSelect(result: Array<Record<string, unknown>>) {
  selectResultQueue.push(result);
}

type ChainNode = PromiseLike<Array<Record<string, unknown>>> & {
  from: (...args: unknown[]) => ChainNode;
  where: (...args: unknown[]) => ChainNode;
  limit: (...args: unknown[]) => ChainNode;
};

function chainNode(): ChainNode {
  const node = {} as ChainNode;
  node.then = ((res, rej) =>
    Promise.resolve(selectResultQueue.shift() ?? []).then(res, rej)) as ChainNode['then'];
  node.from = () => chainNode();
  node.where = () => chainNode();
  node.limit = () => chainNode();
  return node;
}

function tbl(label: string) {
  const cols = [
    'pay_app_id', 'tenant_id', 'engagement_id', 'period_start', 'period_end',
    'kid', 'authorization_number', 'authorized_by_date',
    'not_to_exceed_amount', 'status',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  db: {
    select: jest.fn(() => chainNode()),
  },
  pay_applications: tbl('pay_applications'),
  engagements: tbl('engagements'),
  tm_authorizations: tbl('tm_authorizations'),
}));

jest.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: () => 'sheet-id',
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: () => ({ auth: true }),
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: {
          get: (...args: unknown[]) => sheetsGetMock(...args),
        },
      },
    }),
  },
}));

jest.mock('@react-pdf/renderer', () => {
  const React = require('react');
  const component = (name: string) => ({ children, ...props }: { children?: unknown }) =>
    React.createElement(name, props, children);
  return {
    Document: component('Document'),
    Page: component('Page'),
    Text: component('Text'),
    View: component('View'),
    Image: component('Image'),
    StyleSheet: { create: (styles: unknown) => styles },
    pdf: () => ({ toBuffer: async () => Buffer.from('pdf') }),
  };
});

function coRow(input: {
  number: string;
  kid?: string;
  status?: string;
  amount: string;
  approvedAt: string;
}) {
  const row = Array(19).fill('');
  row[1] = input.number;
  row[2] = input.kid ?? 'KID-100';
  row[3] = input.status ?? 'APPROVED';
  row[10] = input.amount;
  row[13] = input.approvedAt;
  return row;
}

function pushBaseSelects(tmRows: Array<Record<string, unknown>>) {
  pushSelect([{
    engagement_id: ENG_ID,
    period_start: '2026-03-01',
    period_end: '2026-04-30',
  }]);
  pushSelect([{ kid: 'KID-100' }]);
  pushSelect(tmRows);
}

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('\n');
  const maybeElement = node as { type?: unknown; props?: { children?: unknown } };
  if (typeof maybeElement.type === 'function') {
    return collectText(maybeElement.type(maybeElement.props));
  }
  return collectText(maybeElement.props?.children);
}

const summary = {
  line1_original_contract_sum: 1000,
  line2_net_change_by_co: 85_000,
  line3_contract_sum_to_date: 86_000,
  line4_total_completed_and_stored: 100,
  line5a_retainage_completed_work: 10,
  line5b_retainage_stored_materials: 0,
  line5_total_retainage: 10,
  line6_total_earned_less_retainage: 90,
  line7_less_previous_certificates: 0,
  line8_current_payment_due: 90,
  line9_balance_to_finish_plus_retainage: 85_910,
};

const renderInput = {
  header: {
    project_name: 'KID-100',
    kid: 'KID-100',
    pay_app_number: 3,
    period_start: '2026-03-01',
    period_end: '2026-04-30',
  },
  summary,
  lines: [{
    scheduled_value: 1000,
    work_completed_previous: 0,
    work_completed_this_period: 100,
    materials_stored_this_period: 0,
    total_completed_to_date: 100,
    pct_complete: 0.1,
    balance_to_finish: 900,
    retainage_held: 10,
    description: 'Glass',
  }],
  net_change_co_footnote: [
    'Net Change by Change Orders: $85,000',
    '- CO-001 $50,000 (approved 2026-03-15)',
    '- T&M Auth #1 $5,000 (signed 2026-04-15)',
    'Total: $85,000',
  ].join('\n'),
  ge_tax_summary_line: 4.24,
  retainage_pct_completed: 0.1,
  retainage_pct_stored: 0.1,
};

beforeEach(() => {
  jest.clearAllMocks();
  selectResultQueue.length = 0;
  sheetsGetMock.mockResolvedValue({ data: { values: [] } });
});

describe('composeNetChangeFootnote', () => {
  it('itemizes approved COs plus signed T&M authorizations and totals them', async () => {
    sheetsGetMock.mockResolvedValue({
      data: {
        values: [
          coRow({ number: 'CO-001', amount: '50000', approvedAt: '2026-03-15' }),
          coRow({ number: 'CO-002', amount: '30000', approvedAt: '2026-04-02' }),
          coRow({ number: 'CO-OLD', amount: '999', approvedAt: '2026-02-28' }),
        ],
      },
    });
    pushBaseSelects([{
      authorization_number: '1',
      authorized_by_date: '2026-04-15',
      not_to_exceed_amount: '5000',
      status: 'ACTIVE',
    }]);

    const { composeNetChangeFootnote } = await import('@/lib/aia/pay-app-net-change-summary');
    const result = await composeNetChangeFootnote(PAY_APP_ID, TENANT_ID);

    expect(result.total).toBe(85000);
    expect(result.footnote).toContain('Net Change by Change Orders: $85,000');
    expect(result.footnote).toContain('- CO-001 $50,000 (approved 2026-03-15)');
    expect(result.footnote).toContain('- CO-002 $30,000 (approved 2026-04-02)');
    expect(result.footnote).toContain('- T&M Auth #1 $5,000 (signed 2026-04-15)');
    expect(result.footnote).toContain('Total: $85,000');
    expect(result.footnote).not.toContain('CO-OLD');
  });

  it('handles the no-CO/no-T&M edge case', async () => {
    pushBaseSelects([]);

    const { composeNetChangeFootnote } = await import('@/lib/aia/pay-app-net-change-summary');
    const result = await composeNetChangeFootnote(PAY_APP_ID, TENANT_ID);

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.footnote).toBe('Net Change by Change Orders: $0\nTotal: $0');
  });

  it('handles only T&M authorizations', async () => {
    pushBaseSelects([{
      authorization_number: '7',
      authorized_by_date: '2026-03-20',
      not_to_exceed_amount: '12500',
      status: 'CLOSED',
    }]);

    const { composeNetChangeFootnote } = await import('@/lib/aia/pay-app-net-change-summary');
    const result = await composeNetChangeFootnote(PAY_APP_ID, TENANT_ID);

    expect(result.total).toBe(12500);
    expect(result.footnote).toContain('- T&M Auth #7 $12,500 (signed 2026-03-20)');
  });

  it('handles only approved change orders', async () => {
    sheetsGetMock.mockResolvedValue({
      data: {
        values: [
          coRow({ number: 'CO-010', status: 'APPROVED_WITH_T&M', amount: '1234.56', approvedAt: '2026-04-01' }),
        ],
      },
    });
    pushBaseSelects([]);

    const { composeNetChangeFootnote } = await import('@/lib/aia/pay-app-net-change-summary');
    const result = await composeNetChangeFootnote(PAY_APP_ID, TENANT_ID);

    expect(result.total).toBe(1234.56);
    expect(result.footnote).toContain('- CO-010 $1,234.56 (approved 2026-04-01)');
  });
});

describe('Pay App PDF net-change footnote rendering', () => {
  it('renders itemized footnotes in all three PDF templates', async () => {
    const { renderPayAppDocument } = await import('@/lib/aia/pay-app-pdf');

    for (const format of ['AIA_G702_G703', 'CUSTOM_TEMPLATE_AIA_STYLE', 'CUSTOM_TEMPLATE_SCHEDULE_ABC'] as const) {
      const doc = renderPayAppDocument({ ...renderInput, format });
      const text = collectText(doc);
      expect(text).toContain('Note (line 2):');
      expect(text).toContain('Net Change by Change Orders: $85,000');
      expect(text).toContain('- CO-001 $50,000 (approved 2026-03-15)');
      expect(text).toContain('- T&M Auth #1 $5,000 (signed 2026-04-15)');
    }
  });
});
