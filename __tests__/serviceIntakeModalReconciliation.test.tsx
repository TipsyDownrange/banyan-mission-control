/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ServicePanel from '@/components/ServicePanel';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { email: 'sean@kulaglass.com', role: 'super_admin' } }, status: 'authenticated' }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const fetchMock = jest.fn();

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/api/service') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          workOrders: [],
          byStatus: {},
          stats: { active: 0, completed: 0, needsScheduling: 0, inProgress: 0 },
        }),
      });
    }

    if (url === '/api/crew') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          all: [{ user_id: 'pm-1', name: 'Joey', role: 'service_pm', island: 'Maui' }],
          pms: [{ user_id: 'pm-1', name: 'Joey', role: 'service_pm', island: 'Maui' }],
          crew: [],
        }),
      });
    }

    if (url === '/api/service/customers') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          customers: [{
            customerId: 'CUST-0001',
            company: 'Kula Glass',
            name: 'Kula Glass',
            contactPerson: 'Joey',
            phone: '8085550100',
            email: 'joey@example.com',
            address: '18 Waokele Pl, Lahaina, HI 96761',
            city: 'Lahaina',
            state: 'HI',
            zip: '96761',
            island: 'Maui',
            woCount: 3,
          }],
        }),
      });
    }

    if (url === '/api/step-templates') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, templates: { Storefront: {} } }),
      });
    }

    if (url === '/api/service/dispatch') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ woNumber: 'WO-26-0001' }),
      });
    }

    if (url.startsWith('/api/contacts?')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ contacts: [] }),
      });
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
  });
}

function getButton(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button'))
    .find(candidate => candidate.textContent === text);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`expected button with text ${text}`);
  }
  return button;
}

function getInputByPlaceholder(placeholder: string): HTMLInputElement | HTMLTextAreaElement {
  const input = Array.from(container.querySelectorAll('input, textarea'))
    .find(element => element.getAttribute('placeholder') === placeholder);
  if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) {
    throw new Error(`expected input with placeholder ${placeholder}`);
  }
  return input;
}

function changeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const valueSetter = element instanceof HTMLTextAreaElement
      ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('<ServicePanel> New Lead modal reconciliation guard', () => {
  it('opens the modal inside a no-translate dialog and survives an external DOM mutation before parent re-render', async () => {
    act(() => {
      root.render(<ServicePanel />);
    });
    await flushAsyncWork();

    act(() => getButton('+ New Lead').click());
    await flushAsyncWork();

    const dialog = container.querySelector('[role="dialog"]');
    if (!(dialog instanceof HTMLElement)) throw new Error('expected New Lead dialog');

    expect(dialog.getAttribute('translate')).toBe('no');
    expect(dialog.classList.contains('notranslate')).toBe(true);
    expect(container.textContent).toContain('Service — New Lead');

    const externalTextNode = dialog.firstChild;
    if (!(externalTextNode instanceof HTMLElement)) {
      throw new Error('expected dialog content host');
    }
    externalTextNode.textContent = 'mutated by external extension';

    expect(() => act(() => getButton('Refresh').click())).not.toThrow();
    await flushAsyncWork();

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('submits a selected customer through the service dispatch endpoint', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    act(() => {
      root.render(<ServicePanel />);
    });
    await flushAsyncWork();

    act(() => getButton('+ New Lead').click());
    await flushAsyncWork();

    changeValue(getInputByPlaceholder('Describe what needs to be done, where it is, and any constraints...'), 'Replace cracked storefront lite.');
    changeValue(getInputByPlaceholder('"Shell Oil Co", "Starwood Hotels", "John Smith"'), 'Kula Glass');
    await flushAsyncWork();

    const customerOption = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Kula Glass') && button.textContent?.includes('past WOs'));
    if (!(customerOption instanceof HTMLButtonElement)) {
      throw new Error('expected customer autocomplete option');
    }
    act(() => {
      customerOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await flushAsyncWork();

    act(() => getButton('Use legacy address as jobsite').click());
    await flushAsyncWork();

    const createButton = getButton('Create Work Order');
    expect(createButton.disabled).toBe(false);

    await act(async () => {
      createButton.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/service/dispatch', expect.objectContaining({ method: 'POST' }));
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringMatching(/removeChild|NotFoundError/));

    consoleErrorSpy.mockRestore();
  });
});
