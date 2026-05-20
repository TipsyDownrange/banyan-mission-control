/**
 * @jest-environment jsdom
 *
 * BAN-376 Customer Pipeline — <InquiryQuickCaptureForm> tests.
 *
 * Exercises:
 *   - All source radio values render and select.
 *   - Validation: customer_name required, contact_email OR contact_phone.
 *   - Suggested routing per spec §8.2 — RFP → GM, WALK_IN<25K → SERVICE_PM.
 *   - onSubmit handler receives the assembled payload.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import InquiryQuickCaptureForm, { INQUIRY_SOURCES_UI } from '@/components/inquiries/InquiryQuickCaptureForm';

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

function getInput(label: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const el = container.querySelector(`[aria-label="${label}"]`);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    throw new Error(`expected control with aria-label="${label}"`);
  }
  return el;
}

function setValue(label: string, value: string) {
  const el = getInput(label);
  act(() => {
    if (el instanceof HTMLSelectElement) {
      el.value = value;
    } else {
      // React 19's controlled-input deduplication needs the native value
      // setter rather than direct assignment.
      const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
      setter?.call(el, value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function clickRadio(value: string) {
  const radio = container.querySelector(`input[type="radio"][value="${value}"]`);
  if (!(radio instanceof HTMLInputElement)) throw new Error(`no radio for ${value}`);
  act(() => { radio.click(); });
}

function submit() {
  const form = container.querySelector('form');
  if (!(form instanceof HTMLFormElement)) throw new Error('no form');
  act(() => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

describe('<InquiryQuickCaptureForm>', () => {
  it('renders every source radio defined for the UI', () => {
    render(<InquiryQuickCaptureForm />);
    for (const s of INQUIRY_SOURCES_UI) {
      const radio = container.querySelector(`input[type="radio"][value="${s}"]`);
      expect(radio).not.toBeNull();
    }
  });

  it('shows a validation error when customer_name is missing', async () => {
    const onSubmit = jest.fn();
    render(<InquiryQuickCaptureForm onSubmit={onSubmit} />);
    setValue('Contact phone', '808-555-1234');
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent || '').toMatch(/customer name/i);
  });

  it('shows a validation error when neither email nor phone is supplied', () => {
    const onSubmit = jest.fn();
    render(<InquiryQuickCaptureForm onSubmit={onSubmit} />);
    setValue('Customer name', 'Acme GC');
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent || '').toMatch(/email or phone/i);
  });

  it('suggests GM for source=RFP', () => {
    render(<InquiryQuickCaptureForm />);
    clickRadio('RFP');
    const hint = container.querySelector('[data-testid="routing-suggestion"]');
    expect(hint?.textContent || '').toContain('GM');
  });

  it('suggests SERVICE_PM for source=WALK_IN with value<25K', () => {
    render(<InquiryQuickCaptureForm defaultSource="WALK_IN" />);
    setValue('Estimated value band', 'UNDER_5K');
    const hint = container.querySelector('[data-testid="routing-suggestion"]');
    expect(hint?.textContent || '').toContain('SERVICE_PM');
  });

  it('submits a well-formed payload on the happy path', async () => {
    const onSubmit = jest.fn(async () => undefined);
    render(<InquiryQuickCaptureForm onSubmit={onSubmit} defaultSource="EMAIL" />);
    setValue('Customer name', 'Hawaiʻi GC');
    setValue('Contact email', 'gc@hi.example');
    setValue('Description', 'Storefront retrofit');
    setValue('Inquiry type', 'PROJECT');
    submit();
    // wait a microtask for the submit promise chain
    await act(async () => { await Promise.resolve(); });
    expect(onSubmit).toHaveBeenCalled();
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({
      source: 'EMAIL',
      customer_name: 'Hawaiʻi GC',
      contact_email: 'gc@hi.example',
      inquiry_description: 'Storefront retrofit',
      inquiry_type_initial: 'PROJECT',
    }));
  });
});
