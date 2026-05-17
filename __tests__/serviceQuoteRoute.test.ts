const mockGetServerSession = jest.fn();
const mockGetPreparedByUser = jest.fn();
const mockFireAndForgetCustomerUpdate = jest.fn();
const mockEmitMCEvent = jest.fn();
const mockBlockWOStagingPostgresReadOnlyMutation = jest.fn(() => null);

jest.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/users', () => ({ getPreparedByUser: mockGetPreparedByUser }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: jest.fn(() => ({})) }));
jest.mock('@/lib/updateCustomerRecord', () => ({ fireAndForgetCustomerUpdate: mockFireAndForgetCustomerUpdate }));
jest.mock('@/lib/hawaii-time', () => ({ hawaiiToday: jest.fn(() => '2026-05-05') }));
jest.mock('@/lib/events', () => ({ emitMCEvent: mockEmitMCEvent }));
jest.mock('@/lib/service-work-orders/postgres-read-guard', () => ({
  blockWOStagingPostgresReadOnlyMutation: mockBlockWOStagingPostgresReadOnlyMutation,
}));
jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(),
  },
}));

function jsonRequest(body: Record<string, unknown>) {
  return new Request('https://example.test/api/service/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('service quote customer identity containment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockBlockWOStagingPostgresReadOnlyMutation.mockReturnValue(null);
    mockEmitMCEvent.mockResolvedValue(undefined);
    mockGetServerSession.mockResolvedValue({ user: { email: 'estimator@kulaglass.com', name: 'Estimator' } });
    mockGetPreparedByUser.mockResolvedValue(null);
  });

  it('blocks quote writes during Service WO Postgres read-only smoke mode', async () => {
    mockBlockWOStagingPostgresReadOnlyMutation.mockReturnValue(
      Response.json(
        {
          error: 'Staging is currently in Work Order Postgres read-only smoke mode.',
          code: 'WO_POSTGRES_READ_ONLY_SMOKE',
          route: '/api/service/quote',
        },
        { status: 409 },
      ),
    );

    const { POST } = await import('@/app/api/service/quote/route');

    const res = await POST(jsonRequest({ woNumber: '26-1236' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('WO_POSTGRES_READ_ONLY_SMOKE');
    expect(json.route).toBe('/api/service/quote');
    expect(mockBlockWOStagingPostgresReadOnlyMutation).toHaveBeenCalledWith('/api/service/quote');
    expect(mockGetServerSession).not.toHaveBeenCalled();
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });

  it('generates quote data without backfeeding customer snapshot fields into Customers', async () => {
    const { POST } = await import('@/app/api/service/quote/route');

    const res = await POST(jsonRequest({
      woNumber: '26-1236',
      customerName: 'ACME Corp',
      customerPhone: '(808) 555-0199',
      customerEmail: 'pat@example.test',
      customerAddress: 'Legacy Account Address',
      projectDescription: 'Repair pane',
      siteAddress: '123 Kula Rd, Kula',
      island: 'Maui',
      scopeNarrative: 'Replace broken glass.',
      lineItems: [{ qty: 1, description: 'Glass replacement' }],
      materialsTotal: 100,
      equipmentCharges: 0,
      additionalCharges: [],
      installationIncluded: true,
      validityDays: 30,
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.quote.customerName).toBe('ACME Corp');
    expect(json.quote.siteAddress).toBe('123 Kula Rd, Kula');
    expect(mockFireAndForgetCustomerUpdate).not.toHaveBeenCalled();
  });
});

export {};
