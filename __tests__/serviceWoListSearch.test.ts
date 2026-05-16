import { GET } from '@/app/api/service/wo-list/route';
import { SWO_COL } from '@/lib/contracts/service-work-orders';

const valuesGet = jest.fn();

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'sheet-id'),
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: { values: { get: valuesGet } },
    })),
  },
}));

jest.mock('@/lib/service-work-orders/postgres-read', () => ({
  shouldReadServiceWorkOrdersFromPostgres: jest.fn(() => false),
  loadWorkOrderPickerFromPostgresShadow: jest.fn(),
}));

function makeRow(fields: Partial<Record<keyof typeof SWO_COL, string>>) {
  const row: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    row[SWO_COL[key as keyof typeof SWO_COL]] = value;
  }
  return row;
}

describe('/api/service/wo-list search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    valuesGet.mockResolvedValue({
      data: {
        values: [
          makeRow({ wo_id: 'SWO-1', wo_number: 'WO-26-8299', name: 'Sean Daniels storefront install', status: 'scheduled', island: 'Maui', contact_person: 'Sean Daniels' }),
          makeRow({ wo_id: 'SWO-2', wo_number: 'WO-26-9000', name: 'Glazer Residence door repair', status: 'approved', island: 'Maui', contact_person: 'Glazer Family' }),
          makeRow({ wo_id: 'SWO-3', wo_number: 'WO-26-9001', name: 'ADX laminated glass panel', status: 'quote', island: 'Maui', contact_person: 'Tyler' }),
        ],
      },
    });
  });

  it('filters by search param across id, name, island, status, and contact', async () => {
    const res = await GET(new Request('http://localhost/api/service/wo-list?search=Glazer'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.workOrders).toHaveLength(1);
    expect(json.workOrders[0]).toMatchObject({ id: 'WO-26-9000', name: 'Glazer Residence door repair' });
  });

  it('supports q/customer aliases used by older callers', async () => {
    const byQ = await (await GET(new Request('http://localhost/api/service/wo-list?q=ADX'))).json();
    const byCustomer = await (await GET(new Request('http://localhost/api/service/wo-list?customer=Sean'))).json();

    expect(byQ.workOrders.map((wo: { id: string }) => wo.id)).toEqual(['WO-26-9001']);
    expect(byCustomer.workOrders.map((wo: { id: string }) => wo.id)).toEqual(['WO-26-8299']);
  });
});
