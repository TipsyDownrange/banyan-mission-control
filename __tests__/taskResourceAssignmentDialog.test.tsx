/**
 * @jest-environment jsdom
 *
 * BAN-374 P5 — TaskResourceAssignmentDialog render + interaction tests.
 *
 *   - Initial render lists active assignments.
 *   - "+ Add resource" reveals the form; submitting POSTs and refreshes.
 *   - Remove button DELETEs + refreshes.
 *   - 409 ALLOCATION_CONFLICT response surfaces the conflict panel.
 *   - Acknowledging the conflict (+ note) re-submits with ack_conflict=true.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import TaskResourceAssignmentDialog, {
  type ResourceUserOption,
  type TaskResourceRow,
} from '@/components/schedule/TaskResourceAssignmentDialog';

const TASK_ID = '00000000-0000-4000-8000-000000000200';
const USER_A = '00000000-0000-4000-8000-000000000301';
const USER_B = '00000000-0000-4000-8000-000000000302';
const RES_A = '00000000-0000-4000-8000-000000000400';

const USERS: ResourceUserOption[] = [
  { user_id: USER_A, name: 'Anna Lead', email: 'anna@kulaglass.com', active: true },
  { user_id: USER_B, name: 'Ben Crew', email: 'ben@kulaglass.com', active: true },
];

let container: HTMLDivElement;
let root: Root;
const fetchMock = jest.fn();
const originalConfirm = globalThis.confirm;

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
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  (globalThis as unknown as { confirm: () => boolean }).confirm = () => true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  (globalThis as unknown as { confirm: typeof originalConfirm }).confirm = originalConfirm;
});

async function renderAndFlush(node: React.ReactNode) {
  await act(async () => { root.render(node); });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setControlledValue(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  const eventType = el instanceof HTMLSelectElement ? 'change' : 'input';
  el.dispatchEvent(new Event(eventType, { bubbles: true }));
}

function listResponse(rows: TaskResourceRow[]) {
  fetchMock.mockImplementationOnce(() => jsonResponse({ items: rows }));
}

it('renders active assignments on open', async () => {
  listResponse([
    {
      task_resource_id: RES_A,
      schedule_task_id: TASK_ID,
      user_id: USER_A,
      role_on_task: 'lead',
      allocation_percent: 80,
      assigned_at: '2026-05-01T00:00:00Z',
      assigned_by: USER_A,
      removed_at: null,
      removed_by: null,
      notes: null,
      user_name: 'Anna Lead',
      user_email: 'anna@kulaglass.com',
      user_active: true,
    },
  ]);

  await renderAndFlush(
    <TaskResourceAssignmentDialog
      taskId={TASK_ID}
      taskName="Frame walls"
      users={USERS}
      canWrite
      onClose={() => undefined}
    />,
  );

  const active = container.querySelector('[data-bos-resource-active]');
  expect(active?.textContent).toContain('Anna Lead');
  expect(active?.textContent).toContain('lead · 80%');
});

it('reveals the add form, posts an assignment, and reloads the list', async () => {
  listResponse([]);

  await renderAndFlush(
    <TaskResourceAssignmentDialog
      taskId={TASK_ID}
      taskName="Frame walls"
      users={USERS}
      canWrite
      onClose={() => undefined}
    />,
  );

  const trigger = container.querySelector('[data-bos-resource-add-trigger]') as HTMLButtonElement;
  expect(trigger).not.toBeNull();
  await act(async () => { trigger.click(); });

  const select = container.querySelector('[data-bos-resource-user-select]') as HTMLSelectElement;
  await act(async () => { setControlledValue(select, USER_B); });

  fetchMock.mockImplementationOnce(() => jsonResponse({ ok: true, resource: { task_resource_id: 'new' } }, 201));
  listResponse([]);

  const submit = container.querySelector('[data-bos-resource-add-submit]') as HTMLButtonElement;
  await act(async () => { submit.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });

  const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
  expect(postCall).toBeDefined();
  const body = JSON.parse((postCall![1] as RequestInit).body as string);
  expect(body.user_id).toBe(USER_B);
  expect(body.allocation_percent).toBe(100);
});

it('surfaces a 409 ALLOCATION_CONFLICT and resubmits with ack', async () => {
  listResponse([]);

  await renderAndFlush(
    <TaskResourceAssignmentDialog
      taskId={TASK_ID}
      taskName="Frame walls"
      users={USERS}
      canWrite
      onClose={() => undefined}
    />,
  );

  const trigger = container.querySelector('[data-bos-resource-add-trigger]') as HTMLButtonElement;
  await act(async () => { trigger.click(); });

  const select = container.querySelector('[data-bos-resource-user-select]') as HTMLSelectElement;
  await act(async () => { setControlledValue(select, USER_B); });

  const conflictReport = {
    conflicts: [
      {
        task_resource_id: 'r-x',
        schedule_task_id: 't-x',
        task_name: 'Other build',
        task_planned_start: '2026-06-05',
        task_planned_end: '2026-06-09',
        allocation_percent: 80,
        role_on_task: 'crew',
      },
    ],
    allocationSum: 180,
    hasDateOverlap: true,
    exceedsAllocation: true,
  };

  fetchMock.mockImplementationOnce(() =>
    jsonResponse({ error: 'overlapping assignments exceed 100% allocation', code: 'ALLOCATION_CONFLICT', report: conflictReport }, 409),
  );

  const submit = container.querySelector('[data-bos-resource-add-submit]') as HTMLButtonElement;
  await act(async () => { submit.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });

  const panel = container.querySelector('[data-bos-resource-conflict-panel]');
  expect(panel).not.toBeNull();
  expect(panel?.textContent).toContain('Other build');

  // Tick the ack box + add a note + resubmit
  const ack = container.querySelector('[data-bos-resource-ack-checkbox]') as HTMLInputElement;
  await act(async () => { ack.click(); });

  const notes = container.querySelector('[data-bos-resource-notes-input]') as HTMLTextAreaElement;
  await act(async () => { setControlledValue(notes, 'Acknowledge: split day'); });

  fetchMock.mockImplementationOnce(() => jsonResponse({ ok: true, resource: { task_resource_id: 'new' } }, 201));
  listResponse([]);

  const ackSubmit = container.querySelector('[data-bos-resource-acknowledge-submit]') as HTMLButtonElement;
  expect(ackSubmit).not.toBeNull();
  await act(async () => { ackSubmit.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });

  const ackPostCall = fetchMock.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
    .pop();
  expect(ackPostCall).toBeDefined();
  const ackBody = JSON.parse((ackPostCall![1] as RequestInit).body as string);
  expect(ackBody.ack_conflict).toBe(true);
  expect(ackBody.notes).toBe('Acknowledge: split day');
});

it('soft-removes an active assignment via DELETE', async () => {
  listResponse([
    {
      task_resource_id: RES_A,
      schedule_task_id: TASK_ID,
      user_id: USER_A,
      role_on_task: 'lead',
      allocation_percent: 100,
      assigned_at: '2026-05-01T00:00:00Z',
      assigned_by: USER_A,
      removed_at: null,
      removed_by: null,
      notes: null,
      user_name: 'Anna Lead',
      user_email: 'anna@kulaglass.com',
      user_active: true,
    },
  ]);

  await renderAndFlush(
    <TaskResourceAssignmentDialog
      taskId={TASK_ID}
      taskName="Frame walls"
      users={USERS}
      canWrite
      onClose={() => undefined}
    />,
  );

  fetchMock.mockImplementationOnce(() => jsonResponse({ ok: true }));
  listResponse([]);

  const removeBtn = container.querySelector(`[data-bos-resource-remove="${RES_A}"]`) as HTMLButtonElement;
  expect(removeBtn).not.toBeNull();
  await act(async () => { removeBtn.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });

  const deleteCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE');
  expect(deleteCall).toBeDefined();
});
