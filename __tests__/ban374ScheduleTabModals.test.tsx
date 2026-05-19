/**
 * @jest-environment jsdom
 *
 * BAN-374 Scheduling Spine — Add Phase / Add Task modal flows.
 *
 * Verifies:
 *   - Clicking "Add Phase" opens the modal and submitting POSTs the
 *     phase payload to /api/schedule/phases.
 *   - Clicking "Add Task" inside a phase opens a task modal and submits
 *     a POST to /api/schedule/tasks with the right phase_id.
 *   - Inline-edit row exposes the dependency picker for the same project.
 *   - "Mark complete" checkbox PATCHes the task to status=complete.
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
const TASK_2 = '00000000-0000-4000-8000-000000000b02';
const ENG_ID = '00000000-0000-4000-8000-000000000099';

const PHASES = [
  { id: PHASE_A, engagement_id: ENG_ID, name: 'Mobilization', sort_order: 0, planned_start: null, planned_end: null, actual_start: null, actual_end: null, status: 'planned' },
];

const TASKS = [
  { id: TASK_1, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Stage trailer', description: null, sort_order: 0, planned_start: '2026-06-02', planned_end: '2026-06-03', planned_duration_days: 1, actual_start: null, actual_end: null, percent_complete: 0, status: 'planned', assigned_to_user_id: null },
  { id: TASK_2, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Site fencing', description: null, sort_order: 1, planned_start: '2026-06-04', planned_end: '2026-06-06', planned_duration_days: 2, actual_start: null, actual_end: null, percent_complete: 0, status: 'planned', assigned_to_user_id: null },
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

function setupListFetches() {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/schedule/phases?')) {
      return jsonResponse({ kIDFound: true, items: PHASES });
    }
    if (url.startsWith('/api/schedule/tasks?')) {
      return jsonResponse({ kIDFound: true, items: TASKS });
    }
    if (url.startsWith('/api/schedule/dependencies?')) {
      return jsonResponse({ kIDFound: true, items: [] });
    }
    if (url === '/api/schedule/phases' && init?.method === 'POST') {
      return jsonResponse({ ok: true, phase: { id: 'new-phase' } }, 201);
    }
    if (url === '/api/schedule/tasks' && init?.method === 'POST') {
      return jsonResponse({ ok: true, task: { id: 'new-task' } }, 201);
    }
    if (url.startsWith('/api/schedule/tasks/') && init?.method === 'PATCH') {
      return jsonResponse({ ok: true });
    }
    if (url.startsWith('/api/schedule/tasks/') && init?.method === 'DELETE') {
      return jsonResponse({ ok: true });
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
  await act(async () => { root.render(node); });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(el: Element | null) {
  if (!el) throw new Error('expected element to click');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function findPostCalls(urlPrefix: string): Array<{ url: string; body: unknown }> {
  const out: Array<{ url: string; body: unknown }> = [];
  for (const call of fetchMock.mock.calls) {
    const url = typeof call[0] === 'string' ? call[0] : (call[0] as URL).toString();
    const init = call[1] as RequestInit | undefined;
    if (init?.method === 'POST' && url.startsWith(urlPrefix)) {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      out.push({ url, body });
    }
  }
  return out;
}

function findPatchCalls(urlPrefix: string): Array<{ url: string; body: unknown }> {
  const out: Array<{ url: string; body: unknown }> = [];
  for (const call of fetchMock.mock.calls) {
    const url = typeof call[0] === 'string' ? call[0] : (call[0] as URL).toString();
    const init = call[1] as RequestInit | undefined;
    if (init?.method === 'PATCH' && url.startsWith(urlPrefix)) {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      out.push({ url, body });
    }
  }
  return out;
}

describe('Add Phase flow', () => {
  it('opens the modal when Add Phase is clicked', async () => {
    setupListFetches();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} />);

    expect(container.querySelector('[data-bos-schedule-modal]')).toBeNull();
    await click(container.querySelector('[data-bos-schedule-add-phase]'));
    expect(container.querySelector('[data-bos-schedule-modal]')).not.toBeNull();
  });

  it('submits a phase POST with the engagement_kid + name', async () => {
    setupListFetches();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} />);
    await click(container.querySelector('[data-bos-schedule-add-phase]'));

    const nameInput = container.querySelector('[data-bos-add-phase-name]') as HTMLInputElement;
    setInputValue(nameInput, 'Closeout');

    await click(container.querySelector('[data-bos-add-phase-submit]'));

    const posts = findPostCalls('/api/schedule/phases');
    expect(posts.length).toBeGreaterThan(0);
    const body = posts[0].body as Record<string, unknown>;
    expect(body.engagement_kid).toBe('PRJ-26-0001');
    expect(body.name).toBe('Closeout');
    expect(body.sort_order).toBe(1);
  });
});

describe('Add Task flow', () => {
  it('opens the task modal scoped to the right phase', async () => {
    setupListFetches();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} />);

    await click(container.querySelector('[data-bos-schedule-add-task]'));
    expect(container.querySelector('[data-bos-schedule-modal]')).not.toBeNull();
    expect(container.querySelector('[data-bos-add-task-name]')).not.toBeNull();
  });

  it('submits a task POST with phase_id + name', async () => {
    setupListFetches();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} />);
    await click(container.querySelector('[data-bos-schedule-add-task]'));

    const nameInput = container.querySelector('[data-bos-add-task-name]') as HTMLInputElement;
    setInputValue(nameInput, 'Pour footings');

    await click(container.querySelector('[data-bos-add-task-submit]'));

    const posts = findPostCalls('/api/schedule/tasks');
    expect(posts.length).toBeGreaterThan(0);
    const body = posts[0].body as Record<string, unknown>;
    expect(body.phase_id).toBe(PHASE_A);
    expect(body.name).toBe('Pour footings');
  });
});

describe('Inline edit + dependency picker', () => {
  it('clicking a task row opens the edit row with the dependency picker showing other tasks', async () => {
    setupListFetches();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} />);

    const row = container.querySelector(`[data-bos-schedule-task="${TASK_2}"]`);
    await click(row);

    expect(container.querySelector(`[data-bos-schedule-task-edit="${TASK_2}"]`)).not.toBeNull();
    const options = container.querySelectorAll('[data-bos-dependency-option]');
    // TASK_2 should see TASK_1 as a candidate predecessor but not itself.
    const optionIds = Array.from(options).map((o) => o.getAttribute('data-bos-dependency-option'));
    expect(optionIds).toContain(TASK_1);
    expect(optionIds).not.toContain(TASK_2);
  });

  it('saving the edit row POSTs a dependency when one is checked', async () => {
    setupListFetches();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} />);

    await click(container.querySelector(`[data-bos-schedule-task="${TASK_2}"]`));

    // Tick the TASK_1 predecessor option
    const option = container.querySelector(`[data-bos-dependency-option="${TASK_1}"] input[type="checkbox"]`) as HTMLInputElement;
    await act(async () => {
      option.click();
    });

    await click(container.querySelector('[data-bos-edit-task-save]'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const depPosts = findPostCalls('/api/schedule/dependencies');
    expect(depPosts.length).toBe(1);
    expect((depPosts[0].body as Record<string, string>).predecessor_task_id).toBe(TASK_1);
    expect((depPosts[0].body as Record<string, string>).successor_task_id).toBe(TASK_2);
  });
});

describe('Mark-complete checkbox', () => {
  it('PATCHes status=complete when ticked', async () => {
    setupListFetches();
    await renderAndFlush(<ScheduleTab kID="PRJ-26-0001" canWrite={true} />);

    const taskRow = container.querySelector(`[data-bos-schedule-task="${TASK_1}"]`);
    const checkbox = taskRow?.querySelector('[data-bos-task-complete-checkbox]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    await act(async () => {
      checkbox.click();
    });
    await act(async () => { await Promise.resolve(); });

    const patches = findPatchCalls(`/api/schedule/tasks/${TASK_1}`);
    expect(patches.length).toBeGreaterThan(0);
    expect((patches[0].body as Record<string, string>).status).toBe('complete');
  });
});
