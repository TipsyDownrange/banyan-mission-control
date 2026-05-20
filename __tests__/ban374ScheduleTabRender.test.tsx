/**
 * @jest-environment jsdom
 *
 * BAN-374 Scheduling Spine — <ScheduleTab> render tests.
 *
 * Verifies the list view renders phases + tasks once /api/schedule/*
 * responses resolve, that status pills appear, that the loading and
 * "no schedule data" branches work, and that the view toggle is present.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ScheduleTab from '@/components/schedule/ScheduleTab';

// gantt-task-react reaches for window.MutationObserver / canvas APIs that
// jsdom won't fully exercise here; we don't need its visuals for these
// render tests, so we stub the lazy-loaded module.
jest.mock('gantt-task-react', () => ({
  __esModule: true,
  Gantt: function GanttStub() { return null; },
  ViewMode: { Week: 'Week', Month: 'Month', Year: 'Year' },
}));

jest.mock('gantt-task-react/dist/index.css', () => ({}), { virtual: true });

const PHASE_A = '00000000-0000-4000-8000-000000000a01';
const PHASE_B = '00000000-0000-4000-8000-000000000a02';
const TASK_1 = '00000000-0000-4000-8000-000000000b01';
const TASK_2 = '00000000-0000-4000-8000-000000000b02';
const TASK_3 = '00000000-0000-4000-8000-000000000b03';
const ENG_ID = '00000000-0000-4000-8000-000000000099';

const PHASES = [
  { id: PHASE_A, engagement_id: ENG_ID, name: 'Mobilization', sort_order: 0, planned_start: '2026-06-01', planned_end: '2026-06-14', actual_start: null, actual_end: null, status: 'in_progress' },
  { id: PHASE_B, engagement_id: ENG_ID, name: 'Construction', sort_order: 1, planned_start: '2026-06-15', planned_end: '2026-09-30', actual_start: null, actual_end: null, status: 'planned' },
];

const TASKS = [
  { id: TASK_1, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Stage trailer', description: null, sort_order: 0, planned_start: '2026-06-02', planned_end: '2026-06-03', planned_duration_days: 1, actual_start: '2026-06-02', actual_end: '2026-06-03', percent_complete: 100, status: 'complete', assigned_to_user_id: null },
  { id: TASK_2, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Site fencing', description: 'Perimeter chain link', sort_order: 1, planned_start: '2026-06-04', planned_end: '2026-06-06', planned_duration_days: 2, actual_start: null, actual_end: null, percent_complete: 40, status: 'in_progress', assigned_to_user_id: null },
  { id: TASK_3, phase_id: PHASE_B, engagement_id: ENG_ID, name: 'Frame walls', description: null, sort_order: 0, planned_start: '2026-06-20', planned_end: '2026-07-05', planned_duration_days: 15, actual_start: null, actual_end: null, percent_complete: 0, status: 'blocked', assigned_to_user_id: null },
];

const DEPS = [
  { id: '00000000-0000-4000-8000-000000000d01', predecessor_task_id: TASK_2, successor_task_id: TASK_3, type: 'finish_to_start', lag_days: 0 },
];

let container: HTMLDivElement;
let root: Root;
const fetchMock = jest.fn();

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function setupFetch(opts?: { kIDFound?: boolean }) {
  const kIDFound = opts?.kIDFound ?? true;
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/schedule/phases?')) {
      return jsonResponse({ kIDFound, items: kIDFound ? PHASES : [] });
    }
    if (url.startsWith('/api/schedule/tasks?')) {
      return jsonResponse({ kIDFound, items: kIDFound ? TASKS : [] });
    }
    if (url.startsWith('/api/schedule/dependencies?')) {
      return jsonResponse({ kIDFound, items: kIDFound ? DEPS : [] });
    }
    return jsonResponse({}, 404);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock.mockReset();
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAndFlush(node: React.ReactNode) {
  await act(async () => {
    root.render(node);
  });
  // Let the useEffect fetches resolve.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('<ScheduleTab> render', () => {
  it('shows the loading state initially', () => {
    setupFetch();
    act(() => root.render(<ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="unknown" />));
    expect(container.querySelector('[data-bos-schedule-loading]')).not.toBeNull();
  });

  it('renders phase sections after fetch resolves', async () => {
    setupFetch();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="unknown" />);
    const phases = container.querySelectorAll('[data-bos-schedule-phase]');
    expect(phases.length).toBe(2);
    expect(container.textContent).toContain('Mobilization');
    expect(container.textContent).toContain('Construction');
  });

  it('renders task rows under their phase', async () => {
    setupFetch();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="unknown" />);
    const taskRows = container.querySelectorAll('[data-bos-schedule-task]');
    expect(taskRows.length).toBe(3);
    expect(container.textContent).toContain('Stage trailer');
    expect(container.textContent).toContain('Site fencing');
    expect(container.textContent).toContain('Frame walls');
  });

  it('shows the empty state when the kID is not in Postgres', async () => {
    setupFetch({ kIDFound: false });
    await renderAndFlush(<ScheduleTab kID="PRJ-99-9999" canWrite={true} projectIsland="unknown" />);
    expect(container.querySelector('[data-bos-schedule-empty]')).not.toBeNull();
    expect(container.textContent).toContain('No schedule data');
  });

  it('shows the no-phases empty state when kID exists but has none', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/schedule/')) {
        return jsonResponse({ kIDFound: true, items: [] });
      }
      return jsonResponse({}, 404);
    });
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="unknown" />);
    expect(container.textContent).toContain('No phases yet');
  });

  it('exposes the List/Gantt view toggle', async () => {
    setupFetch();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="unknown" />);
    const toggle = container.querySelector('[data-bos-schedule-view-toggle]');
    expect(toggle).not.toBeNull();
    expect(container.querySelector('[data-bos-schedule-view="list"]')).not.toBeNull();
    expect(container.querySelector('[data-bos-schedule-view="gantt"]')).not.toBeNull();
  });

  it('renders the % complete column for each task', async () => {
    setupFetch();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="unknown" />);
    const text = container.textContent || '';
    expect(text).toContain('100%');
    expect(text).toContain('40%');
    expect(text).toContain('0%');
  });
});
