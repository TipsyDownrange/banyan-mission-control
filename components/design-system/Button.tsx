'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'action' | 'secondary' | 'destructive';
export type ButtonSize = 'sm' | 'md';
export type ButtonShape = 'default' | 'pill';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
  size?: ButtonSize;
  pressed?: boolean;
  shape?: ButtonShape;
}

const BUTTON_STYLES = `
[data-bos-button] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: var(--bos-radius-md);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  border: 1px solid transparent;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--bos-motion-duration-fast) var(--bos-motion-easing-out),
              color var(--bos-motion-duration-fast) var(--bos-motion-easing-out),
              border-color var(--bos-motion-duration-fast) var(--bos-motion-easing-out);
}
[data-bos-button][data-variant="primary"] {
  background: var(--bos-color-brand-primary-deep);
  color: #ffffff;
}
[data-bos-button][data-variant="primary"]:hover:not(:disabled) {
  background: var(--bos-color-brand-primary);
}
[data-bos-button][data-variant="action"] {
  background: var(--bos-color-accent-action-deep);
  color: #ffffff;
}
[data-bos-button][data-variant="action"]:hover:not(:disabled) {
  background: var(--bos-color-accent-action);
}
[data-bos-button][data-variant="secondary"] {
  background: transparent;
  color: var(--bos-color-ink-secondary);
  border-color: var(--bos-color-border-strong);
}
[data-bos-button][data-variant="secondary"]:hover:not(:disabled) {
  background: var(--bos-color-surface-elevated);
  color: var(--bos-color-ink-primary);
}
[data-bos-button][data-variant="destructive"] {
  background: var(--bos-color-semantic-error);
  color: #ffffff;
}
[data-bos-button][data-variant="destructive"]:hover:not(:disabled) {
  background: var(--bos-color-semantic-error);
  opacity: 0.9;
}
[data-bos-button]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
[data-bos-button] > [data-bos-button-icon] {
  display: inline-flex;
  align-items: center;
}
[data-bos-button][data-size="sm"] {
  padding: 5px 10px;
  font-size: 12px;
  gap: 6px;
}
[data-bos-button][data-shape="pill"] {
  border-radius: var(--bos-radius-pill);
}
[data-bos-button][data-pressed="true"][data-variant="primary"] {
  background: var(--bos-color-brand-primary-deep);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}
[data-bos-button][data-pressed="true"][data-variant="action"] {
  background: var(--bos-color-accent-action-deep);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}
[data-bos-button][data-pressed="true"][data-variant="secondary"] {
  background: var(--bos-color-surface-elevated);
  color: var(--bos-color-ink-primary);
  border-color: var(--bos-color-brand-primary);
}
[data-bos-button][data-pressed="true"][data-variant="destructive"] {
  background: var(--bos-color-semantic-error);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
  filter: brightness(0.92);
}
`;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', icon, children, type, size = 'md', pressed, shape = 'default', ...rest },
  ref,
) {
  return (
    <>
      <style href="bos-button" precedence="low">{BUTTON_STYLES}</style>
      <button
        ref={ref}
        type={type ?? 'button'}
        data-bos-button=""
        data-variant={variant}
        {...(size !== 'md' ? { 'data-size': size } : {})}
        {...(shape !== 'default' ? { 'data-shape': shape } : {})}
        {...(pressed ? { 'data-pressed': 'true', 'aria-pressed': true } : {})}
        {...rest}
      >
        {icon ? <span data-bos-button-icon="">{icon}</span> : null}
        {children}
      </button>
    </>
  );
});
