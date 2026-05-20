'use client';

import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';

export type CardVariant = 'standard' | 'hero' | 'compact';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  accentColor?: string;
}

const CARD_STYLES = `
[data-bos-card] {
  box-sizing: border-box;
}
[data-bos-card][data-variant="standard"] {
  background: var(--bos-color-surface-card);
  border: 1px solid var(--bos-color-border-subtle);
  border-radius: var(--bos-radius-lg);
  padding: var(--bos-space-5);
  box-shadow: var(--bos-shadow-card);
}
[data-bos-card][data-variant="hero"] {
  position: relative;
  background: linear-gradient(135deg, var(--bos-color-surface-card) 0%, var(--bos-color-surface-elevated) 100%);
  border: 1px solid var(--bos-color-brand-primary);
  border-radius: var(--bos-radius-xl);
  padding: 28px 32px;
  overflow: hidden;
  box-shadow: var(--bos-shadow-card);
}
[data-bos-card][data-variant="hero"]::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--bos-color-gradient-hero);
}
[data-bos-card][data-variant="compact"] {
  background: var(--bos-color-surface-card);
  border: 1px solid var(--bos-color-border-subtle);
  border-radius: var(--bos-radius-md);
  padding: 10px 12px;
  box-shadow: var(--bos-shadow-sm);
}
[data-bos-card][data-has-accent="true"] {
  border-left: 4px solid var(--bos-card-accent);
}
`;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'standard', accentColor, style, children, ...rest },
  ref,
) {
  const hasAccent = Boolean(accentColor);
  const mergedStyle = hasAccent
    ? ({ ...style, '--bos-card-accent': accentColor } as CSSProperties)
    : style;
  return (
    <>
      <style href="bos-card" precedence="low">{CARD_STYLES}</style>
      <div
        ref={ref}
        data-bos-card=""
        data-variant={variant}
        {...(hasAccent ? { 'data-has-accent': 'true' } : {})}
        style={mergedStyle}
        {...rest}
      >
        {children}
      </div>
    </>
  );
});
