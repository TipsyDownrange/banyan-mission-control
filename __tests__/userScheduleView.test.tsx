/**
 * @jest-environment jsdom
 *
 * BAN-374 P5 — UserScheduleView render + drill-through tests.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import UserScheduleView, {
  type UserScheduleAssignment,
} from '@/components/schedule/UserScheduleView';
import type { ScheduleTask } from '@/components/schedule/ScheduleTab';

const ENG_ID = '00000000-0000-4000-8000-000000000099';
const PHASE_ID = '00000000-0000-4000-8000-000000000a01';
const USER_A = '00000000-0000-4000-8000-000000000301';
const USER_B = '00000000-0000-4000-8000-000000000302';
const TASK_1 = '00000000-0000-4000-8000-000000000b01';
const TASK_2 = '00000000-0000-4000-8000-000000000b02';

function task(over: Partial<ScheduleTask> & { id: string; name: string; planned_start: string; planned_end: string; }): ScheduleTask {
  return {
    phase_id: PHASE_ID,
    engagement_id: ENG_ID,
    description: null,
    sort_order: 0,
    planned_duration_days: null,
    actual_start: null,
    actual_end: null,
    percent_complete: 0,
    status: 'planned',
    assigned_to_user_id: null,
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

it('renders an empty state when no assignments are provided', async () => {
  await renderAndFlush(
    <UserScheduleView tasks={[]} assignments={[]} onDrillToTask={() => undefined} />,
  );
  expect(container.querySelector('[data-bos-user-schedule-empty]')).not.toBeNull();
});

it('groups assignments by user and renders one row per user', async () => {
  const tasks: ScheduleTask[] = [
    task({ id: TASK_1, name: 'Frame walls', planned_start: '2026-06-01', planned_end: '2026-06-05' }),
    task({ id: TASK_2, name: 'Install glass', planned_start: '2026-06-10', planned_end: '2026-06-15' }),
  ];
  const assignments: UserScheduleAssignment[] = [
    { task_resource_id: 'r1', schedule_task_id: TASK_1, user_id: USER_A, user_name: 'Anna Lead', user_email: 'anna@kulaglass.com', role_on_task: 'lead', allocation_percent: 100 },
    { task_resource_id: 'r2', schedule_task_id: TASK_2, user_id: USER_A, user_name: 'Anna Lead', user_email: 'anna@kulaglass.com', role_on_task: 'lead', allocation_percent: 50 },
    { task_resource_id: 'r3', schedule_task_id: TASK_1, user_id: USER_B, user_name: 'Ben Crew', user_email: 'ben@kulaglass.com', role_on_task: 'crew', allocation_percent: 100 },
  ];

  await renderAndFlush(
    <UserScheduleView tasks={tasks} assignments={assignments} onDrillToTask={() => undefined} />,
  );

  const userRows = container.querySelectorAll('[data-bos-user-schedule-row]');
  expect(userRows.length).toBe(2);
  expect(container.textContent).toContain('Anna Lead');
  expect(container.textContent).toContain('Ben Crew');
  expect(container.textContent).toContain('2 tasks');
  expect(container.textContent).toContain('1 task');
});

it('drills into a task when the bar is clicked', async () => {
  const tasks: ScheduleTask[] = [
    task({ id: TASK_1, name: 'Frame walls', planned_start: '2026-06-01', planned_end: '2026-06-05' }),
  ];
  const assignments: UserScheduleAssignment[] = [
    { task_resource_id: 'r1', schedule_task_id: TASK_1, user_id: USER_A, user_name: 'Anna Lead', user_email: 'anna@kulaglass.com', role_on_task: 'lead', allocation_percent: 100 },
  ];

  const onDrill = jest.fn();

  await renderAndFlush(
    <UserScheduleView tasks={tasks} assignments={assignments} onDrillToTask={onDrill} />,
  );

  const bar = container.querySelector(`[data-bos-user-schedule-bar="${TASK_1}"]`) as HTMLButtonElement;
  expect(bar).not.toBeNull();
  await act(async () => { bar.click(); });

  expect(onDrill).toHaveBeenCalledWith(TASK_1);
});
