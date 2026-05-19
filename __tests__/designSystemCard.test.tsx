/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Card } from '@/components/design-system/Card';

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

function getCard(): HTMLElement {
  const el = container.querySelector('[data-bos-card]');
  if (!(el instanceof HTMLElement)) throw new Error('expected card element');
  return el;
}

describe('<Card> — Phase 6.2 primitive', () => {
  it('renders children inside a <div>', () => {
    render(
      <Card>
        <p>hello</p>
      </Card>,
    );
    const card = getCard();
    expect(card.tagName).toBe('DIV');
    expect(card.textContent).toContain('hello');
  });

  it('defaults to variant="standard"', () => {
    render(<Card>x</Card>);
    expect(getCard().getAttribute('data-variant')).toBe('standard');
  });

  it('applies data-variant="hero" when variant="hero"', () => {
    render(<Card variant="hero">x</Card>);
    expect(getCard().getAttribute('data-variant')).toBe('hero');
  });

  it('forwards arbitrary HTML attributes (id, className) to the root div', () => {
    render(
      <Card id="card-1" className="custom-class">
        x
      </Card>,
    );
    const card = getCard();
    expect(card.id).toBe('card-1');
    expect(card.className).toContain('custom-class');
  });

  it('declares the hero ::before gradient strip in its scoped stylesheet', () => {
    render(<Card variant="hero">x</Card>);
    // React 19 hoists <style precedence> to <head> and rewrites href → data-href.
    const styleEl = document.querySelector('style[data-href="bos-card"]');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent ?? '').toContain(
      '[data-bos-card][data-variant="hero"]::before',
    );
    expect(styleEl?.textContent ?? '').toContain('var(--bos-color-gradient-hero)');
  });
});
