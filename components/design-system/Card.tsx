'use client';

import { forwardRef, type HTMLAttributes } from 'react';

export type CardVariant = 'standard' | 'hero';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
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
`;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'standard', children, ...rest },
  ref,
) {
  return (
    <>
      <style href="bos-card" precedence="low">{CARD_STYLES}</style>
      <div ref={ref} data-bos-card="" data-variant={variant} {...rest}>
        {children}
      </div>
    </>
  );
});
