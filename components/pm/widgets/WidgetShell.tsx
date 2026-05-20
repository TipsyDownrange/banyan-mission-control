'use client';
/**
 * BAN-348 PM-V1.0-I — Common chrome for every dashboard widget.
 *
 * Drag handle is wired to the `pm-dashboard-drag-handle` className so
 * react-grid-layout can isolate drags from clicks on interactive bits
 * inside the widget body.
 */

import type { ReactNode } from 'react';
import type { WidgetKind } from '@/lib/pm/dashboard/types';

export const DRAG_HANDLE_CLASS = 'pm-dashboard-drag-handle';

type Props = {
  kind: WidgetKind;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  loading?: boolean;
  error?: string | null;
  children: ReactNode;
  onHide?: () => void;
  showHide?: boolean;
};

export default function WidgetShell({
  title,
  subtitle,
  rightSlot,
  loading,
  error,
  children,
  onHide,
  showHide,
}: Props) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 14,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        className={DRAG_HANDLE_CLASS}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '12px 16px',
          borderBottom: '1px solid #f1f5f9',
          cursor: 'grab',
          userSelect: 'none',
          background: 'var(--color-surface)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--bos-color-brand-primary-deep)',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {rightSlot}
          {showHide && onHide && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onHide(); }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Hide widget"
              style={{
                background: 'transparent',
                border: '1px solid var(--color-surface-border)',
                borderRadius: 6,
                padding: '2px 8px',
                fontSize: 11,
                color: 'var(--bos-color-ink-disabled)',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {loading ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 12 }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{
            padding: 10,
            background: 'var(--color-red-50)',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: 'var(--color-red-700)',
            fontSize: 12,
          }}>
            {error}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
