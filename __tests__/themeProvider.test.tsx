/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThemeProvider, useTheme } from '@/lib/theme/ThemeProvider';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

type Probe = {
  current: ReturnType<typeof useTheme> | null;
};

function Reader({ probe }: { probe: Probe }) {
  probe.current = useTheme();
  return null;
}

function render(node: React.ReactNode) {
  act(() => {
    root.render(node);
  });
}

describe('ThemeProvider — Phase 6.1 foundation', () => {
  it('useTheme throws a clear error when used outside the provider', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const probe: Probe = { current: null };
    expect(() => render(<Reader probe={probe} />)).toThrow(/useTheme must be used inside/);
    errSpy.mockRestore();
  });

  it('defaults to light mode when nothing is stored', () => {
    const probe: Probe = { current: null };
    render(
      <ThemeProvider>
        <Reader probe={probe} />
      </ThemeProvider>,
    );
    expect(probe.current?.mode).toBe('light');
    expect(probe.current?.tokens.color.surface.base).toBe('#fbfbfa');
  });

  it('setMode("dark") updates the context value and tokens', () => {
    const probe: Probe = { current: null };
    render(
      <ThemeProvider>
        <Reader probe={probe} />
      </ThemeProvider>,
    );
    expect(probe.current?.mode).toBe('light');
    act(() => probe.current!.setMode('dark'));
    expect(probe.current?.mode).toBe('dark');
    expect(probe.current?.tokens.color.surface.base).toBe('#0a1924');
  });

  it('toggle flips between light and dark', () => {
    const probe: Probe = { current: null };
    render(
      <ThemeProvider>
        <Reader probe={probe} />
      </ThemeProvider>,
    );
    expect(probe.current?.mode).toBe('light');
    act(() => probe.current!.toggle());
    expect(probe.current?.mode).toBe('dark');
    act(() => probe.current!.toggle());
    expect(probe.current?.mode).toBe('light');
  });

  it('round-trips the chosen mode through localStorage', () => {
    const probe: Probe = { current: null };
    render(
      <ThemeProvider>
        <Reader probe={probe} />
      </ThemeProvider>,
    );
    act(() => probe.current!.setMode('dark'));
    expect(window.localStorage.getItem('banyanos.theme')).toBe('dark');

    // re-mount: a fresh provider should pick up the stored preference
    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const probe2: Probe = { current: null };
    render(
      <ThemeProvider>
        <Reader probe={probe2} />
      </ThemeProvider>,
    );
    expect(probe2.current?.mode).toBe('dark');
  });

  it('emits CSS variables on documentElement.style on mount and on mode change', () => {
    const probe: Probe = { current: null };
    render(
      <ThemeProvider>
        <Reader probe={probe} />
      </ThemeProvider>,
    );
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bos-color-surface-base')).toBe('#fbfbfa');
    expect(root.getAttribute('data-theme')).toBe('light');

    act(() => probe.current!.setMode('dark'));
    expect(root.style.getPropertyValue('--bos-color-surface-base')).toBe('#0a1924');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });
});
