const mockSheets = jest.fn();
const mockGetCrosswalkSheets = jest.fn();
const mockLoadCrosswalkByCustomer = jest.fn();

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'backend-sheet-test'),
}));

jest.mock('@/lib/entityCrosswalk', () => ({
  getCrosswalkSheets: mockGetCrosswalkSheets,
  loadCrosswalkByCustomer: mockLoadCrosswalkByCustomer,
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: mockSheets,
  },
}));

describe('service customers route identity enrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds org_id only from Entity_Crosswalk mappings', async () => {
    const sheetsValuesGet = jest.fn().mockResolvedValue({
      data: {
        values: [
          ['Customer_ID', 'Company_Name', 'Contact_Person', 'Phone', 'Email', 'Address', 'Island'],
          ['CUST-0001', 'Mapped Customer', 'Mapped Contact', '(808) 555-0101', 'mapped@example.com', '18 Waokele Pl, Kula, HI 96790', 'Maui'],
          ['CUST-0002', 'Unmapped Customer', 'Unmapped Contact', '(808) 555-0102', 'unmapped@example.com', '99 Puamana St, Wailuku, HI 96793', 'Maui'],
        ],
      },
    });
    mockSheets.mockReturnValue({
      spreadsheets: {
        values: {
          get: sheetsValuesGet,
        },
      },
    });
    const crosswalkSheets = { crosswalk: true };
    mockGetCrosswalkSheets.mockReturnValue(crosswalkSheets);
    mockLoadCrosswalkByCustomer.mockResolvedValue(new Map([
      ['CUST-0001', { customer_id: 'CUST-0001', org_id: 'org_mapped' }],
    ]));

    const { GET } = await import('@/app/api/service/customers/route');
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetCrosswalkSheets).toHaveBeenCalledWith(true);
    expect(mockLoadCrosswalkByCustomer).toHaveBeenCalledWith(crosswalkSheets);
    expect(json.customers[0]).toEqual(expect.objectContaining({ customerId: 'CUST-0001', org_id: 'org_mapped' }));
    expect(json.customers[1]).toEqual(expect.objectContaining({ customerId: 'CUST-0002' }));
    expect(json.customers[1]).not.toHaveProperty('org_id');
    expect(json.identity_resolution).toBe('entity_crosswalk');
    expect(json.unresolved_org_count).toBe(1);
  });
});

export {};
