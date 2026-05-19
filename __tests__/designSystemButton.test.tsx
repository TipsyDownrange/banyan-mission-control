/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Button } from '@/components/design-system/Button';

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

function getButton(): HTMLButtonElement {
  const btn = container.querySelector('[data-bos-button]');
  if (!(btn instanceof HTMLButtonElement)) {
    throw new Error('expected a <button> with data-bos-button');
  }
  return btn;
}

describe('<Button> — Phase 6.2 primitive', () => {
  it('renders as a native <button> element (not a <div>)', () => {
    render(<Button>Save</Button>);
    const btn = getButton();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.textContent).toContain('Save');
  });

  it('defaults to type="button" to avoid implicit form submission', () => {
    render(<Button>Save</Button>);
    expect(getButton().type).toBe('button');
  });

  it('defaults variant to "primary" when none is provided', () => {
    render(<Button>Save</Button>);
    expect(getButton().getAttribute('data-variant')).toBe('primary');
  });

  it.each(['primary', 'action', 'secondary', 'destructive'] as const)(
    'applies data-variant="%s" for variant=%s',
    (variant) => {
      render(<Button variant={variant}>Click</Button>);
      expect(getButton().getAttribute('data-variant')).toBe(variant);
    },
  );

  it('forwards arbitrary HTML attributes (id, aria-label) to the button element', () => {
    render(
      <Button id="save-btn" aria-label="Save changes">
        Save
      </Button>,
    );
    const btn = getButton();
    expect(btn.id).toBe('save-btn');
    expect(btn.getAttribute('aria-label')).toBe('Save changes');
  });

  it('fires onClick when clicked', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Save</Button>);
    act(() => {
      getButton().click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the provided icon node before the label', () => {
    render(
      <Button icon={<svg data-testid="ico" aria-hidden="true" />}>Save</Button>,
    );
    const btn = getButton();
    const iconHost = btn.querySelector('[data-bos-button-icon]');
    expect(iconHost).not.toBeNull();
    expect(iconHost?.querySelector('[data-testid="ico"]')).not.toBeNull();
  });

  it('honors the disabled attribute', () => {
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    const btn = getButton();
    expect(btn.disabled).toBe(true);
    act(() => {
      btn.click();
    });
    expect(onClick).not.toHaveBeenCalled();
  });
});
