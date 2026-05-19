'use client';

import { AlertTriangle, CheckCircle2, MapPin, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export type StatusPillVariant = 'warn' | 'error' | 'success' | 'info';

export interface StatusPillProps {
  variant: StatusPillVariant;
  children: ReactNode;
  icon?: ReactNode;
}

const PILL_STYLES = `
[data-bos-pill] {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--bos-radius-pill);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1;
}
[data-bos-pill][data-variant="warn"] {
  background: var(--bos-color-semantic-warning-glow);
  color: var(--bos-color-semantic-warning);
}
[data-bos-pill][data-variant="error"] {
  background: var(--bos-color-semantic-error-glow);
  color: var(--bos-color-semantic-error);
}
[data-bos-pill][data-variant="success"] {
  background: var(--bos-color-brand-primary-glow);
  color: var(--bos-color-brand-primary);
}
[data-bos-pill][data-variant="info"] {
  background: var(--bos-color-accent-data-glow);
  color: var(--bos-color-accent-data-bright);
}
[data-bos-pill] > [data-bos-pill-icon] {
  display: inline-flex;
  align-items: center;
}
`;

const DEFAULT_ICON: Record<StatusPillVariant, ReactNode> = {
  warn: <AlertTriangle size={11} strokeWidth={1.75} aria-hidden="true" />,
  error: <XCircle size={11} strokeWidth={1.75} aria-hidden="true" />,
  success: <CheckCircle2 size={11} strokeWidth={1.75} aria-hidden="true" />,
  info: <MapPin size={11} strokeWidth={1.75} aria-hidden="true" />,
};

export function StatusPill({ variant, children, icon }: StatusPillProps) {
  const resolvedIcon = icon ?? DEFAULT_ICON[variant];
  return (
    <>
      <style href="bos-pill" precedence="low">{PILL_STYLES}</style>
      <span data-bos-pill="" data-variant={variant}>
        <span data-bos-pill-icon="">{resolvedIcon}</span>
        {children}
      </span>
    </>
  );
}
