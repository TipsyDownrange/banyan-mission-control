/**
 * @jest-environment jsdom
 *
 * BAN-376 Customer Pipeline — <InquiryInboxList> tests.
 *
 *   - Renders the heading + state chips.
 *   - Default filter requests only NEW + IN_DISCUSSION + QUOTED.
 *   - Clicking a state chip toggles the param.
 *   - Source filter triggers a refetch.
 *   - onSelect fires when a row is clicked.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import InquiryInboxList, { type InquiryRow, STATE_FILTERS } from '@/components/inquiries/InquiryInboxList';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode) {
  act(() => { root.render(node); });
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const ROW: InquiryRow = {
  inquiry_id: '00000000-0000-4000-8000-000000000111',
  inquiry_number: 'INQ-26-0001',
  source: 'PHONE',
  customer_name: 'Acme GC',
  inquiry_type_initial: 'PROJECT',
  estimated_value_band: 'UNKNOWN',
  assigned_to_user_id: null,
  assigned_role: 'PM',
  state: 'NEW',
  created_at: '2026-05-20T10:00:00Z',
};

describe('<InquiryInboxList>', () => {
  it('renders the heading and every state chip', async () => {
    const fetcher = jest.fn(async () => ({ items: [] }));
    render(<InquiryInboxList fetchInquiries={fetcher} />);
    await flush();
    expect(container.querySelector('h2')?.textContent).toMatch(/Customer Pipeline/);
    for (const s of STATE_FILTERS) {
      const chip = Array.from(container.querySelectorAll('button')).find(b => b.textContent === s);
      expect(chip).toBeDefined();
    }
  });

  it('default fetch request includes NEW + IN_DISCUSSION + QUOTED', async () => {
    const fetcher = jest.fn(async () => ({ items: [] }));
    render(<InquiryInboxList fetchInquiries={fetcher} />);
    await flush();
    expect(fetcher).toHaveBeenCalled();
    const params = fetcher.mock.calls[0][0] as URLSearchParams;
    const states = params.getAll('state').sort();
    expect(states).toEqual(['IN_DISCUSSION', 'NEW', 'QUOTED']);
  });

  it('renders rows returned by the fetcher', async () => {
    const fetcher = jest.fn(async () => ({ items: [ROW] }));
    render(<InquiryInboxList fetchInquiries={fetcher} />);
    await flush();
    expect(container.textContent).toContain('INQ-26-0001');
    expect(container.textContent).toContain('Acme GC');
  });

  it('shows empty-state message when no rows match', async () => {
    const fetcher = jest.fn(async () => ({ items: [] }));
    render(<InquiryInboxList fetchInquiries={fetcher} />);
    await flush();
    expect(container.textContent).toMatch(/No inquiries match/i);
  });

  it('clicking a state chip toggles it off the filter', async () => {
    const fetcher = jest.fn(async () => ({ items: [] }));
    render(<InquiryInboxList fetchInquiries={fetcher} />);
    await flush();
    const newChip = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'NEW');
    expect(newChip).toBeDefined();
    act(() => { (newChip as HTMLButtonElement).click(); });
    await flush();
    const lastCall = fetcher.mock.calls[fetcher.mock.calls.length - 1][0] as URLSearchParams;
    expect(lastCall.getAll('state').sort()).toEqual(['IN_DISCUSSION', 'QUOTED']);
  });

  it('calls onSelect when a row is clicked', async () => {
    const fetcher = jest.fn(async () => ({ items: [ROW] }));
    const onSelect = jest.fn();
    render(<InquiryInboxList fetchInquiries={fetcher} onSelect={onSelect} />);
    await flush();
    const row = container.querySelector('tbody tr');
    expect(row).not.toBeNull();
    act(() => { (row as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onSelect).toHaveBeenCalledWith(ROW);
  });
});
