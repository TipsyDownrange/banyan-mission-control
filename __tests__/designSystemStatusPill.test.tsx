/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StatusPill } from '@/components/design-system/StatusPill';

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

function getPill(): HTMLElement {
  const el = container.querySelector('[data-bos-pill]');
  if (!(el instanceof HTMLElement)) throw new Error('expected pill element');
  return el;
}

describe('<StatusPill> — Phase 6.2 primitive', () => {
  it.each(['warn', 'error', 'success', 'info'] as const)(
    'applies data-variant="%s" for variant=%s and contains the label text',
    (variant) => {
      render(<StatusPill variant={variant}>Hello</StatusPill>);
      const pill = getPill();
      expect(pill.getAttribute('data-variant')).toBe(variant);
      expect(pill.textContent).toContain('Hello');
    },
  );

  it('renders a default lucide icon when none is provided', () => {
    render(<StatusPill variant="warn">RFI overdue</StatusPill>);
    const iconHost = getPill().querySelector('[data-bos-pill-icon]');
    expect(iconHost).not.toBeNull();
    expect(iconHost?.querySelector('svg')).not.toBeNull();
  });

  it('renders a different default icon per variant', () => {
    render(
      <>
        <StatusPill variant="warn">w</StatusPill>
        <StatusPill variant="success">s</StatusPill>
      </>,
    );
    const pills = container.querySelectorAll('[data-bos-pill]');
    const warnSvg = pills[0]?.querySelector('svg');
    const successSvg = pills[1]?.querySelector('svg');
    expect(warnSvg).not.toBeNull();
    expect(successSvg).not.toBeNull();
    // Different lucide icons render with different inner paths
    expect(warnSvg?.innerHTML).not.toEqual(successSvg?.innerHTML);
  });

  it('uses the override icon when one is provided via the icon prop', () => {
    render(
      <StatusPill variant="info" icon={<svg data-testid="custom" />}>
        Maui
      </StatusPill>,
    );
    const iconHost = getPill().querySelector('[data-bos-pill-icon]');
    expect(iconHost?.querySelector('[data-testid="custom"]')).not.toBeNull();
  });
});
