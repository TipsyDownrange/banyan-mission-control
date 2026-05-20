/**
 * BAN-375 Closeout v1.1 Phase 2 — warranty record summary card.
 *
 * Read-only display of a single `warranties` row per db/schema.ts:1371.
 * Schema reality: PK is warranty_id (uuid), there is only `start_date`
 * (no explicit end_date column — coverage end is derived per
 * scope_warranties.years), status enum is 3-value ACTIVE /
 * PARTIALLY_EXPIRED / EXPIRED (db/schema.ts:1182), scope_warranties is a
 * jsonb array of per-scope warranty terms.
 *
 * Optional claim_count prop is passed in by the parent when the claims
 * list has been fetched via `/api/closeout/warranties/[id]/claims`;
 * defaults to null which renders "—" rather than "0" so callers can
 * distinguish "not yet loaded" from "loaded, zero claims".
 */

'use client';

import type { CSSProperties } from 'react';

export type WarrantyStatus = 'ACTIVE' | 'PARTIALLY_EXPIRED' | 'EXPIRED';

export type WarrantyRow = {
  warranty_id: string;
  tenant_id: string;
  engagement_id: string;
  start_date: string;
  scope_warranties: Array<Record<string, unknown>> | unknown;
  status: WarrantyStatus | string;
  created_at?: string;
  updated_at?: string;
};

const CARD: CSSProperties = {
  background: 'white',
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
  padding: '14px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const HEADER_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
};

const ID_LABEL: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: '#94a3b8',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const ID_VALUE: CSSProperties = {
  fontSize: 13,
  fontFamily: 'monospace',
  color: '#0f172a',
  marginTop: 2,
  wordBreak: 'break-all',
};

const ROW_LABEL: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: '#94a3b8',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const ROW_VALUE: CSSProperties = {
  fontSize: 13,
  color: '#0f172a',
  marginTop: 2,
};

const STATUS_STYLE: Record<WarrantyStatus, { bg: string; color: string; label: string }> = {
  ACTIVE: { bg: '#f0fdfa', color: '#0f766e', label: 'Active' },
  PARTIALLY_EXPIRED: { bg: '#fffbeb', color: '#92400e', label: 'Partially expired' },
  EXPIRED: { bg: '#f8fafc', color: '#64748b', label: 'Expired' },
};

function statusPill(status: string) {
  const cfg = (STATUS_STYLE as Record<string, { bg: string; color: string; label: string }>)[status]
    ?? { bg: '#f8fafc', color: '#64748b', label: status };
  return (
    <span
      data-testid="warranty-status-pill"
      style={{
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}33`,
        letterSpacing: '0.04em',
      }}
    >
      {cfg.label}
    </span>
  );
}

function scopeSummary(scope: unknown): string {
  if (!Array.isArray(scope) || scope.length === 0) return '—';
  const labels: string[] = [];
  for (const entry of scope) {
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      const name = typeof e.scope === 'string'
        ? e.scope
        : typeof e.name === 'string'
          ? e.name
          : typeof e.system_type === 'string'
            ? e.system_type
            : null;
      if (name) labels.push(name);
    }
  }
  if (labels.length === 0) return `${scope.length} scope${scope.length === 1 ? '' : 's'}`;
  return labels.join(', ');
}

export default function WarrantyRecordCard({
  warranty,
  claimCount,
}: {
  warranty: WarrantyRow;
  claimCount?: number | null;
}) {
  const count = claimCount ?? null;
  return (
    <div style={CARD} data-warranty-id={warranty.warranty_id} data-testid="warranty-record-card">
      <div style={HEADER_ROW}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={ID_LABEL}>Warranty</div>
          <div style={ID_VALUE}>{warranty.warranty_id}</div>
        </div>
        {statusPill(String(warranty.status))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={ROW_LABEL}>Coverage start</div>
          <div style={ROW_VALUE}>{warranty.start_date || '—'}</div>
        </div>
        <div>
          <div style={ROW_LABEL}>Claims</div>
          <div style={ROW_VALUE} data-testid="warranty-claim-count">
            {count === null ? '—' : count}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={ROW_LABEL}>Scope</div>
          <div style={ROW_VALUE}>{scopeSummary(warranty.scope_warranties)}</div>
        </div>
      </div>
    </div>
  );
}
