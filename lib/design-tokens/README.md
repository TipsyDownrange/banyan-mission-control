# Design Tokens — BanyanOS Design System v1

Phase 6.1 ships the foundation: the canonical token catalog and a theme provider
that emits CSS variables at runtime. **No components are migrated in this phase.**

## Canonical spec

Drive path:
`BanyanOS/02_SPECS_BY_TRUNK/design/v1/BanyanOS_Design_System_v1_Tokens_2026-05-17.html`

The spec is the single source of truth for every value in `index.ts`. If a token
needs to change, the spec moves first and this file follows. Do not improvise
tokens. Do not drop tokens defined in the spec.

## What this folder owns

- `index.ts` — `tokensLight`, `tokensDark`, default `tokens` (= light, for
  back-compat during the migration), `getTokens(mode)`, and the
  `flattenTokensToCssVars()` helper used by the ThemeProvider.
- Type exports: `Tokens`, `ThemeMode`.

The provider lives one folder up at `lib/theme/ThemeProvider.tsx`.

## Consuming tokens in components (Phase 6.2 path)

Phase 6.2 onward, components read tokens via the provider:

```tsx
'use client';
import { useTheme } from '@/lib/theme/ThemeProvider';

export function StatusPill({ tone }: { tone: 'success' | 'warning' }) {
  const { tokens } = useTheme();
  const bg = tone === 'success'
    ? tokens.color.brand.primaryGlow
    : tokens.color.semantic.warningGlow;
  return <span style={{ background: bg, color: tokens.color.ink.primary }}>{tone}</span>;
}
```

For purely CSS contexts (Tailwind utilities, plain CSS), the same values are
emitted as kebab-case custom properties on `:root`:

```
--bos-color-surface-base
--bos-color-ink-primary
--bos-color-brand-primary
--bos-typography-size-body-sm
--bos-radius-md
--bos-motion-duration-base
```

These are written to `documentElement.style` on mount and on every mode change
by the ThemeProvider, alongside a `data-theme="light|dark"` attribute on
`<html>`.

## Migration guide (stub — full sweep is Phases 6.2 + 6.3)

Phase 6.2 and 6.3 migrate inline hex literals to tokens. Examples of the
mapping for reviewers to recognize the pattern:

| Inline literal              | Token path                          |
| --------------------------- | ----------------------------------- |
| `#0f766e`                   | `tokens.color.brand.primaryDeep`    |
| `#14b8a6`                   | `tokens.color.brand.primary`        |
| `#0f172a`                   | `tokens.color.surface.sunken` (light theme value) |
| `#94a3b8`                   | `tokens.color.ink.tertiary` (dark theme value) |
| `#f97316`                   | `tokens.color.accent.action`        |
| `#ef4444`                   | `tokens.color.semantic.error`       |
| `rgba(20,184,166,0.18)`     | `tokens.color.brand.primaryGlow`    |
| Inline `0 1px 2px rgba(...)` shadow | `tokens.shadow.card`        |

## Rule (Phase 6.1 forward)

No new inline color literals in net-new code from this PR forward. This rule
does **not** retroactively block the inline literals already in the
repository — that cleanup is the explicit scope of Phases 6.2 + 6.3, and
mixing scopes here would break the cohesion pass at 6.6.
