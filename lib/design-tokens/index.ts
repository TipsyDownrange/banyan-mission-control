/**
 * BanyanOS Design System v1 — Token catalog
 *
 * Source of truth: BanyanOS/02_SPECS_BY_TRUNK/design/v1/BanyanOS_Design_System_v1_Tokens_2026-05-17.html
 * Phase 6.1 (foundation only — no component migration).
 *
 * Two parallel token sets (light + dark) with identical shape. `tokens` defaults
 * to light for back-compat during Phase 6.1, when no components consume tokens yet
 * and the rest of the UI still renders against legacy globals.css.
 */

const fontSans = "'Inter', system-ui, -apple-system, sans-serif";
const fontMono = "'JetBrains Mono', ui-monospace, Menlo, monospace";

const brandPrimary = '#14b8a6';
const brandPrimaryDeep = '#0f766e';
const brandPrimaryGlow = 'rgba(20,184,166,0.18)';

const accentAction = '#f97316';
const accentActionDeep = '#c2410c';
const accentActionGlow = 'rgba(249,115,22,0.18)';

const accentData = '#0369a1';
const accentDataGlow = 'rgba(3,105,161,0.18)';

const semanticWarning = '#f59e0b';
const semanticWarningGlow = 'rgba(245,158,11,0.15)';
const semanticError = '#ef4444';
const semanticErrorGlow = 'rgba(239,68,68,0.15)';

const gradientHero = `linear-gradient(90deg, ${brandPrimary} 0%, ${accentData} 50%, ${accentAction} 100%)`;

const typography = {
  font: {
    sans: fontSans,
    mono: fontMono,
  },
  weight: {
    body: 500,
    emphasis: 600,
    display: 700,
  },
  size: {
    eyebrow: '11px',
    caption: '12px',
    bodySm: '13px',
    body: '14px',
    title: '16px',
    heading: '20px',
    displaySm: '24px',
    display: '32px',
  },
  lineHeight: {
    tight: 1.15,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
  },
} as const;

const space = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  12: '48px',
} as const;

const radius = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  pill: '999px',
} as const;

const motion = {
  duration: {
    fast: '120ms',
    base: '180ms',
    slow: '280ms',
  },
  easing: {
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

const tap = {
  min: '44px',
  base: '48px',
  cta: '56px',
  hero: '72px',
} as const;

const icon = {
  xs: '11px',
  sm: '14px',
  md: '18px',
  base: '20px',
  lg: '24px',
  xl: '32px',
  hero: '48px',
  stroke: 1.75,
} as const;

type ColorScheme = {
  surface: { base: string; card: string; elevated: string; sunken: string; overlay: string };
  ink: { primary: string; secondary: string; tertiary: string; disabled: string };
  brand: { primary: string; primaryDeep: string; primaryGlow: string };
  accent: {
    action: string;
    actionDeep: string;
    actionGlow: string;
    data: string;
    dataBright: string;
    dataGlow: string;
  };
  semantic: {
    warning: string;
    warningGlow: string;
    error: string;
    errorGlow: string;
    success: string;
    info: string;
  };
  border: { subtle: string; strong: string; focus: string };
  gradient: { hero: string };
};

type ShadowScheme = { sm: string; card: string; popover: string; modal: string; none: string };

export type Tokens = {
  color: ColorScheme;
  typography: typeof typography;
  space: typeof space;
  radius: typeof radius;
  shadow: ShadowScheme;
  motion: typeof motion;
  tap: typeof tap;
  icon: typeof icon;
};

export const tokensDark: Tokens = {
  color: {
    surface: {
      base: '#0a1924',
      card: '#0f2235',
      elevated: '#142b41',
      sunken: '#050f17',
      overlay: 'rgba(5,15,23,0.72)',
    },
    ink: {
      primary: '#f4f6f9',
      secondary: '#cfd8e3',
      tertiary: '#94a3b8',
      disabled: '#64748b',
    },
    brand: {
      primary: brandPrimary,
      primaryDeep: brandPrimaryDeep,
      primaryGlow: brandPrimaryGlow,
    },
    accent: {
      action: accentAction,
      actionDeep: accentActionDeep,
      actionGlow: accentActionGlow,
      data: accentData,
      dataBright: '#60a5fa',
      dataGlow: accentDataGlow,
    },
    semantic: {
      warning: semanticWarning,
      warningGlow: semanticWarningGlow,
      error: semanticError,
      errorGlow: semanticErrorGlow,
      success: brandPrimary,
      info: accentData,
    },
    border: {
      subtle: '#1c3a55',
      strong: '#234668',
      focus: brandPrimary,
    },
    gradient: {
      hero: gradientHero,
    },
  },
  typography,
  space,
  radius,
  shadow: {
    sm: '0 1px 1px rgba(0,0,0,0.3)',
    card: '0 1px 2px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
    popover: '0 4px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
    modal: '0 12px 32px rgba(0,0,0,0.5), 0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
    none: 'none',
  },
  motion,
  tap,
  icon,
} as const;

export const tokensLight: Tokens = {
  color: {
    surface: {
      base: '#fbfbfa',
      card: '#ffffff',
      elevated: '#f4f5f3',
      sunken: '#0f2235',
      overlay: 'rgba(15,34,53,0.6)',
    },
    ink: {
      primary: '#0b1117',
      secondary: '#2b343d',
      tertiary: '#475569',
      disabled: '#94a3b8',
    },
    brand: {
      primary: brandPrimary,
      primaryDeep: brandPrimaryDeep,
      primaryGlow: brandPrimaryGlow,
    },
    accent: {
      action: accentAction,
      actionDeep: accentActionDeep,
      actionGlow: accentActionGlow,
      data: accentData,
      dataBright: '#1d4ed8',
      dataGlow: accentDataGlow,
    },
    semantic: {
      warning: semanticWarning,
      warningGlow: semanticWarningGlow,
      error: semanticError,
      errorGlow: semanticErrorGlow,
      success: brandPrimary,
      info: accentData,
    },
    border: {
      subtle: '#e6e8e3',
      strong: '#d8dcd6',
      focus: brandPrimary,
    },
    gradient: {
      hero: gradientHero,
    },
  },
  typography,
  space,
  radius,
  shadow: {
    sm: '0 1px 1px rgba(15,23,42,0.06)',
    card: '0 1px 2px rgba(15,23,42,0.04)',
    popover: '0 4px 12px rgba(15,23,42,0.08)',
    modal: '0 12px 32px rgba(15,23,42,0.12)',
    none: 'none',
  },
  motion,
  tap,
  icon,
} as const;

export const tokens = tokensLight;

export type ThemeMode = 'light' | 'dark';

export function getTokens(mode: ThemeMode): Tokens {
  return mode === 'dark' ? tokensDark : tokensLight;
}

/**
 * Flatten a token tree into CSS custom-property pairs.
 *
 * Variable naming per Phase 6.1 dispatch: `--bos-<path>` in kebab-case,
 * derived from the token path. Example:
 *   color.surface.base       -> --bos-color-surface-base
 *   typography.size.bodySm   -> --bos-typography-size-body-sm
 */
export function flattenTokensToCssVars(
  source: Tokens,
  prefix = '--bos',
): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: unknown, path: string[]): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string' || typeof node === 'number') {
      out[toCssVarName(prefix, path)] = String(node);
      return;
    }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(value, [...path, key]);
      }
    }
  };
  walk(source, []);
  return out;
}

function toCssVarName(prefix: string, path: string[]): string {
  return [prefix, ...path.map(kebab)].join('-');
}

function kebab(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}
