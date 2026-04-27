import { buildWarRoomDashboard, getWarRoomDashboardData } from '../lib/war-room/data';
import type { WarRoomIssue } from '../lib/war-room/types';

const baseIssue: WarRoomIssue = {
  id: 'BAN-1',
  title: 'Base issue',
  url: 'https://linear.app/banyan-os/issue/BAN-1/base',
  status: 'Todo',
  statusType: 'unstarted',
  priority: 'High',
  priorityValue: 2,
  labels: [],
  repo: 'MC',
  lane: 'Codex',
  area: 'Mission Control',
  risk: 'None',
  updatedAt: '2026-04-27T12:00:00.000Z',
  completedAt: null,
};

function issue(overrides: Partial<WarRoomIssue>): WarRoomIssue {
  return { ...baseIssue, ...overrides };
}

describe('War Room dashboard transform', () => {
  it('classifies issues into operating queues from labels and status', () => {
    const dashboard = buildWarRoomDashboard([
      issue({
        id: 'BAN-48',
        labels: ['Workflow: Ready for Codex', 'Risk: P1'],
        risk: 'P1',
      }),
      issue({
        id: 'BAN-47',
        labels: ['State: Needs Sean Answer', 'Risk: P1'],
        risk: 'P1',
      }),
      issue({
        id: 'BAN-44',
        labels: ['Workflow: Needs Review', 'Risk: P0'],
        risk: 'P0',
      }),
      issue({
        id: 'BAN-11',
        status: 'Done',
        statusType: 'completed',
        completedAt: '2026-04-27T13:00:00.000Z',
      }),
    ], 'fixture');

    expect(dashboard.queues.find(queue => queue.key === 'readyForCodex')?.issues.map(item => item.id)).toEqual(['BAN-48']);
    expect(dashboard.queues.find(queue => queue.key === 'needsSean')?.issues.map(item => item.id)).toEqual(['BAN-47']);
    expect(dashboard.queues.find(queue => queue.key === 'captainsTriage')?.issues.map(item => item.id).sort()).toEqual(['BAN-44', 'BAN-47', 'BAN-48']);
    expect(dashboard.queues.find(queue => queue.key === 'closed')?.issues.map(item => item.id)).toEqual(['BAN-11']);
    expect(dashboard.kpis).toMatchObject({
      readyForCodex: 1,
      needsSean: 1,
      p0p1Risks: 3,
      closedLogged: 1,
    });
  });

  it('uses live Linear data when LINEAR_API_KEY is configured, including empty boards', async () => {
    const originalKey = process.env.LINEAR_API_KEY;
    const originalFetch = global.fetch;

    process.env.LINEAR_API_KEY = 'test-linear-key';
    global.fetch = jest.fn(async () => Response.json({
      data: {
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    })) as jest.Mock;

    const dashboard = await getWarRoomDashboardData();

    expect(dashboard.source).toBe('linear');
    expect(dashboard.issues).toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith('https://api.linear.app/graphql', expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      headers: expect.objectContaining({ Authorization: 'test-linear-key' }),
    }));

    if (originalKey === undefined) {
      delete process.env.LINEAR_API_KEY;
    } else {
      process.env.LINEAR_API_KEY = originalKey;
    }
    global.fetch = originalFetch;
  });

  it('falls back to fixtures when LINEAR_API_KEY is missing', async () => {
    const originalKey = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;

    const dashboard = await getWarRoomDashboardData();

    expect(dashboard.source).toBe('fixture');
    expect(dashboard.issues.length).toBeGreaterThan(0);

    if (originalKey !== undefined) {
      process.env.LINEAR_API_KEY = originalKey;
    }
  });

  it('paginates live Linear reads and uses the newest comment summary', async () => {
    const originalKey = process.env.LINEAR_API_KEY;
    const originalFetch = global.fetch;
    const firstPageIssue = {
      identifier: 'BAN-49',
      title: 'Wire live Linear',
      url: 'https://linear.app/banyan-os/issue/BAN-49/live',
      priority: 1,
      priorityLabel: 'Urgent',
      updatedAt: '2026-04-27T20:44:54.378Z',
      completedAt: null,
      state: { name: 'Todo', type: 'unstarted' },
      labels: { nodes: [{ name: 'Workflow: Ready for Codex' }, { name: 'Risk: P1' }, { name: 'Repo: MC' }, { name: 'Lane: Codex' }, { name: 'Area: Mission Control' }] },
      comments: {
        nodes: [
          { body: 'Older comment', createdAt: '2026-04-27T20:40:00.000Z' },
          { body: 'Newest **safe** status comment', createdAt: '2026-04-27T20:45:00.000Z' },
        ],
      },
    };
    const secondPageIssue = {
      ...firstPageIssue,
      identifier: 'BAN-50',
      updatedAt: '2026-04-27T20:45:54.378Z',
      labels: { nodes: [{ name: 'State: Needs Sean Answer' }] },
      comments: { nodes: [] },
    };

    process.env.LINEAR_API_KEY = 'test-linear-key';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(Response.json({
        data: {
          issues: {
            nodes: [firstPageIssue],
            pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
          },
        },
      }))
      .mockResolvedValueOnce(Response.json({
        data: {
          issues: {
            nodes: [secondPageIssue],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })) as jest.Mock;

    const dashboard = await getWarRoomDashboardData();

    expect(dashboard.source).toBe('linear');
    expect(dashboard.issues.map(issue => issue.id)).toEqual(['BAN-50', 'BAN-49']);
    expect(dashboard.issues.find(issue => issue.id === 'BAN-49')?.latestCommentSummary).toBe('Newest safe status comment');
    expect(global.fetch).toHaveBeenCalledTimes(2);

    if (originalKey === undefined) {
      delete process.env.LINEAR_API_KEY;
    } else {
      process.env.LINEAR_API_KEY = originalKey;
    }
    global.fetch = originalFetch;
  });
});
