import { buildWarRoomDashboard } from '../lib/war-room/data';
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
});
