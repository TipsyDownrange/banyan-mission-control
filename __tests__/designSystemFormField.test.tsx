/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FormField } from '@/components/design-system/FormField';

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
  act(() => {
    root.render(node);
  });
}

function getInput(): HTMLInputElement {
  const el = container.querySelector('input[data-bos-field-input]');
  if (!(el instanceof HTMLInputElement)) throw new Error('expected input');
  return el;
}

function getLabel(): HTMLLabelElement {
  const el = container.querySelector('label[data-bos-field-label]');
  if (!(el instanceof HTMLLabelElement)) throw new Error('expected label');
  return el;
}

describe('<FormField> — Phase 6.2 primitive', () => {
  it('renders a <label> linked to the <input> via htmlFor / id', () => {
    render(<FormField id="client-name" label="Client name" />);
    const label = getLabel();
    const input = getInput();
    expect(label.htmlFor).toBe('client-name');
    expect(input.id).toBe('client-name');
    expect(label.textContent).toBe('Client name');
  });

  it('forwards value, placeholder, type, and other input props', () => {
    render(
      <FormField
        id="bid-value"
        label="Bid value"
        type="text"
        placeholder="$0"
        defaultValue="$487,200"
      />,
    );
    const input = getInput();
    expect(input.type).toBe('text');
    expect(input.placeholder).toBe('$0');
    expect(input.value).toBe('$487,200');
  });

  it('renders helpText when no errorText is present', () => {
    render(
      <FormField id="x" label="Label" helpText="Helpful note" />,
    );
    const help = container.querySelector('[data-bos-field-help]');
    expect(help).not.toBeNull();
    expect(help?.textContent).toBe('Helpful note');
    expect(help?.id).toBe('x-help');
    expect(getInput().getAttribute('aria-describedby')).toBe('x-help');
  });

  it('renders errorText (and sets data-error + aria-invalid) when errorText is present', () => {
    render(
      <FormField
        id="y"
        label="Label"
        helpText="ignored when error is set"
        errorText="Required"
      />,
    );
    const wrapper = container.querySelector('[data-bos-field]');
    expect(wrapper?.getAttribute('data-error')).toBe('true');
    const error = container.querySelector('[data-bos-field-error]');
    expect(error?.textContent).toBe('Required');
    expect(error?.id).toBe('y-error');
    const input = getInput();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('y-error');
    // helpText must not render when an error is shown
    expect(container.querySelector('[data-bos-field-help]')).toBeNull();
  });

  it('sets data-error="false" and no aria-invalid when no error is set', () => {
    render(<FormField id="z" label="Label" />);
    const wrapper = container.querySelector('[data-bos-field]');
    expect(wrapper?.getAttribute('data-error')).toBe('false');
    expect(getInput().getAttribute('aria-invalid')).toBeNull();
  });

  it('fires onChange when the user types', () => {
    const onChange = jest.fn();
    render(<FormField id="t" label="Label" onChange={onChange} />);
    const input = getInput();
    // React tracks the previous value to dedupe — bypass tracking by calling the
    // native value setter so React sees the new value on the input event.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    act(() => {
      nativeSetter?.call(input, 'hi');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalled();
  });
});
