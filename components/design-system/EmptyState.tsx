'use client';

import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';

export type EmptyStateVariant = 'standard' | 'compact';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: Extract<ButtonVariant, 'primary' | 'action' | 'secondary'>;
}

export interface EmptyStateProps {
  icon?: ReactNode;
  heading: string;
  body?: string;
  action?: EmptyStateAction;
  variant?: EmptyStateVariant;
  bordered?: boolean;
}

const EMPTY_STATE_STYLES = `
[data-bos-empty] {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 24px;
  text-align: center;
}
[data-bos-empty-icon] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--bos-color-ink-tertiary);
}
[data-bos-empty-heading] {
  font-size: 16px;
  font-weight: 600;
  color: var(--bos-color-ink-primary);
  margin: 0;
}
[data-bos-empty-body] {
  font-size: 13px;
  color: var(--bos-color-ink-secondary);
  line-height: 1.5;
  max-width: 360px;
  margin: 0;
}
[data-bos-empty-action] {
  margin-top: 4px;
}
[data-bos-empty][data-variant="compact"] {
  gap: 8px;
  padding: 16px;
}
[data-bos-empty][data-variant="compact"][data-bordered="true"] {
  border: 1px dashed var(--bos-color-border-strong);
  border-radius: var(--bos-radius-md);
}
[data-bos-empty][data-variant="compact"] [data-bos-empty-heading] {
  font-size: 13px;
}
[data-bos-empty][data-variant="compact"] [data-bos-empty-body] {
  font-size: 12px;
  max-width: 220px;
}
`;

export function EmptyState({
  icon,
  heading,
  body,
  action,
  variant = 'standard',
  bordered,
}: EmptyStateProps) {
  return (
    <>
      <style href="bos-empty" precedence="low">{EMPTY_STATE_STYLES}</style>
      <div
        data-bos-empty=""
        role="status"
        {...(variant !== 'standard' ? { 'data-variant': variant } : {})}
        {...(bordered ? { 'data-bordered': 'true' } : {})}
      >
        {icon ? <span data-bos-empty-icon="">{icon}</span> : null}
        <h3 data-bos-empty-heading="">{heading}</h3>
        {body ? <p data-bos-empty-body="">{body}</p> : null}
        {action ? (
          <div data-bos-empty-action="">
            <Button variant={action.variant ?? 'primary'} onClick={action.onClick}>
              {action.label}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
