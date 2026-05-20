/**
 * @jest-environment jsdom
 *
 * BAN-374 P4 — ScheduleGanttView with Hawaii overlays.
 *
 * Same Gantt stub used in ban374ScheduleGanttView.test.tsx; this file
 * focuses on the three new overlay layers:
 *
 *   1. Travel chevron: outer-island bars get "+travel" suffix + lighter shade.
 *      Inflated end-date is forwarded to the Gantt component.
 *   2. Permit band: SVG `<rect>` per permit milestone, fill color encodes
 *      status (yellow pending → green approved → red overdue).
 *   3. Matson freight strip: SVG markers for sailing / arrival / cutoff.
 *
 * All overlays gated by their own boolean props; with the prop off the
 * overlay vanishes from the DOM.
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
      return <div data-bos-gantt-stub />;
    },
  };
});
jest.mock('gantt-task-react/dist/index.css', () => ({}), { virtual: true });

jest.mock('@/db', () => ({
  __esModule: true,
}));

import ScheduleGanttView from '@/components/schedule/ScheduleGanttView';
import type {
  SchedulePhase,
  ScheduleTask,
  ScheduleDependency,
  ScheduleMilestone,
  FreightCalendarEntry,
} from '@/components/schedule/ScheduleTab';

const PHASE_A = '00000000-0000-4000-8000-000000000a01';
const TASK_OAHU = '00000000-0000-4000-8000-000000000b01';
const TASK_MAUI = '00000000-0000-4000-8000-000000000b02';
const PERMIT_PENDING = '00000000-0000-4000-8000-000000000c01';
const PERMIT_APPROVED = '00000000-0000-4000-8000-000000000c02';
const PERMIT_OVERDUE = '00000000-0000-4000-8000-000000000c03';
const FREIGHT_1 = '00000000-0000-4000-8000-000000000d01';
const ENG_ID = '00000000-0000-4000-8000-000000000099';

const PHASES: SchedulePhase[] = [
  { id: PHASE_A, engagement_id: ENG_ID, name: 'Construction', sort_order: 0, planned_start: '2026-06-01', planned_end: '2026-08-31', actual_start: null, actual_end: null, status: 'planned' },
];

const TASKS: ScheduleTask[] = [
  { id: TASK_OAHU, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Site mobilization', description: null, sort_order: 0, planned_start: '2026-06-02', planned_end: '2026-06-06', planned_duration_days: 5, actual_start: null, actual_end: null, percent_complete: 0, status: 'planned', assigned_to_user_id: null, task_island: 'oahu' },
  { id: TASK_MAUI, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Glass install', description: null, sort_order: 1, planned_start: '2026-06-10', planned_end: '2026-06-14', planned_duration_days: 5, actual_start: null, actual_end: null, percent_complete: 0, status: 'planned', assigned_to_user_id: null, task_island: 'maui' },
];

const DEPS: ScheduleDependency[] = [];

const MILESTONES: ScheduleMilestone[] = [
  {
    id: PERMIT_PENDING,
    engagement_id: ENG_ID,
    name: 'County Permit',
    type: 'permit',
    planned_date: '2026-07-15',
    actual_date: null,
    status: 'pending',
    milestone_kind: 'permit',
    permit_authority: 'County of Maui DPW',
    permit_application_date: '2026-07-01',
    permit_estimated_approval_date: '2026-08-01',
    permit_actual_approval_date: null,
  },
  {
    id: PERMIT_APPROVED,
    engagement_id: ENG_ID,
    name: 'Electrical Permit',
    type: 'permit',
    planned_date: '2026-07-20',
    actual_date: null,
    status: 'met',
    milestone_kind: 'permit',
    permit_authority: 'County of Maui DPW',
    permit_application_date: '2026-06-15',
    permit_estimated_approval_date: '2026-07-15',
    permit_actual_approval_date: '2026-07-10',
  },
  {
    id: PERMIT_OVERDUE,
    engagement_id: ENG_ID,
    name: 'Plumbing Permit',
    type: 'permit',
    planned_date: '2026-06-30',
    actual_date: null,
    status: 'pending',
    milestone_kind: 'permit',
    permit_authority: 'County of Maui DPW',
    permit_application_date: '2026-02-01',
    permit_estimated_approval_date: '2026-03-15', // firmly past today (2026-05-20)
    permit_actual_approval_date: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000c04',
    engagement_id: ENG_ID,
    name: 'Substantial Completion',
    type: 'substantial_completion',
    planned_date: '2026-08-31',
    actual_date: null,
    status: 'pending',
    milestone_kind: 'standard',
    permit_authority: null,
    permit_application_date: null,
    permit_estimated_approval_date: null,
    permit_actual_approval_date: null,
  },
];

const FREIGHT: FreightCalendarEntry[] = [
  {
    freight_calendar_id: FREIGHT_1,
    carrier: 'Matson',
    route: 'LA-HON',
    sailing_date: '2026-07-01',
    arrival_date: '2026-07-06',
    cutoff_date: '2026-06-29',
    notes: null,
    deleted_at: null,
  },
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

const noop = () => {};

describe('<ScheduleGanttView> travel-factor overlay', () => {
  it('adds "+travel" suffix to outer-island task name when showTravelFactor is on', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        projectIsland="oahu"
        showTravelFactor
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    const passedTasks = getLatestProps().tasks as Array<Record<string, unknown>>;
    const mauiBar = passedTasks.find((t) => t.id === `task:${TASK_MAUI}`) as { name: string };
    const oahuBar = passedTasks.find((t) => t.id === `task:${TASK_OAHU}`) as { name: string };
    expect(mauiBar.name).toContain('+travel');
    expect(oahuBar.name).not.toContain('+travel');
  });

  it('does not inflate same-island tasks', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        projectIsland="oahu"
        showTravelFactor
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    const passedTasks = getLatestProps().tasks as Array<{ id: string; end: Date }>;
    const oahuBar = passedTasks.find((t) => t.id === `task:${TASK_OAHU}`)!;
    // Same-island end stays at June 6 (no inflation)
    expect(oahuBar.end.getMonth()).toBe(5); // June (0-indexed)
    expect(oahuBar.end.getDate()).toBe(6);
  });

  it('renders the travel-factor legend with outer-island task count', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        projectIsland="oahu"
        showTravelFactor
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    const legend = container.querySelector('[data-bos-travel-factor-legend]');
    expect(legend).not.toBeNull();
    expect(legend?.textContent).toContain('1 task');
    expect(container.querySelector(`[data-bos-travel-task="${TASK_MAUI}"]`)).not.toBeNull();
  });

  it('hides the travel-factor legend when showTravelFactor is off', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        projectIsland="oahu"
        showTravelFactor={false}
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    expect(container.querySelector('[data-bos-travel-factor-legend]')).toBeNull();
    const passedTasks = getLatestProps().tasks as Array<{ id: string; name: string }>;
    const mauiBar = passedTasks.find((t) => t.id === `task:${TASK_MAUI}`)!;
    expect(mauiBar.name).not.toContain('+travel');
  });
});

describe('<ScheduleGanttView> permit-timeline overlay', () => {
  it('renders the permit band when showPermits is on and permits exist', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        milestones={MILESTONES}
        showPermits
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    const band = container.querySelector('[data-bos-permit-band]');
    expect(band).not.toBeNull();
    // Only the three permit-kind milestones render; the 'standard' one does not.
    expect(container.querySelectorAll('[data-bos-permit-band-entry]')).toHaveLength(3);
    expect(container.querySelector(`[data-bos-permit-band-entry="${PERMIT_APPROVED}"]`)?.getAttribute('data-bos-permit-status')).toBe('approved');
    expect(container.querySelector(`[data-bos-permit-band-entry="${PERMIT_PENDING}"]`)?.getAttribute('data-bos-permit-status')).toBe('pending');
    expect(container.querySelector(`[data-bos-permit-band-entry="${PERMIT_OVERDUE}"]`)?.getAttribute('data-bos-permit-status')).toBe('overdue');
  });

  it('hides the permit band when showPermits is off', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        milestones={MILESTONES}
        showPermits={false}
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    expect(container.querySelector('[data-bos-permit-band]')).toBeNull();
  });

  it('hides the permit band when no permit milestones are passed', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        milestones={[]}
        showPermits
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    expect(container.querySelector('[data-bos-permit-band]')).toBeNull();
  });
});

describe('<ScheduleGanttView> Matson freight strip overlay', () => {
  it('renders sailing/arrival/cutoff markers when showFreight is on', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        freightCalendar={FREIGHT}
        showFreight
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    expect(container.querySelector('[data-bos-freight-strip]')).not.toBeNull();
    expect(container.querySelector(`[data-bos-freight-strip-entry="${FREIGHT_1}"]`)).not.toBeNull();
    expect(container.querySelector('[data-bos-freight-sailing]')).not.toBeNull();
    expect(container.querySelector('[data-bos-freight-cutoff]')).not.toBeNull();
    expect(container.querySelector('[data-bos-freight-arrival]')).not.toBeNull();
  });

  it('hides the freight strip when showFreight is off', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        freightCalendar={FREIGHT}
        showFreight={false}
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    expect(container.querySelector('[data-bos-freight-strip]')).toBeNull();
  });

  it('hides the freight strip when freight calendar is empty', async () => {
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        freightCalendar={[]}
        showFreight
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    expect(container.querySelector('[data-bos-freight-strip]')).toBeNull();
  });

  it('excludes soft-deleted freight entries', async () => {
    const deleted: FreightCalendarEntry[] = FREIGHT.map((f) => ({
      ...f,
      deleted_at: '2026-05-01T00:00:00Z',
    }));
    await renderAndFlush(
      <ScheduleGanttView
        phases={PHASES}
        tasks={TASKS}
        dependencies={DEPS}
        canWrite
        freightCalendar={deleted}
        showFreight
        onTaskReschedule={noop}
        onTaskProgress={noop}
      />,
    );
    expect(container.querySelector('[data-bos-freight-strip]')).toBeNull();
  });
});
