const mockSheets = jest.fn();

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: mockSheets,
  },
}));

describe('updateCustomerRecord address containment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not backfeed a WO/site address or city into Customers address fields by default', async () => {
    const valuesGet = jest.fn().mockResolvedValue({
      data: {
        values: [
          ['Customer ID', 'Name', 'Type', 'Island', 'Address', 'City', 'Primary Contact', 'Phone', 'Email'],
          ['CUST-0001', 'Kula Glass', '', '', 'Account Address On File', 'Wailuku', '', '(808) 555-0199', ''],
        ],
      },
    });
    const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });

    mockSheets.mockReturnValue({
      spreadsheets: {
        values: {
          get: valuesGet,
          update: valuesUpdate,
        },
      },
    });

    const { updateCustomerRecord } = await import('@/lib/updateCustomerRecord');

    await updateCustomerRecord({
      name: 'Kula Glass',
      phone: '(808) 555-0199',
      email: 'office@kulaglass.com',
      address: 'WO Jobsite Address',
      city: 'Kula',
      source: 'wo_update',
    });

    expect(valuesUpdate).toHaveBeenCalledTimes(1);
    const updatedRow = valuesUpdate.mock.calls[0][0].requestBody.values[0];
    expect(updatedRow[4]).toBe('Account Address On File');
    expect(updatedRow[5]).toBe('Wailuku');
    expect(updatedRow[8]).toBe('office@kulaglass.com');
  });

  it('allows Customers address fields only for an explicit approved address update path', async () => {
    const valuesGet = jest.fn().mockResolvedValue({
      data: {
        values: [
          ['Customer ID', 'Name', 'Type', 'Island', 'Address', 'City', 'Primary Contact', 'Phone', 'Email'],
          ['CUST-0001', 'Kula Glass', '', '', 'Account Address On File', '', '', '(808) 555-0199', ''],
        ],
      },
    });
    const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });

    mockSheets.mockReturnValue({
      spreadsheets: {
        values: {
          get: valuesGet,
          update: valuesUpdate,
        },
      },
    });

    const { updateCustomerRecord } = await import('@/lib/updateCustomerRecord');

    await updateCustomerRecord({
      name: 'Kula Glass',
      phone: '(808) 555-0199',
      address: 'Approved Account Address',
      city: 'Kihei',
      allowAddressUpdate: true,
      source: 'customer_account_update',
    });

    expect(valuesUpdate).toHaveBeenCalledTimes(1);
    const updatedRow = valuesUpdate.mock.calls[0][0].requestBody.values[0];
    expect(updatedRow[4]).toBe('Approved Account Address');
    expect(updatedRow[5]).toBe('Kihei');
  });
});

export {};
