/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NavItem, NavSectionLabel } from '@/components/design-system/NavItem';

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

function getItem(): HTMLElement {
  const el = container.querySelector('[data-bos-nav-item]');
  if (!(el instanceof HTMLElement)) throw new Error('expected nav-item element');
  return el;
}

describe('<NavItem> & <NavSectionLabel> — Phase 6.2 primitive', () => {
  it('renders <NavSectionLabel> as a div with the section text', () => {
    render(<NavSectionLabel>Projects</NavSectionLabel>);
    const el = container.querySelector('[data-bos-nav-section]');
    expect(el).not.toBeNull();
    expect(el?.tagName).toBe('DIV');
    expect(el?.textContent).toBe('Projects');
  });

  it('renders as a <button> when no href is provided', () => {
    render(<NavItem icon={<svg aria-hidden="true" />} label="Kai" />);
    const item = getItem();
    expect(item.tagName).toBe('BUTTON');
    expect((item as HTMLButtonElement).type).toBe('button');
  });

  it('renders as an <a> (next/link) when href is provided', () => {
    render(
      <NavItem icon={<svg aria-hidden="true" />} label="Active engagements" href="/projects" />,
    );
    const item = getItem();
    expect(item.tagName).toBe('A');
    expect((item as HTMLAnchorElement).getAttribute('href')).toBe('/projects');
  });

  it('defaults active=false (no aria-current, data-active="false")', () => {
    render(<NavItem icon={<svg aria-hidden="true" />} label="Kai" />);
    const item = getItem();
    expect(item.getAttribute('data-active')).toBe('false');
    expect(item.getAttribute('aria-current')).toBeNull();
  });

  it('marks active items with data-active="true" and aria-current="page"', () => {
    render(<NavItem icon={<svg aria-hidden="true" />} label="Kai" active />);
    const item = getItem();
    expect(item.getAttribute('data-active')).toBe('true');
    expect(item.getAttribute('aria-current')).toBe('page');
  });

  it('renders the icon and label children inside the nav item', () => {
    render(
      <NavItem icon={<svg data-testid="nav-ico" aria-hidden="true" />} label="Dispatch board" />,
    );
    const item = getItem();
    expect(item.querySelector('[data-bos-nav-item-icon] [data-testid="nav-ico"]')).not.toBeNull();
    expect(item.textContent).toContain('Dispatch board');
  });

  it('fires onClick when the button variant is clicked', () => {
    const onClick = jest.fn();
    render(<NavItem icon={<svg aria-hidden="true" />} label="Kai" onClick={onClick} />);
    act(() => {
      getItem().click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
