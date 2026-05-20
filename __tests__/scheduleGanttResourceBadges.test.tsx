/**
 * @jest-environment jsdom
 *
 * BAN-374 P5 — ScheduleGanttView resource-badge render tests.
 *
 *   - Bars decorate the display name with crew initials when resources are
 *     present.
 *   - Bars without resources render with the plain task name (no brackets).
 *   - The ResourceLegend strip enumerates roles + allocations for each
 *     task that has assignments.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ScheduleGanttView from '@/components/schedule/ScheduleGanttView';
import type {
  SchedulePhase,
  ScheduleTask,
  TaskResourceSummary,
} from '@/components/schedule/ScheduleTab';

const ganttRenderSpy = jest.fn();

jest.mock('gantt-task-react', () => ({
  __esModule: true,
  Gantt: function GanttStub({ tasks }: { tasks: Array<{ id: string; name: string }> }) {
    ganttRenderSpy(tasks);
    return null;
  },
  ViewMode: { Week: 'Week', Month: 'Month', Year: 'Year' },
}));
jest.mock('gantt-task-react/dist/index.css', () => ({}), { virtual: true });

const ENG_ID = '00000000-0000-4000-8000-000000000099';
const PHASE_ID = '00000000-0000-4000-8000-000000000a01';
const TASK_ID = '00000000-0000-4000-8000-000000000b01';
const TASK_BARE_ID = '00000000-0000-4000-8000-000000000b02';

const PHASES: SchedulePhase[] = [
  { id: PHASE_ID, engagement_id: ENG_ID, name: 'Construction', sort_order: 0, planned_start: '2026-06-01', planned_end: '2026-06-30', actual_start: null, actual_end: null, status: 'planned' },
];

const TASKS: ScheduleTask[] = [
  { id: TASK_ID, phase_id: PHASE_ID, engagement_id: ENG_ID, name: 'Frame walls', description: null, sort_order: 0, planned_start: '2026-06-05', planned_end: '2026-06-09', planned_duration_days: 4, actual_start: null, actual_end: null, percent_complete: 0, status: 'planned', assigned_to_user_id: null },
  { id: TASK_BARE_ID, phase_id: PHASE_ID, engagement_id: ENG_ID, name: 'Order materials', description: null, sort_order: 1, planned_start: '2026-06-10', planned_end: '2026-06-14', planned_duration_days: 4, actual_start: null, actual_end: null, percent_complete: 0, status: 'planned', assigned_to_user_id: null },
];

const resourcesByTask = new Map<string, TaskResourceSummary[]>([
  [
    TASK_ID,
    [
      { task_resource_id: 'r1', schedule_task_id: TASK_ID, user_id: 'u1', user_name: 'Anna Lead', user_email: 'anna@kulaglass.com', role_on_task: 'lead', allocation_percent: 100 },
      { task_resource_id: 'r2', schedule_task_id: TASK_ID, user_id: 'u2', user_name: 'Ben Crew', user_email: 'ben@kulaglass.com', role_on_task: 'crew', allocation_percent: 50 },
    ],
  ],
]);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  ganttRenderSpy.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAndFlush(node: React.ReactNode) {
  await act(async () => { root.render(node); });
  await act(async () => { await Promise.resolve(); });
}

it('decorates task bars with crew initials when resources are assigned', async () => {
  await renderAndFlush(
    <ScheduleGanttView
      phases={PHASES}
      tasks={TASKS}
      dependencies={[]}
      canWrite
      resourcesByTask={resourcesByTask}
      onTaskReschedule={() => undefined}
      onTaskProgress={() => undefined}
    />,
  );

  const lastCall = ganttRenderSpy.mock.calls.pop();
  expect(lastCall).toBeDefined();
  const rendered = lastCall![0] as Array<{ id: string; name: string }>;
  const decorated = rendered.find((t) => t.id === `task:${TASK_ID}`);
  expect(decorated).toBeDefined();
  expect(decorated!.name).toContain('Frame walls');
  expect(decorated!.name).toMatch(/\[AL·BC\]/); // initials Anna Lead · Ben Crew
});

it('renders bare task names when no resources are assigned to that task', async () => {
  await renderAndFlush(
    <ScheduleGanttView
      phases={PHASES}
      tasks={TASKS}
      dependencies={[]}
      canWrite
      resourcesByTask={resourcesByTask}
      onTaskReschedule={() => undefined}
      onTaskProgress={() => undefined}
    />,
  );

  const lastCall = ganttRenderSpy.mock.calls.pop();
  const rendered = lastCall![0] as Array<{ id: string; name: string }>;
  const bare = rendered.find((t) => t.id === `task:${TASK_BARE_ID}`);
  expect(bare).toBeDefined();
  expect(bare!.name).toBe('Order materials');
  expect(bare!.name).not.toMatch(/\[/);
});

it('renders the resource legend strip with role + allocation per task', async () => {
  await renderAndFlush(
    <ScheduleGanttView
      phases={PHASES}
      tasks={TASKS}
      dependencies={[]}
      canWrite
      resourcesByTask={resourcesByTask}
      onTaskReschedule={() => undefined}
      onTaskProgress={() => undefined}
    />,
  );

  const legend = container.querySelector('[data-bos-gantt-resource-legend]');
  expect(legend).not.toBeNull();
  expect(legend?.textContent).toContain('Frame walls');
  expect(legend?.textContent).toContain('Anna Lead');
  expect(legend?.textContent).toContain('lead · 100%');
  expect(legend?.textContent).toContain('Ben Crew');
  expect(legend?.textContent).toContain('crew · 50%');
});

it('hides the legend entirely when resourcesByTask is empty', async () => {
  await renderAndFlush(
    <ScheduleGanttView
      phases={PHASES}
      tasks={TASKS}
      dependencies={[]}
      canWrite
      onTaskReschedule={() => undefined}
      onTaskProgress={() => undefined}
    />,
  );

  expect(container.querySelector('[data-bos-gantt-resource-legend]')).toBeNull();
});
