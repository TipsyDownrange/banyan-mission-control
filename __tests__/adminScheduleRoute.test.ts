/**
 * BAN-98 Gate 6 — /api/admin/schedule read-only API tests.
 *
 * Verifies:
 * 1. Requires reports:view permission (403 when denied)
 * 2. No Sheets writes are called
 * 3. Joins Dispatch_Schedule, Users_Roles, Travel_Status correctly
 * 4. Identifies island movements (cross-island dispatch)
 * 5. Marks travel_booked correctly when travel record exists within 3 days
 * 6. Blockers are movements without travel booked
 */

const mockCheckPermissionServer = jest.fn();
const mockSheetsGet = jest.fn();
const mockSheetsAppend = jest.fn();
const mockSheetsUpdate = jest.fn();
const mockSheetsClear = jest.fn();

jest.mock('@/lib/permissions', () => ({
  checkPermissionServer: mockCheckPermissionServer,
  checkPermission: jest.fn(),
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'test-sheet-id'),
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: {
        values: {
          get: mockSheetsGet,
          append: mockSheetsAppend,
          update: mockSheetsUpdate,
          clear: mockSheetsClear,
        },
      },
    })),
  },
}));

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('https://test.example/api/admin/schedule');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

describe('GET /api/admin/schedule — permission gate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when reports:view is denied', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: false, role: 'glazier', email: null });

    const { GET } = await import('@/app/api/admin/schedule/route');
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/reports:view/);
    expect(mockSheetsGet).not.toHaveBeenCalled();
    expect(mockSheetsAppend).not.toHaveBeenCalled();
    expect(mockSheetsUpdate).not.toHaveBeenCalled();
    expect(mockSheetsClear).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/schedule — no writes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('never calls append, update, or clear on Sheets', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: true, role: 'admin_mgr', email: 'jenny@kulaglass.com' });
    mockSheetsGet.mockResolvedValue({ data: { values: [] } });

    const { GET } = await import('@/app/api/admin/schedule/route');
    await GET(makeRequest({ from: '2026-05-01', days: '7' }));

    expect(mockSheetsAppend).not.toHaveBeenCalled();
    expect(mockSheetsUpdate).not.toHaveBeenCalled();
    expect(mockSheetsClear).not.toHaveBeenCalled();
  });

  it('reads exactly the three expected sheet ranges', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: true, role: 'admin_mgr', email: 'jenny@kulaglass.com' });
    mockSheetsGet.mockResolvedValue({ data: { values: [] } });

    const { GET } = await import('@/app/api/admin/schedule/route');
    await GET(makeRequest({ from: '2026-05-01', days: '7' }));

    const ranges = mockSheetsGet.mock.calls.map((c: unknown[]) => (c[0] as { range: string }).range);
    expect(ranges).toContain('Dispatch_Schedule!A2:S5000');
    expect(ranges).toContain('Users_Roles!A2:R200');
    expect(ranges).toContain('Travel_Status!A2:K500');
    expect(mockSheetsGet).toHaveBeenCalledTimes(3);
  });
});

describe('GET /api/admin/schedule — data join and island movement logic', () => {
  beforeEach(() => jest.clearAllMocks());

  // Build a dispatch row with 19 cols (A:S contract)
  function dispatchRow(overrides: Partial<Record<string, string>> = {}): string[] {
    const defaults = {
      slot_id: 'SLOT-TEST-001',
      date: '2026-05-05',
      kID: 'K-001',
      project_name: 'Test Project',
      island: 'Maui',
      men_required: '2',
      hours_estimated: '8',
      assigned_crew: 'Karl Nakamura Sr.',
      created_by: 'frank@kulaglass.com',
      status: 'open',
      confirmations: '',
      work_type: 'install',
      notes: '',
      start_time: '07:00',
      end_time: '15:00',
      step_ids: '',
      hours_actual: '',
      last_modified: '2026-05-01T00:00:00Z',
      focus_step_ids: '[]',
    };
    const merged = { ...defaults, ...overrides };
    return [
      merged.slot_id, merged.date, merged.kID, merged.project_name, merged.island,
      merged.men_required, merged.hours_estimated, merged.assigned_crew, merged.created_by,
      merged.status, merged.confirmations, merged.work_type, merged.notes,
      merged.start_time, merged.end_time, merged.step_ids, merged.hours_actual,
      merged.last_modified, merged.focus_step_ids,
    ];
  }

  // Build a Users_Roles row (A2:R200 — col index: 0=user_id, 1=name, 2=role, 3=email, 5=island)
  function userRow(name: string, island: string, role = 'super', email = ''): string[] {
    const row = Array(18).fill('');
    row[0] = 'U-001';
    row[1] = name;
    row[2] = role;
    row[3] = email;
    row[5] = island;
    return row;
  }

  it('identifies a cross-island movement when crew home island differs from dispatch island', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: true, role: 'admin_mgr', email: 'jenny@kulaglass.com' });

    // Karl is Oahu-based but dispatched to Maui
    mockSheetsGet
      .mockResolvedValueOnce({ data: { values: [dispatchRow({ island: 'Maui', assigned_crew: 'Karl Nakamura Sr.' })] } })
      .mockResolvedValueOnce({ data: { values: [userRow('Karl Nakamura Sr.', 'Oahu', 'super', 'karl@kulaglass.com')] } })
      .mockResolvedValueOnce({ data: { values: [] } });

    const { GET } = await import('@/app/api/admin/schedule/route');
    const res = await GET(makeRequest({ from: '2026-05-05', days: '7' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.islandMovements).toHaveLength(1);
    expect(json.islandMovements[0].crew_name).toBe('Karl Nakamura Sr.');
    expect(json.islandMovements[0].home_island).toBe('Oahu');
    expect(json.islandMovements[0].dispatch_island).toBe('Maui');
    expect(json.islandMovements[0].travel_booked).toBe(false);
    expect(json.blockers).toHaveLength(1);
    expect(json.covered).toHaveLength(0);
  });

  it('marks travel_booked true when a travel record exists within 3 days of dispatch', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: true, role: 'pm_track', email: 'tia@kulaglass.com' });

    mockSheetsGet
      .mockResolvedValueOnce({ data: { values: [dispatchRow({ date: '2026-05-05', island: 'Maui', assigned_crew: 'Karl Nakamura Sr.' })] } })
      .mockResolvedValueOnce({ data: { values: [userRow('Karl Nakamura Sr.', 'Oahu')] } })
      // Travel record: Karl flies OGG (Maui) on 2026-05-05 (same day)
      .mockResolvedValueOnce({ data: { values: [
        ['Karl Nakamura Sr.', '2026-05-05', 'flight', 'HNL', 'Honolulu', 'OGG', 'Kahului', 'HA123', '06:00', 'booked', ''],
      ]}});

    const { GET } = await import('@/app/api/admin/schedule/route');
    const res = await GET(makeRequest({ from: '2026-05-05', days: '7' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.islandMovements[0].travel_booked).toBe(true);
    expect(json.blockers).toHaveLength(0);
    expect(json.covered).toHaveLength(1);
  });

  it('does not flag same-island assignments as movements', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: true, role: 'gm', email: 'sean@kulaglass.com' });

    // Karl is Oahu-based, dispatched to Oahu — no movement
    mockSheetsGet
      .mockResolvedValueOnce({ data: { values: [dispatchRow({ island: 'Oahu', assigned_crew: 'Karl Nakamura Sr.' })] } })
      .mockResolvedValueOnce({ data: { values: [userRow('Karl Nakamura Sr.', 'Oahu')] } })
      .mockResolvedValueOnce({ data: { values: [] } });

    const { GET } = await import('@/app/api/admin/schedule/route');
    const res = await GET(makeRequest({ from: '2026-05-05', days: '7' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.islandMovements).toHaveLength(0);
    expect(json.blockers).toHaveLength(0);
  });

  it('returns empty results when no dispatch slots exist', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: true, role: 'admin', email: 'jenna@kulaglass.com' });
    mockSheetsGet.mockResolvedValue({ data: { values: [] } });

    const { GET } = await import('@/app/api/admin/schedule/route');
    const res = await GET(makeRequest({ from: '2026-05-05', days: '14' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.slots).toHaveLength(0);
    expect(json.islandMovements).toHaveLength(0);
    expect(json.blockers).toHaveLength(0);
    expect(json.meta.slotCount).toBe(0);
  });

  it('filters dispatch slots outside the requested date window', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: true, role: 'admin_mgr', email: 'jenny@kulaglass.com' });

    // One slot in window (2026-05-05), one outside (2025-01-01)
    mockSheetsGet
      .mockResolvedValueOnce({ data: { values: [
        dispatchRow({ date: '2026-05-05', slot_id: 'SLOT-IN-WINDOW' }),
        dispatchRow({ date: '2025-01-01', slot_id: 'SLOT-OUT-OF-WINDOW' }),
      ]}})
      .mockResolvedValueOnce({ data: { values: [] } })
      .mockResolvedValueOnce({ data: { values: [] } });

    const { GET } = await import('@/app/api/admin/schedule/route');
    const res = await GET(makeRequest({ from: '2026-05-05', days: '7' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.slots).toHaveLength(1);
    expect(json.slots[0].slot_id).toBe('SLOT-IN-WINDOW');
  });
});

describe('GET /api/admin/schedule — role access', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows admin role (reports:view now included)', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: true, role: 'admin', email: 'jenna@kulaglass.com' });
    mockSheetsGet.mockResolvedValue({ data: { values: [] } });

    const { GET } = await import('@/app/api/admin/schedule/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it('allows pm_track role', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: true, role: 'pm_track', email: 'tia@kulaglass.com' });
    mockSheetsGet.mockResolvedValue({ data: { values: [] } });

    const { GET } = await import('@/app/api/admin/schedule/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it('blocks glazier role', async () => {
    mockCheckPermissionServer.mockResolvedValue({ allowed: false, role: 'glazier', email: 'karl.jr@kulaglass.com' });

    const { GET } = await import('@/app/api/admin/schedule/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });
});

export {};
