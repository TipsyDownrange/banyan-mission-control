/**
 * @jest-environment jsdom
 *
 * BAN-374 Scheduling Spine — Read-only enforcement when canWrite=false.
 *
 * Asserts that the Schedule tab hides every mutation control when the
 * caller's role is read-only (e.g. service_pm, gm, owner, sales, field).
 * The route layer enforces this server-side too, but hiding the UI keeps
 * dead buttons out of the read-only experience.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ScheduleTab from '@/components/schedule/ScheduleTab';

jest.mock('gantt-task-react', () => ({
  __esModule: true,
  Gantt: function GanttStub() { return null; },
  ViewMode: { Week: 'Week', Month: 'Month', Year: 'Year' },
}));
jest.mock('gantt-task-react/dist/index.css', () => ({}), { virtual: true });

const PHASE_A = '00000000-0000-4000-8000-000000000a01';
const TASK_1 = '00000000-0000-4000-8000-000000000b01';
const ENG_ID = '00000000-0000-4000-8000-000000000099';

const PHASES = [
  { id: PHASE_A, engagement_id: ENG_ID, name: 'Mobilization', sort_order: 0, planned_start: null, planned_end: null, actual_start: null, actual_end: null, status: 'planned' },
];

const TASKS = [
  { id: TASK_1, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Stage trailer', description: null, sort_order: 0, planned_start: null, planned_end: null, planned_duration_days: null, actual_start: null, actual_end: null, percent_complete: 0, status: 'planned', assigned_to_user_id: null },
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

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/schedule/phases?')) return jsonResponse({ kIDFound: true, items: PHASES });
    if (url.startsWith('/api/schedule/tasks?')) return jsonResponse({ kIDFound: true, items: TASKS });
    if (url.startsWith('/api/schedule/dependencies?')) return jsonResponse({ kIDFound: true, items: [] });
    return jsonResponse({}, 404);
  });
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAndFlush(node: React.ReactNode) {
  await act(async () => { root.render(node); });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('<ScheduleTab canWrite={false}> read-only mode', () => {
  it('hides the "Add Phase" button', async () => {
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={false} />);
    expect(container.querySelector('[data-bos-schedule-add-phase]')).toBeNull();
  });

  it('hides the per-phase "Add Task" + delete buttons', async () => {
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={false} />);
    expect(container.querySelector('[data-bos-schedule-add-task]')).toBeNull();
    expect(container.querySelector('[data-bos-schedule-delete-phase]')).toBeNull();
  });

  it('renders the task list without delete buttons', async () => {
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={false} />);
    expect(container.querySelector(`[data-bos-schedule-task="${TASK_1}"]`)).not.toBeNull();
    expect(container.querySelector('[data-bos-task-delete]')).toBeNull();
  });

  it('disables the mark-complete checkbox', async () => {
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={false} />);
    const checkbox = container.querySelector('[data-bos-task-complete-checkbox]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.disabled).toBe(true);
  });

  it('still shows the List/Gantt view toggle (read access is allowed)', async () => {
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={false} />);
    expect(container.querySelector('[data-bos-schedule-view-toggle]')).not.toBeNull();
  });
});
