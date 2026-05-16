import { GET } from '@/app/api/users/route';

const valuesGet = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: jest.fn().mockResolvedValue({
    user: { email: 'test@kulaglass.com' },
  }),
}));

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

describe('/api/users status column tolerance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults missing status column to active instead of failing the route', async () => {
    valuesGet.mockResolvedValue({
      data: {
        values: [
          ['user_id', 'Name', 'Role', 'Email', 'Phone', 'Island', 'roles_multi'],
          ['USR-002', 'Sean Daniels', 'GM/PM', 'sean@kulaglass.com', '', 'Maui', 'GM/PM'],
          ['USR-012', 'Nate Nakamura', 'Superintendent', 'nate@kulaglass.com', '', 'Maui', 'Superintendent'],
        ],
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const users = await res.json();
    expect(users).toEqual([
      expect.objectContaining({ user_id: 'USR-002', name: 'Sean Daniels', status: 'active' }),
      expect.objectContaining({ user_id: 'USR-012', name: 'Nate Nakamura', status: 'active' }),
    ]);
  });

  it('still filters inactive users when status exists', async () => {
    valuesGet.mockResolvedValue({
      data: {
        values: [
          ['user_id', 'Name', 'Role', 'Email', 'Island', 'status'],
          ['USR-002', 'Sean Daniels', 'GM/PM', 'sean@kulaglass.com', 'Maui', 'active'],
          ['USR-X', 'Archived Person', 'Crew', 'archived@kulaglass.com', 'Maui', 'inactive'],
        ],
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const users = await res.json();
    expect(users.map((u: { user_id: string }) => u.user_id)).toEqual(['USR-002']);
  });
});
