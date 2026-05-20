/**
 * @jest-environment jsdom
 *
 * BAN-374 P6 — Permit-milestone "Add" button on the Gantt view.
 *
 * The button surfaces only when ALL THREE conditions hold:
 *   1. canWrite is true (SCHEDULE_WRITE roles)
 *   2. master Hawaii overlay toggle is on (default ON for Hawaii tenants)
 *   3. permits sub-toggle is on (default ON when master is on)
 *
 * Submitting the modal POSTs to /api/schedule/milestones with
 * milestone_kind='permit' and the captured permit_* fields.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

jest.mock('gantt-task-react', () => ({
  __esModule: true,
  Gantt: function GanttStub() { return null; },
  ViewMode: { Week: 'Week', Month: 'Month', Year: 'Year' },
}));
jest.mock('gantt-task-react/dist/index.css', () => ({}), { virtual: true });

import ScheduleTab from '@/components/schedule/ScheduleTab';

const PHASE_A = '00000000-0000-4000-8000-000000000a01';
const TASK_1 = '00000000-0000-4000-8000-000000000b01';
const ENG_ID = '00000000-0000-4000-8000-000000000099';

const PHASES = [
  { id: PHASE_A, engagement_id: ENG_ID, name: 'Permitting', sort_order: 0, planned_start: '2026-06-01', planned_end: '2026-08-31', actual_start: null, actual_end: null, status: 'planned' },
];
const TASKS = [
  { id: TASK_1, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Site prep', description: null, sort_order: 0, planned_start: '2026-06-02', planned_end: '2026-06-06', planned_duration_days: 5, actual_start: null, actual_end: null, percent_complete: 0, status: 'planned', assigned_to_user_id: null, task_island: 'maui' },
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

function setupFetch() {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'POST' && url.startsWith('/api/schedule/milestones')) {
      return jsonResponse({ ok: true, milestone: { id: 'new-ms' } }, 201);
    }
    if (url.startsWith('/api/schedule/phases?')) return jsonResponse({ kIDFound: true, items: PHASES });
    if (url.startsWith('/api/schedule/tasks?')) return jsonResponse({ kIDFound: true, items: TASKS });
    if (url.startsWith('/api/schedule/dependencies?')) return jsonResponse({ kIDFound: true, items: [] });
    if (url.startsWith('/api/schedule/milestones?')) return jsonResponse({ items: [] });
    if (url.startsWith('/api/schedule/freight-calendar')) return jsonResponse({ items: [] });
    if (url.includes('/resources') || url.includes('/users-pool')) return jsonResponse({ items: [] });
    return jsonResponse({}, 404);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock.mockReset();
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  setupFetch();
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
    await Promise.resolve();
  });
}

async function switchToGanttView() {
  const btn = container.querySelector('[data-bos-schedule-view="gantt"]') as HTMLButtonElement;
  await act(async () => btn.click());
  await act(async () => { await Promise.resolve(); });
}

function getAddPermitButton(): HTMLButtonElement | null {
  return container.querySelector('[data-bos-add-permit-milestone]') as HTMLButtonElement | null;
}

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Permit milestone Add button render conditions (BAN-374 P6)', () => {
  it('is visible when canWrite + Hawaii overlay on + permits sub-toggle on (defaults for Hawaii project)', async () => {
    await renderAndFlush(
      <ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="maui" />,
    );
    await switchToGanttView();
    expect(getAddPermitButton()).not.toBeNull();
  });

  it('is hidden when canWrite is false (read-only role)', async () => {
    await renderAndFlush(
      <ScheduleTab kID="PRJ-26-0001" canWrite={false} projectIsland="maui" />,
    );
    await switchToGanttView();
    expect(getAddPermitButton()).toBeNull();
  });

  it('is hidden when master Hawaii overlay toggle is off', async () => {
    await renderAndFlush(
      <ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="maui" />,
    );
    await switchToGanttView();
    const master = container.querySelector(
      '[data-bos-overlay-toggle-input="master"]',
    ) as HTMLInputElement;
    await act(async () => master.click());
    expect(getAddPermitButton()).toBeNull();
  });

  it('is hidden when permits sub-toggle is off (master still on)', async () => {
    await renderAndFlush(
      <ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="maui" />,
    );
    await switchToGanttView();
    const permits = container.querySelector(
      '[data-bos-overlay-toggle-input="permits"]',
    ) as HTMLInputElement;
    await act(async () => permits.click());
    expect(getAddPermitButton()).toBeNull();
  });
});

describe('Permit milestone Add modal submit (BAN-374 P6)', () => {
  it('POSTs to /api/schedule/milestones with milestone_kind=permit + permit_* fields', async () => {
    await renderAndFlush(
      <ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="maui" />,
    );
    await switchToGanttView();
    const addBtn = getAddPermitButton()!;
    await act(async () => addBtn.click());

    const name = container.querySelector('[data-bos-add-permit-name]') as HTMLInputElement;
    const planned = container.querySelector('[data-bos-add-permit-planned]') as HTMLInputElement;
    const authority = container.querySelector('[data-bos-add-permit-authority]') as HTMLInputElement;
    const application = container.querySelector('[data-bos-add-permit-application]') as HTMLInputElement;
    const estimated = container.querySelector('[data-bos-add-permit-estimated]') as HTMLInputElement;

    expect(name).not.toBeNull();
    expect(planned).not.toBeNull();

    await act(async () => {
      setInput(name, 'Maui DPW Building Permit');
      setInput(planned, '2026-08-01');
      setInput(authority, 'County of Maui DPW');
      setInput(application, '2026-07-01');
      setInput(estimated, '2026-08-01');
    });

    const submit = container.querySelector('[data-bos-add-permit-submit]') as HTMLButtonElement;
    await act(async () => submit.click());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const postCall = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit)?.method === 'POST' && (c[0] as string).startsWith('/api/schedule/milestones'),
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      engagement_kid: 'PRJ-26-0001',
      name: 'Maui DPW Building Permit',
      type: 'permit',
      milestone_kind: 'permit',
      planned_date: '2026-08-01',
      permit_authority: 'County of Maui DPW',
      permit_application_date: '2026-07-01',
      permit_estimated_approval_date: '2026-08-01',
    });
  });
});
