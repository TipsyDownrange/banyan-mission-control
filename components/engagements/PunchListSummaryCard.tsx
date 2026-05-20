/**
 * BAN-328 Closeout Punch List v1 — summary KPI card.
 *
 * Read-only counts: total items, by-status breakdown across the 7 enum
 * values, and photo-evidence completeness (items with ≥1 photo).
 *
 * Per BAN-332 schema gap (engagements.gc_formal_signoff not yet shipped)
 * the GC formal signoff banner is DEFERRED — this surface intentionally
 * does not consume that flag.
 */

import type { CSSProperties } from 'react';
import { PUNCH_LIST_STATUS_VALUES, type PunchListItemStatus } from './PunchListStatusBadge';
import type { PunchListItem } from './PunchListItemDetailCard';

const KPI: CSSProperties = {
  background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
  padding: '12px 14px',
};

const KPI_LABEL: CSSProperties = {
  fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

const KPI_VALUE: CSSProperties = {
  fontSize: 20, fontWeight: 900, color: 'var(--color-ink-primary)', marginTop: 5,
};

const KPI_SUB: CSSProperties = {
  fontSize: 11, color: 'var(--bos-color-ink-disabled)', marginTop: 3,
};

const STATUS_LABEL: Record<PunchListItemStatus, string> = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  SIGNED_OFF: 'Signed Off',
  DISPUTED: 'Disputed',
  DEFERRED_TO_WARRANTY: 'Deferred → Warranty',
};

export function countByStatus(items: PunchListItem[]): Record<PunchListItemStatus, number> {
  const out = Object.fromEntries(
    PUNCH_LIST_STATUS_VALUES.map((s) => [s, 0]),
  ) as Record<PunchListItemStatus, number>;
  for (const i of items) {
    const s = i.status as PunchListItemStatus;
    if (s in out) out[s] += 1;
  }
  return out;
}

export function countPhotosPresent(items: PunchListItem[]): number {
  return items.reduce((acc, i) => acc + (i.photo_evidence.length > 0 ? 1 : 0), 0);
}

export default function PunchListSummaryCard({ items }: { items: PunchListItem[] }) {
  const total = items.length;
  const byStatus = countByStatus(items);
  const photosPresent = countPhotosPresent(items);
  const photosRequiredItems = items.filter((i) => i.photos_required).length;
  const photosDenom = photosRequiredItems > 0 ? photosRequiredItems : total;

  return (
    <div style={{
      background: 'white', borderRadius: 18, border: '1px solid #e2e8f0',
      padding: '18px 20px', boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' }}>
          Punch List Summary
        </div>
        <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)', marginTop: 4 }}>
          Live counts across the 7 lifecycle statuses (Closeout Spec §6.2) plus photo-evidence completeness.
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10,
      }}>
        <div style={KPI}>
          <div style={KPI_LABEL}>Total items</div>
          <div style={KPI_VALUE}>{total}</div>
          <div style={KPI_SUB}>across all sources</div>
        </div>
        <div style={KPI}>
          <div style={KPI_LABEL}>Photo evidence</div>
          <div style={KPI_VALUE}>{photosPresent} / {photosDenom}</div>
          <div style={KPI_SUB}>
            {photosRequiredItems > 0
              ? 'items requiring photos with ≥1 attached'
              : 'items with ≥1 photo attached'}
          </div>
        </div>
        <div style={KPI}>
          <div style={KPI_LABEL}>Terminal cleared</div>
          <div style={KPI_VALUE}>
            {byStatus.COMPLETED + byStatus.SIGNED_OFF + byStatus.DEFERRED_TO_WARRANTY}
          </div>
          <div style={KPI_SUB}>completed · signed off · deferred</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PUNCH_LIST_STATUS_VALUES.map((s) => (
          <div key={s} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 999,
            background: '#f8fafc', border: '1px solid #e2e8f0',
            fontSize: 11, fontWeight: 700, color: '#334155',
          }}>
            <span>{STATUS_LABEL[s]}</span>
            <span style={{ color: 'var(--color-ink-primary)', fontWeight: 900 }}>{byStatus[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
