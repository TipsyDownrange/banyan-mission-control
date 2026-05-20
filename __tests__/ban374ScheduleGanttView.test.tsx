/**
 * @jest-environment jsdom
 *
 * BAN-374 Scheduling Spine — Gantt view (Packet 3).
 *
 * The gantt-task-react module is replaced with a recording stub so we can
 * assert that ScheduleGanttView passes the right shape — bars colored by
 * status, dependency arrows derived from schedule_dependencies, zoom
 * toggle, drag callbacks routed back to onTaskReschedule.  The real
 * gantt-task-react components need DOM measurement APIs that jsdom
 * doesn't expose; this stub validates our wiring, not the library's
 * rendering.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const ganttPropsLog: Array<Record<string, unknown>> = [];

jest.mock('gantt-task-react', () => {
  const ViewMode = { Week: 'Week', Month: 'Month', Year: 'Year', Day: 'Day' };
  return {
    __esModule: true,
    ViewMode,
    Gantt: function GanttStub(props: Record<string, unknown>) {
      ganttPropsLog.push(props);
      return <div data-bos-gantt-stub data-tasks={JSON.stringify(props.tasks)} data-view-mode={String(props.viewMode)} />;
    },
  };
});
jest.mock('gantt-task-react/dist/index.css', () => ({}), { virtual: true });

import ScheduleGanttView from '@/components/schedule/ScheduleGanttView';
import type { SchedulePhase, ScheduleTask, ScheduleDependency } from '@/components/schedule/ScheduleTab';

const PHASE_A = '00000000-0000-4000-8000-000000000a01';
const TASK_1 = '00000000-0000-4000-8000-000000000b01';
const TASK_2 = '00000000-0000-4000-8000-000000000b02';
const ENG_ID = '00000000-0000-4000-8000-000000000099';

const PHASES: SchedulePhase[] = [
  { id: PHASE_A, engagement_id: ENG_ID, name: 'Mobilization', sort_order: 0, planned_start: '2026-06-01', planned_end: '2026-06-30', actual_start: null, actual_end: null, status: 'planned' },
];

const TASKS: ScheduleTask[] = [
  { id: TASK_1, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Stage trailer', description: null, sort_order: 0, planned_start: '2026-06-02', planned_end: '2026-06-03', planned_duration_days: 1, actual_start: null, actual_end: null, percent_complete: 100, status: 'complete', assigned_to_user_id: null },
  { id: TASK_2, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Site fencing', description: null, sort_order: 1, planned_start: '2026-06-04', planned_end: '2026-06-06', planned_duration_days: 2, actual_start: null, actual_end: null, percent_complete: 40, status: 'in_progress', assigned_to_user_id: null },
];

const DEPS: ScheduleDependency[] = [
  { id: '00000000-0000-4000-8000-000000000d01', predecessor_task_id: TASK_1, successor_task_id: TASK_2, type: 'finish_to_start', lag_days: 0 },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  ganttPropsLog.length = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAndFlush(node: React.ReactNode) {
  await act(async () => { root.render(node); });
  await act(async () => { await Promise.resolve(); });
}

function getLatestProps(): Record<string, unknown> {
  return ganttPropsLog[ganttPropsLog.length - 1];
}

describe('<ScheduleGanttView> bar rendering', () => {
  const noop = () => {};

  it('renders one phase bar + one task bar per phase/task', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={true}
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    const props = getLatestProps();
    const passedTasks = props.tasks as Array<Record<string, unknown>>;
    expect(passedTasks).toHaveLength(3); // 1 phase + 2 tasks
    expect(passedTasks.find((t) => t.id === `phase:${PHASE_A}`)).toBeDefined();
    expect(passedTasks.find((t) => t.id === `task:${TASK_1}`)).toBeDefined();
    expect(passedTasks.find((t) => t.id === `task:${TASK_2}`)).toBeDefined();
  });

  it('maps status to bar colors', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={true}
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    const passedTasks = getLatestProps().tasks as Array<Record<string, unknown>>;
    const t1 = passedTasks.find((t) => t.id === `task:${TASK_1}`) as { styles?: { backgroundColor?: string } };
    const t2 = passedTasks.find((t) => t.id === `task:${TASK_2}`) as { styles?: { backgroundColor?: string } };
    // task 1 is "complete" → green; task 2 is "in_progress" → amber
    expect(t1.styles?.backgroundColor).toBe('#059669');
    expect(t2.styles?.backgroundColor).toBe('#d97706');
  });

  it('wires dependency arrows from the schedule_dependencies edges', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={true}
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    const passedTasks = getLatestProps().tasks as Array<Record<string, unknown>>;
    const successor = passedTasks.find((t) => t.id === `task:${TASK_2}`) as { dependencies?: string[] };
    expect(successor.dependencies).toContain(`task:${TASK_1}`);
  });

  it('passes task progress straight through to the Gantt component', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={true}
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    const passedTasks = getLatestProps().tasks as Array<Record<string, unknown>>;
    const t1 = passedTasks.find((t) => t.id === `task:${TASK_1}`) as { progress?: number };
    const t2 = passedTasks.find((t) => t.id === `task:${TASK_2}`) as { progress?: number };
    expect(t1.progress).toBe(100);
    expect(t2.progress).toBe(40);
  });

  it('shows the zoom toggle with Week/Month/Quarter options', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={true}
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    expect(container.querySelector('[data-bos-gantt-zoom-option="Week"]')).not.toBeNull();
    expect(container.querySelector('[data-bos-gantt-zoom-option="Month"]')).not.toBeNull();
    expect(container.querySelector('[data-bos-gantt-zoom-option="Quarter"]')).not.toBeNull();
  });

  it('switching zoom updates the viewMode handed to Gantt', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={true}
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    expect(getLatestProps().viewMode).toBe('Month');

    await act(async () => {
      container.querySelector('[data-bos-gantt-zoom-option="Week"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(getLatestProps().viewMode).toBe('Week');
  });

  it('disables bar drag when canWrite is false', async () => {
    const noopOpts = () => {};
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={false}
        onTaskReschedule={noopOpts}
        onTaskProgress={noopOpts}
      />,
    );
    const passedTasks = getLatestProps().tasks as Array<{ isDisabled?: boolean; id: string; type: string }>;
    for (const t of passedTasks) {
      if (t.type === 'task') expect(t.isDisabled).toBe(true);
    }
  });

  it('shows the empty state when no phases or tasks exist', async () => {
    const noopOpts = () => {};
    await renderAndFlush(
      <ScheduleGanttView
        phases={[]}
        tasks={[]}
        dependencies={[]}
        canWrite={true}
        onTaskReschedule={noopOpts}
        onTaskProgress={noopOpts}
      />,
    );
    expect(container.querySelector('[data-bos-schedule-gantt-empty]')).not.toBeNull();
  });
});

describe('<ScheduleGanttView> drag callbacks', () => {
  it('forwards onDateChange to onTaskReschedule with ISO dates', async () => {
    const reschedule = jest.fn();
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={true}
        onTaskReschedule={reschedule}
        onTaskProgress={() => {}}
      />,
    );
    const props = getLatestProps();
    const onDateChange = props.onDateChange as (task: { id: string; start: Date; end: Date }) => boolean;
    const result = onDateChange({
      id: `task:${TASK_1}`,
      start: new Date(2026, 5, 10), // June 10
      end: new Date(2026, 5, 12),
    });
    expect(result).toBe(true);
    expect(reschedule).toHaveBeenCalledWith(TASK_1, '2026-06-10', '2026-06-12');
  });

  it('ignores phase rows when forwarding drag events', async () => {
    const reschedule = jest.fn();
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={true}
        onTaskReschedule={reschedule}
        onTaskProgress={() => {}}
      />,
    );
    const props = getLatestProps();
    const onDateChange = props.onDateChange as (task: { id: string; start: Date; end: Date }) => boolean;
    const result = onDateChange({
      id: `phase:${PHASE_A}`,
      start: new Date(),
      end: new Date(),
    });
    expect(result).toBe(false);
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('forwards onProgressChange to onTaskProgress clamped 0-100', async () => {
    const progress = jest.fn();
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={true}
        onTaskReschedule={() => {}}
        onTaskProgress={progress}
      />,
    );
    const props = getLatestProps();
    const onProgressChange = props.onProgressChange as (task: { id: string; progress: number }) => boolean;
    onProgressChange({ id: `task:${TASK_2}`, progress: 73.4 });
    expect(progress).toHaveBeenCalledWith(TASK_2, 73);
  });

  it('does not fire callbacks when canWrite is false', async () => {
    const reschedule = jest.fn();
    const progress = jest.fn();
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite={false}
        onTaskReschedule={reschedule}
        onTaskProgress={progress}
      />,
    );
    const props = getLatestProps();
    const result = (props.onDateChange as (t: { id: string; start: Date; end: Date }) => boolean)({
      id: `task:${TASK_1}`,
      start: new Date(),
      end: new Date(),
    });
    expect(result).toBe(false);
    expect(reschedule).not.toHaveBeenCalled();

    (props.onProgressChange as (t: { id: string; progress: number }) => boolean)({
      id: `task:${TASK_1}`,
      progress: 50,
    });
    expect(progress).not.toHaveBeenCalled();
  });
});
