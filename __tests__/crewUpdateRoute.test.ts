const mockSheets = jest.fn();

jest.mock('@/lib/gauth', () => ({ getGoogleAuth: jest.fn(() => ({})) }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('googleapis', () => ({ google: { sheets: mockSheets } }));

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://example.test/api/crew/update', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function userRow(overrides: Partial<Record<number, string>> = {}) {
  const row: string[] = [
    'crew_123',           // A user_id
    'Existing Name',      // B name
    'Journeyman',         // C role
    'work@example.test',  // D email
    '808-555-0100',       // E phone
    'Maui',               // F island
    'personal@test.test', // G personal_email
    'Glazier',            // H title
    'Field',              // I department
    'Maui HQ',            // J office
    '123 Old Home Rd',    // K home_address
    'Pat Contact 808',    // L emergency_contact
    '2024-01-02',         // M start_date
    'Existing notes',     // N notes
    'Field',              // O authority_level
    'Field-to-Office',    // P career_track
  ];

  for (const [index, value] of Object.entries(overrides)) {
    if (value !== undefined) row[Number(index)] = value;
  }

  return row;
}

function setupSheets(row = userRow()) {
  const valuesGet = jest.fn().mockResolvedValue({ data: { values: [row] } });
  const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });

  mockSheets.mockReturnValue({
    spreadsheets: {
      values: {
        get: valuesGet,
        update: valuesUpdate,
      },
    },
  });

  return { valuesGet, valuesUpdate };
}

async function postCrewUpdate(body: Record<string, unknown>, row = userRow()) {
  const sheets = setupSheets(row);
  const { POST } = await import('@/app/api/crew/update/route');
  const res = await POST(makeRequest(body));
  const updateCall = sheets.valuesUpdate.mock.calls[0]?.[0];
  const writtenRow = updateCall?.requestBody?.values?.[0] as string[] | undefined;

  return { res, ...sheets, updateCall, writtenRow };
}

describe('POST /api/crew/update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('reads the full Users_Roles A:P span before writing B:P', async () => {
    const { res, valuesGet, updateCall, writtenRow } = await postCrewUpdate({
      user_id: 'crew_123',
      phone: '808-555-9999',
    });

    expect(res.status).toBe(200);
    expect(valuesGet).toHaveBeenCalledWith(expect.objectContaining({
      spreadsheetId: 'backend-sheet-test',
      range: 'Users_Roles!A2:P100',
    }));
    expect(updateCall).toEqual(expect.objectContaining({
      spreadsheetId: 'backend-sheet-test',
      range: 'Users_Roles!B2:P2',
      valueInputOption: 'USER_ENTERED',
    }));
    expect(writtenRow).toHaveLength(15);
  });

  it('preserves home address and emergency contact when updating an early field', async () => {
    const { writtenRow } = await postCrewUpdate({
      user_id: 'crew_123',
      phone: '808-555-9999',
    });

    expect(writtenRow?.[3]).toBe('(808) 555-9999'); // E phone
    expect(writtenRow?.[9]).toBe('123 Old Home Rd'); // K home_address
    expect(writtenRow?.[10]).toBe('Pat Contact 808'); // L emergency_contact
  });

  it('preserves unrelated fields when updating a later field', async () => {
    const { writtenRow } = await postCrewUpdate({
      user_id: 'crew_123',
      start_date: '2026-05-04',
    });

    expect(writtenRow?.[0]).toBe('Existing Name'); // B name
    expect(writtenRow?.[3]).toBe('808-555-0100'); // E phone
    expect(writtenRow?.[9]).toBe('123 Old Home Rd'); // K home_address
    expect(writtenRow?.[10]).toBe('Pat Contact 808'); // L emergency_contact
    expect(writtenRow?.[11]).toBe('2026-05-04'); // M start_date
  });

  it('clears only an explicitly included empty-string field', async () => {
    const { writtenRow } = await postCrewUpdate({
      user_id: 'crew_123',
      home_address: '',
    });

    expect(writtenRow?.[8]).toBe('Maui HQ'); // J office
    expect(writtenRow?.[9]).toBe(''); // K home_address
    expect(writtenRow?.[10]).toBe('Pat Contact 808'); // L emergency_contact
  });

  it('preserves missing fields on partial payloads', async () => {
    const { writtenRow } = await postCrewUpdate({
      user_id: 'crew_123',
      status: 'ignored-out-of-model',
    });

    expect(writtenRow).toEqual(userRow().slice(1, 16));
  });
});

export {};
