'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface NavSectionLabelProps {
  children: ReactNode;
}

export interface NavItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}

const NAV_STYLES = `
[data-bos-nav-section] {
  display: block;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--bos-color-ink-disabled);
  padding: 8px 18px 6px;
}
[data-bos-nav-item] {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--bos-color-ink-secondary);
  background: transparent;
  border: 0;
  border-left: 2px solid transparent;
  width: 100%;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
  font-family: inherit;
  transition: background var(--bos-motion-duration-fast) var(--bos-motion-easing-out),
              color var(--bos-motion-duration-fast) var(--bos-motion-easing-out);
}
[data-bos-nav-item][data-active="true"] {
  color: var(--bos-color-ink-primary);
  background: rgba(255, 255, 255, 0.04);
  border-left: 2px solid var(--bos-color-brand-primary);
  padding-left: 16px;
}
[data-bos-nav-item-icon] {
  display: inline-flex;
  align-items: center;
  opacity: 0.85;
  color: inherit;
}
[data-bos-nav-item][data-active="true"] [data-bos-nav-item-icon] {
  opacity: 1;
  color: var(--bos-color-brand-primary);
}
[data-bos-nav-item]:hover:not([data-active="true"]) {
  color: var(--bos-color-ink-primary);
  background: rgba(255, 255, 255, 0.02);
}
`;

export function NavSectionLabel({ children }: NavSectionLabelProps) {
  return (
    <>
      <style href="bos-nav" precedence="low">{NAV_STYLES}</style>
      <div data-bos-nav-section="">{children}</div>
    </>
  );
}

export function NavItem({ icon, label, active = false, href, onClick }: NavItemProps) {
  const content = (
    <>
      <span data-bos-nav-item-icon="">{icon}</span>
      <span>{label}</span>
    </>
  );

  const sharedProps = {
    'data-bos-nav-item': '',
    'data-active': active ? 'true' : 'false',
    'aria-current': active ? ('page' as const) : undefined,
  };

  return (
    <>
      <style href="bos-nav" precedence="low">{NAV_STYLES}</style>
      {href ? (
        <Link href={href} {...sharedProps} onClick={onClick}>
          {content}
        </Link>
      ) : (
        <button type="button" {...sharedProps} onClick={onClick}>
          {content}
        </button>
      )}
    </>
  );
}
