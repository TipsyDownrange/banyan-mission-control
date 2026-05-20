/**
 * @jest-environment jsdom
 *
 * BAN-376 Customer Pipeline — <InquiryDetailPanel> tests.
 *
 *   - Renders core dl with current state + customer + assigned info.
 *   - Hides action sections for terminal states (LOST, CONVERTED).
 *   - Transition action invokes onTransition with the selected target.
 *   - AWARDED target reveals the conversion_event picker.
 *   - Convert-to-project button stays disabled until engagement_id entered.
 *   - Convert-to-work-order button stays disabled until work_order_id entered.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import InquiryDetailPanel, { type InquiryDetail } from '@/components/inquiries/InquiryDetailPanel';

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

function setControl(label: string, value: string) {
  const el = container.querySelector(`[aria-label="${label}"]`);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) {
    throw new Error(`expected control "${label}"`);
  }
  act(() => {
    if (el instanceof HTMLSelectElement) {
      el.value = value;
    } else {
      const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
      setter?.call(el, value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function clickButton(text: string | RegExp) {
  const button = Array.from(container.querySelectorAll('button')).find(b => {
    const t = b.textContent || '';
    return typeof text === 'string' ? t === text : text.test(t);
  });
  if (!button) throw new Error(`button "${text}" not found`);
  act(() => { (button as HTMLButtonElement).click(); });
}

function baseInquiry(overrides: Partial<InquiryDetail> = {}): InquiryDetail {
  return {
    inquiry_id: '00000000-0000-4000-8000-000000000111',
    inquiry_number: 'INQ-26-0001',
    source: 'PHONE',
    source_detail: null,
    customer_name: 'Acme GC',
    contact_email: null,
    contact_phone: '808-555-1234',
    inquiry_type_initial: 'PROJECT',
    estimated_value_band: 'UNKNOWN',
    inquiry_description: 'Storefront retrofit',
    inquiry_location: null,
    assigned_to_user_id: null,
    assigned_role: 'PM',
    state: 'NEW',
    state_reason: null,
    conversion_event: null,
    converted_to_project_id: null,
    converted_to_work_order_id: null,
    notes: null,
    is_test_project: false,
    created_at: '2026-05-20T10:00:00Z',
    ...overrides,
  };
}

describe('<InquiryDetailPanel>', () => {
  it('renders inquiry header + state + customer', () => {
    render(<InquiryDetailPanel inquiry={baseInquiry()} />);
    expect(container.querySelector('h3')?.textContent).toBe('INQ-26-0001');
    expect(container.querySelector('[data-testid="state-value"]')?.textContent).toBe('NEW');
    expect(container.textContent).toContain('Acme GC');
  });

  it('hides action sections for terminal LOST', () => {
    render(<InquiryDetailPanel inquiry={baseInquiry({ state: 'LOST' })} />);
    expect(container.querySelector('[aria-label="Transition state"]')).toBeNull();
    expect(container.querySelector('[aria-label="Assign"]')).toBeNull();
    expect(container.querySelector('[aria-label="Promote"]')).toBeNull();
  });

  it('hides action sections for terminal CONVERTED', () => {
    render(<InquiryDetailPanel inquiry={baseInquiry({ state: 'CONVERTED' })} />);
    expect(container.querySelector('[aria-label="Transition state"]')).toBeNull();
  });

  it('invokes onTransition with the chosen target state', async () => {
    const onTransition = jest.fn(async () => undefined);
    render(<InquiryDetailPanel inquiry={baseInquiry()} actions={{ onTransition }} />);
    setControl('Target state', 'IN_DISCUSSION');
    setControl('Reason', 'first call');
    clickButton('Transition');
    await act(async () => { await Promise.resolve(); });
    expect(onTransition).toHaveBeenCalledWith('IN_DISCUSSION', expect.objectContaining({ reason: 'first call' }));
  });

  it('reveals conversion_event picker when target=AWARDED', async () => {
    const onTransition = jest.fn(async () => undefined);
    render(<InquiryDetailPanel inquiry={baseInquiry({ state: 'QUOTED' })} actions={{ onTransition }} />);
    setControl('Target state', 'AWARDED');
    const picker = container.querySelector('[aria-label="Conversion event"]');
    expect(picker).not.toBeNull();
    clickButton('Transition');
    await act(async () => { await Promise.resolve(); });
    expect(onTransition).toHaveBeenCalledWith('AWARDED', expect.objectContaining({ conversion_event: expect.any(String) }));
  });

  it('Convert to Project button stays disabled when engagement_id empty', () => {
    render(<InquiryDetailPanel inquiry={baseInquiry()} />);
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Convert to Project');
    expect(btn).toBeDefined();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('Convert to Work Order button stays disabled when work_order_id empty', () => {
    render(<InquiryDetailPanel inquiry={baseInquiry()} />);
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Convert to Work Order');
    expect(btn).toBeDefined();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('invokes onConvertToWorkOrder when the SRV id is supplied', async () => {
    const onConvertToWorkOrder = jest.fn(async () => undefined);
    render(<InquiryDetailPanel inquiry={baseInquiry()} actions={{ onConvertToWorkOrder }} />);
    setControl('Work order id', 'SRV-26-0042');
    clickButton('Convert to Work Order');
    await act(async () => { await Promise.resolve(); });
    expect(onConvertToWorkOrder).toHaveBeenCalledWith('SRV-26-0042', undefined);
  });
});
