/**
 * @jest-environment jsdom
 *
 * BAN-374 P6 — /admin/freight-calendar page tests.
 *
 *   - Renders table from the existing GET route (P4-shipped).
 *   - "Add Sailing" button only visible to roles with SCHEDULE_WRITE.
 *   - Add flow POSTs to /api/schedule/freight-calendar then refreshes.
 *   - Edit flow PATCHes /api/schedule/freight-calendar/[id].
 *   - Soft-delete flow DELETEs with confirmation.
 *   - Read-only mode (estimator role) hides write controls.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const sessionMock = jest.fn();
jest.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => sessionMock(),
}));

import FreightCalendarManager from '@/components/admin/FreightCalendarManager';

const ROW_1 = {
  freight_calendar_id: '00000000-0000-4000-8000-000000000f01',
  carrier: 'Matson',
  route: 'Long Beach → Honolulu',
  sailing_date: '2026-07-01',
  arrival_date: '2026-07-06',
  cutoff_date: '2026-06-29',
  notes: null,
};
const ROW_2 = {
  freight_calendar_id: '00000000-0000-4000-8000-000000000f02',
  carrier: 'Matson',
  route: 'Long Beach → Kahului',
  sailing_date: '2026-07-08',
  arrival_date: '2026-07-13',
  cutoff_date: '2026-07-06',
  notes: 'Container-only sailing',
};

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
  sessionMock.mockReset();
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

describe('<FreightCalendarManager> read path', () => {
  it('renders the table with rows from GET /api/schedule/freight-calendar', async () => {
    sessionMock.mockReturnValue({ data: { user: { role: 'pm' } } });
    fetchMock.mockImplementation(() => jsonResponse({ items: [ROW_1, ROW_2] }));
    await renderAndFlush(<FreightCalendarManager />);
    const rows = container.querySelectorAll('[data-testid="freight-row"]');
    expect(rows.length).toBe(2);
    expect(container.textContent).toContain('Long Beach → Honolulu');
    expect(container.textContent).toContain('Container-only sailing');
  });

  it('shows the empty state when GET returns no items', async () => {
    sessionMock.mockReturnValue({ data: { user: { role: 'pm' } } });
    fetchMock.mockImplementation(() => jsonResponse({ items: [] }));
    await renderAndFlush(<FreightCalendarManager />);
    expect(container.querySelector('[data-testid="freight-empty"]')).not.toBeNull();
  });

  it('surfaces the API error message when GET fails', async () => {
    sessionMock.mockReturnValue({ data: { user: { role: 'pm' } } });
    fetchMock.mockImplementation(() => jsonResponse({ error: 'boom' }, 500));
    await renderAndFlush(<FreightCalendarManager />);
    const err = container.querySelector('[data-testid="freight-error"]');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('boom');
  });
});

describe('<FreightCalendarManager> permission gating', () => {
  it('hides Add Sailing + Edit + Remove for roles outside SCHEDULE_WRITE', async () => {
    sessionMock.mockReturnValue({ data: { user: { role: 'estimator' } } });
    fetchMock.mockImplementation(() => jsonResponse({ items: [ROW_1] }));
    await renderAndFlush(<FreightCalendarManager />);
    expect(container.querySelector('[data-testid="freight-add-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="freight-edit-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="freight-delete-button"]')).toBeNull();
  });

  it('shows write controls for pm / business_admin / super_admin', async () => {
    for (const role of ['pm', 'business_admin', 'super_admin']) {
      sessionMock.mockReturnValue({ data: { user: { role } } });
      fetchMock.mockImplementation(() => jsonResponse({ items: [ROW_1] }));
      await renderAndFlush(<FreightCalendarManager />);
      expect(container.querySelector('[data-testid="freight-add-button"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="freight-edit-button"]')).not.toBeNull();
      await act(async () => root.unmount());
      container.remove();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
  });
});

describe('<FreightCalendarManager> write flows', () => {
  it('POSTs a new sailing then refreshes', async () => {
    sessionMock.mockReturnValue({ data: { user: { role: 'pm' } } });
    let calls = 0;
    fetchMock.mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'POST') {
        expect((url as string).startsWith('/api/schedule/freight-calendar')).toBe(true);
        const body = JSON.parse(init?.body as string);
        expect(body).toMatchObject({
          carrier: 'Matson',
          route: 'Long Beach → Hilo',
          sailing_date: '2026-08-01',
          arrival_date: '2026-08-06',
          cutoff_date: '2026-07-30',
        });
        return jsonResponse({ ok: true, entry: { freight_calendar_id: 'new-id' } }, 201);
      }
      return jsonResponse({ items: calls > 2 ? [ROW_1, ROW_2] : [ROW_1] });
    });

    await renderAndFlush(<FreightCalendarManager />);
    const addBtn = container.querySelector('[data-testid="freight-add-button"]') as HTMLButtonElement;
    await act(async () => addBtn.click());

    const carrier = container.querySelector('[data-testid="freight-form-carrier"]') as HTMLInputElement;
    const route = container.querySelector('[data-testid="freight-form-route"]') as HTMLInputElement;
    const sailing = container.querySelector('[data-testid="freight-form-sailing"]') as HTMLInputElement;
    const arrival = container.querySelector('[data-testid="freight-form-arrival"]') as HTMLInputElement;
    const cutoff = container.querySelector('[data-testid="freight-form-cutoff"]') as HTMLInputElement;

    function setInput(el: HTMLInputElement, value: string) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await act(async () => {
      setInput(carrier, 'Matson');
      setInput(route, 'Long Beach → Hilo');
      setInput(cutoff, '2026-07-30');
      setInput(sailing, '2026-08-01');
      setInput(arrival, '2026-08-06');
    });
    const submit = container.querySelector('[data-testid="freight-form-submit"]') as HTMLButtonElement;
    await act(async () => submit.click());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const postCalls = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'POST');
    expect(postCalls.length).toBe(1);
  });

  it('PATCHes when editing an existing sailing', async () => {
    sessionMock.mockReturnValue({ data: { user: { role: 'pm' } } });
    fetchMock.mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'PATCH') {
        expect((url as string)).toContain(`/api/schedule/freight-calendar/${ROW_1.freight_calendar_id}`);
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ items: [ROW_1] });
    });

    await renderAndFlush(<FreightCalendarManager />);
    const editBtn = container.querySelector('[data-testid="freight-edit-button"]') as HTMLButtonElement;
    await act(async () => editBtn.click());
    const submit = container.querySelector('[data-testid="freight-form-submit"]') as HTMLButtonElement;
    await act(async () => submit.click());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const patchCalls = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
    expect(patchCalls.length).toBe(1);
  });

  it('DELETEs after confirmation in the soft-delete modal', async () => {
    sessionMock.mockReturnValue({ data: { user: { role: 'pm' } } });
    fetchMock.mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'DELETE') {
        expect((url as string)).toContain(`/api/schedule/freight-calendar/${ROW_1.freight_calendar_id}`);
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ items: [ROW_1] });
    });

    await renderAndFlush(<FreightCalendarManager />);
    const delBtn = container.querySelector('[data-testid="freight-delete-button"]') as HTMLButtonElement;
    await act(async () => delBtn.click());
    expect(container.querySelector('[data-testid="freight-delete-modal"]')).not.toBeNull();
    const confirm = container.querySelector('[data-testid="freight-delete-confirm"]') as HTMLButtonElement;
    await act(async () => confirm.click());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const delCalls = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'DELETE');
    expect(delCalls.length).toBe(1);
  });
});
