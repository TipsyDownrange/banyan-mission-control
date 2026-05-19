/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EmptyState } from '@/components/design-system/EmptyState';

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

describe('<EmptyState> — Phase 6.2 primitive', () => {
  it('renders the icon, heading, and body in the expected slots', () => {
    render(
      <EmptyState
        icon={<svg data-testid="empty-ico" aria-hidden="true" />}
        heading="No work orders yet"
        body="When a customer reports an issue, it shows up here."
      />,
    );
    const root = container.querySelector('[data-bos-empty]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('role')).toBe('status');
    expect(container.querySelector('[data-bos-empty-icon] [data-testid="empty-ico"]')).not.toBeNull();
    expect(container.querySelector('[data-bos-empty-heading]')?.textContent).toBe(
      'No work orders yet',
    );
    expect(container.querySelector('[data-bos-empty-body]')?.textContent).toBe(
      'When a customer reports an issue, it shows up here.',
    );
  });

  it('omits the body element when no body prop is provided', () => {
    render(<EmptyState icon={<svg aria-hidden="true" />} heading="Heading" />);
    expect(container.querySelector('[data-bos-empty-body]')).toBeNull();
  });

  it('renders a <Button> only when an action prop is provided', () => {
    render(<EmptyState icon={<svg aria-hidden="true" />} heading="H" />);
    expect(container.querySelector('[data-bos-button]')).toBeNull();
  });

  it('wires the action prop into the rendered <Button>', () => {
    const onClick = jest.fn();
    render(
      <EmptyState
        icon={<svg aria-hidden="true" />}
        heading="Heading"
        action={{ label: 'New work order', onClick, variant: 'action' }}
      />,
    );
    const btn = container.querySelector('[data-bos-button]');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('data-variant')).toBe('action');
    expect(btn?.textContent).toContain('New work order');
    act(() => {
      (btn as HTMLButtonElement).click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults the action button to variant="primary" when no variant is supplied', () => {
    render(
      <EmptyState
        icon={<svg aria-hidden="true" />}
        heading="Heading"
        action={{ label: 'Do it', onClick: () => undefined }}
      />,
    );
    expect(container.querySelector('[data-bos-button]')?.getAttribute('data-variant')).toBe(
      'primary',
    );
  });
});
