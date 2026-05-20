/**
 * @jest-environment jsdom
 *
 * BAN-374 P6 — ScheduleTab.projectIsland auto-wire.
 *
 * The dispatch's scope C closes the "Hawaii overlay needs manual island prop"
 * drift from PR #212.  ProjectsPanel now passes normalizeProjectIsland(
 * project.island) to ScheduleTab, ScheduleTab makes the prop required, and
 * the prop flows through to ScheduleGanttView's travel-factor enrichment.
 *
 * This test asserts the end-to-end wiring: when ScheduleTab is mounted with
 * projectIsland="kauai", an outer-island task ('maui') gets the "+travel"
 * chevron through ScheduleGanttView's applyTravelFactorToTasks(), with no
 * manual prop fiddling between ScheduleTab and ScheduleGanttView.
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

import ScheduleTab from '@/components/schedule/ScheduleTab';

const PHASE_A = '00000000-0000-4000-8000-000000000a01';
const TASK_KAUAI = '00000000-0000-4000-8000-000000000b01';
const TASK_MAUI = '00000000-0000-4000-8000-000000000b02';
const ENG_ID = '00000000-0000-4000-8000-000000000099';

const PHASES = [
  { id: PHASE_A, engagement_id: ENG_ID, name: 'Construction', sort_order: 0, planned_start: '2026-06-01', planned_end: '2026-08-31', actual_start: null, actual_end: null, status: 'planned' },
];

const TASKS = [
  { id: TASK_KAUAI, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Kauai site prep', description: null, sort_order: 0, planned_start: '2026-06-02', planned_end: '2026-06-06', planned_duration_days: 5, actual_start: null, actual_end: null, percent_complete: 0, status: 'planned', assigned_to_user_id: null, task_island: 'kauai' },
  { id: TASK_MAUI, phase_id: PHASE_A, engagement_id: ENG_ID, name: 'Maui glass install', description: null, sort_order: 1, planned_start: '2026-06-10', planned_end: '2026-06-14', planned_duration_days: 5, actual_start: null, actual_end: null, percent_complete: 0, status: 'planned', assigned_to_user_id: null, task_island: 'maui' },
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
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
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
  ganttPropsLog.length = 0;
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
  const btn = container.querySelector('[data-bos-schedule-view="gantt"]') as HTMLButtonElement | null;
  if (!btn) throw new Error('Gantt view button not found');
  await act(async () => { btn.click(); });
  await act(async () => { await Promise.resolve(); });
}

describe('ScheduleTab projectIsland auto-wire (BAN-374 P6)', () => {
  it('applies the travel chevron to outer-island tasks when projectIsland=kauai (no manual prop fiddling)', async () => {
    await renderAndFlush(
      <ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="kauai" />,
    );
    await switchToGanttView();

    expect(ganttPropsLog.length).toBeGreaterThan(0);
    const passedTasks = ganttPropsLog[ganttPropsLog.length - 1].tasks as Array<Record<string, unknown>>;
    const mauiBar = passedTasks.find((t) => t.id === `task:${TASK_MAUI}`) as { name: string };
    const kauaiBar = passedTasks.find((t) => t.id === `task:${TASK_KAUAI}`) as { name: string };
    expect(mauiBar.name).toContain('+travel');
    expect(kauaiBar.name).not.toContain('+travel');
  });

  it('does NOT apply the travel chevron when projectIsland=unknown (legacy/default behavior preserved)', async () => {
    await renderAndFlush(
      <ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="unknown" />,
    );
    await switchToGanttView();

    expect(ganttPropsLog.length).toBeGreaterThan(0);
    const passedTasks = ganttPropsLog[ganttPropsLog.length - 1].tasks as Array<Record<string, unknown>>;
    const mauiBar = passedTasks.find((t) => t.id === `task:${TASK_MAUI}`) as { name: string };
    expect(mauiBar.name).not.toContain('+travel');
  });

  it('switches the freight-overlay default ON when projectIsland identifies a known Hawaii island', async () => {
    await renderAndFlush(
      <ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="maui" />,
    );
    await switchToGanttView();
    const freightToggle = container.querySelector(
      '[data-bos-overlay-toggle-input="freight"]',
    ) as HTMLInputElement | null;
    expect(freightToggle).not.toBeNull();
    expect(freightToggle?.checked).toBe(true);
  });

  it('keeps the freight-overlay default OFF when projectIsland=unknown', async () => {
    await renderAndFlush(
      <ScheduleTab kID="PRJ-26-0001" canWrite={true} projectIsland="unknown" />,
    );
    await switchToGanttView();
    const freightToggle = container.querySelector(
      '[data-bos-overlay-toggle-input="freight"]',
    ) as HTMLInputElement | null;
    expect(freightToggle).not.toBeNull();
    expect(freightToggle?.checked).toBe(false);
  });
});
