import {
  flattenTokensToCssVars,
  getTokens,
  tokens,
  tokensDark,
  tokensLight,
} from '@/lib/design-tokens';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGBA = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;
const GRADIENT = /^linear-gradient\(/i;

function isCssColor(value: string): boolean {
  return HEX.test(value) || RGBA.test(value) || GRADIENT.test(value);
}

function shape(node: unknown): unknown {
  if (node === null || node === undefined) return typeof node;
  if (Array.isArray(node)) return node.map(shape);
  if (typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = shape(value);
    }
    return out;
  }
  return typeof node;
}

describe('design tokens — Phase 6.1 foundation', () => {
  it('exposes the top-level token categories defined in the spec', () => {
    expect(Object.keys(tokens).sort()).toEqual(
      ['color', 'icon', 'motion', 'radius', 'shadow', 'space', 'tap', 'typography'].sort(),
    );
  });

  it('default `tokens` export aliases light theme for back-compat', () => {
    expect(tokens).toBe(tokensLight);
  });

  it('tokensLight and tokensDark have identical structure (parallel shape)', () => {
    expect(shape(tokensLight)).toEqual(shape(tokensDark));
  });

  it('exposes the full color group from the spec', () => {
    const colorKeys = Object.keys(tokensLight.color).sort();
    expect(colorKeys).toEqual(
      ['accent', 'border', 'brand', 'gradient', 'ink', 'semantic', 'surface'].sort(),
    );
  });

  it('every color leaf is a valid CSS color value (or gradient)', () => {
    for (const theme of [tokensLight, tokensDark] as const) {
      const walk = (node: unknown, trail: string[]): void => {
        if (typeof node === 'string') {
          if (!isCssColor(node)) {
            throw new Error(`invalid CSS color at ${trail.join('.')}: ${node}`);
          }
          return;
        }
        if (typeof node === 'object' && node !== null) {
          for (const [k, v] of Object.entries(node)) walk(v, [...trail, k]);
        }
      };
      walk(theme.color, ['color']);
    }
  });

  it('no duplicate semantic names within a category (spec: tokens grouped by role)', () => {
    for (const theme of [tokensLight, tokensDark] as const) {
      for (const [group, leaves] of Object.entries(theme.color) as [
        string,
        Record<string, string>,
      ][]) {
        const names = Object.keys(leaves);
        const unique = new Set(names);
        if (unique.size !== names.length) {
          throw new Error(`duplicate token name in color.${group}`);
        }
      }
    }
  });

  it('spec-required color tokens are present in both themes', () => {
    const required = {
      surface: ['base', 'card', 'elevated', 'sunken', 'overlay'],
      ink: ['primary', 'secondary', 'tertiary', 'disabled'],
      brand: ['primary', 'primaryDeep', 'primaryGlow'],
      accent: ['action', 'actionDeep', 'actionGlow', 'data', 'dataBright', 'dataGlow'],
      semantic: ['warning', 'warningGlow', 'error', 'errorGlow', 'success', 'info'],
      border: ['subtle', 'strong', 'focus'],
      gradient: ['hero'],
    } as const;
    for (const theme of [tokensLight, tokensDark] as const) {
      for (const [group, keys] of Object.entries(required)) {
        for (const key of keys) {
          const value = (theme.color as Record<string, Record<string, string>>)[group][key];
          expect(typeof value).toBe('string');
          expect(value.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('typography weights are locked to 500 / 600 / 700 per spec', () => {
    expect(tokensLight.typography.weight).toEqual({
      body: 500,
      emphasis: 600,
      display: 700,
    });
  });

  it('typography size scale matches the 8-step spec ladder', () => {
    expect(tokensLight.typography.size).toEqual({
      eyebrow: '11px',
      caption: '12px',
      bodySm: '13px',
      body: '14px',
      title: '16px',
      heading: '20px',
      displaySm: '24px',
      display: '32px',
    });
  });

  it('spacing scale is the 8-step 4-px-multiple per spec', () => {
    expect(tokensLight.space).toEqual({
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      5: '20px',
      6: '24px',
      8: '32px',
      12: '48px',
    });
  });

  it('radii match the spec (xs..xl + pill)', () => {
    expect(tokensLight.radius).toEqual({
      xs: '4px',
      sm: '6px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      pill: '999px',
    });
  });

  it('motion durations and easings match the spec', () => {
    expect(tokensLight.motion.duration).toEqual({
      fast: '120ms',
      base: '180ms',
      slow: '280ms',
    });
    expect(tokensLight.motion.easing.out).toMatch(/cubic-bezier/);
    expect(tokensLight.motion.easing.inOut).toMatch(/cubic-bezier/);
  });

  it('FA hit-target tokens are present', () => {
    expect(tokensLight.tap).toEqual({
      min: '44px',
      base: '48px',
      cta: '56px',
      hero: '72px',
    });
  });

  it('icon scale includes a locked 1.75 stroke per spec', () => {
    expect(tokensLight.icon.stroke).toBe(1.75);
  });

  it('getTokens(mode) returns the matching theme set', () => {
    expect(getTokens('light')).toBe(tokensLight);
    expect(getTokens('dark')).toBe(tokensDark);
  });

  it('flattenTokensToCssVars emits --bos-* kebab-case variables derived from the token path', () => {
    const vars = flattenTokensToCssVars(tokensLight);
    expect(vars['--bos-color-surface-base']).toBe('#fbfbfa');
    expect(vars['--bos-color-ink-primary']).toBe('#0b1117');
    expect(vars['--bos-color-brand-primary']).toBe('#14b8a6');
    expect(vars['--bos-typography-size-body-sm']).toBe('13px');
    expect(vars['--bos-typography-weight-display']).toBe('700');
    expect(vars['--bos-radius-pill']).toBe('999px');
    expect(vars['--bos-motion-easing-in-out']).toMatch(/cubic-bezier/);
  });

  it('flattenTokensToCssVars produces parallel keys for light and dark themes', () => {
    const lightKeys = Object.keys(flattenTokensToCssVars(tokensLight)).sort();
    const darkKeys = Object.keys(flattenTokensToCssVars(tokensDark)).sort();
    expect(darkKeys).toEqual(lightKeys);
  });
});
