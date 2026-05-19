'use client';

import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: Extract<ButtonVariant, 'primary' | 'action' | 'secondary'>;
}

export interface EmptyStateProps {
  icon: ReactNode;
  heading: string;
  body?: string;
  action?: EmptyStateAction;
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
`;

export function EmptyState({ icon, heading, body, action }: EmptyStateProps) {
  return (
    <>
      <style href="bos-empty" precedence="low">{EMPTY_STATE_STYLES}</style>
      <div data-bos-empty="" role="status">
        <span data-bos-empty-icon="">{icon}</span>
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
