/**
 * BAN-328 Closeout Punch List v1 — filtered items list.
 *
 * Filter controls: status (multi-select), source (multi-select), category
 * (multi-select), assignee (single-select). Filtering is pure — the
 * exported `filterPunchListItems` helper is unit-tested directly.
 *
 * Inline-style hex per RF1.
 */

'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import PunchListItemDetailCard, { type PunchListItem } from './PunchListItemDetailCard';
import { PUNCH_LIST_STATUS_VALUES, type PunchListItemStatus } from './PunchListStatusBadge';
import { EmptyState } from '@/components/design-system';

export const PUNCH_LIST_SOURCE_VALUES = [
  'FIELD_ISSUE', 'SUBSTANTIAL_WALKTHROUGH', 'GC_TRANSMITTAL',
  'OWNER_WALKTHROUGH', 'ARCHITECT_WALKTHROUGH', 'INTERNAL_QA',
] as const;

export const PUNCH_LIST_CATEGORY_VALUES = [
  'GLASS', 'FRAMING', 'HARDWARE', 'SEALANT',
  'FINISH', 'CLEANING', 'DOCUMENTATION', 'OTHER',
] as const;

export type PunchListFilters = {
  statuses: Set<string>;
  sources: Set<string>;
  categories: Set<string>;
  assignee: string | null;  // null = all assignees, '__unassigned__' = unassigned
};

export const ALL_FILTERS_OPEN: PunchListFilters = {
  statuses: new Set(),
  sources: new Set(),
  categories: new Set(),
  assignee: null,
};

export function filterPunchListItems(items: PunchListItem[], filters: PunchListFilters): PunchListItem[] {
  return items.filter((item) => {
    if (filters.statuses.size > 0 && !filters.statuses.has(String(item.status))) return false;
    if (filters.sources.size > 0 && !filters.sources.has(item.source)) return false;
    if (filters.categories.size > 0 && !filters.categories.has(item.category)) return false;
    if (filters.assignee !== null) {
      if (filters.assignee === '__unassigned__') {
        if (item.assigned_to !== null && item.assigned_to !== undefined) return false;
      } else if (item.assigned_to !== filters.assignee) {
        return false;
      }
    }
    return true;
  });
}

const CHIP_BASE: CSSProperties = {
  padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
  letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none',
  whiteSpace: 'nowrap', border: '1px solid transparent',
};

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...CHIP_BASE,
        background: active ? 'var(--bos-color-brand-primary-deep)' : 'var(--color-surface)',
        color: active ? 'white' : 'var(--bos-color-ink-tertiary)',
        borderColor: active ? 'var(--bos-color-brand-primary-deep)' : 'var(--color-surface-border)',
      }}
    >
      {children}
    </button>
  );
}

function FilterGroup({
  label, values, selected, onToggle,
}: {
  label: string;
  values: readonly string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {values.map((v) => (
          <Chip key={v} active={selected.has(v)} onClick={() => onToggle(v)}>
            {v.replace(/_/g, ' ')}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export default function PunchListItemsList({ items }: { items: PunchListItem[] }) {
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState<string | null>(null);

  const assignees = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.assigned_to) set.add(i.assigned_to);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => filterPunchListItems(items, {
    statuses, sources, categories, assignee,
  }), [items, statuses, sources, categories, assignee]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (v: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)',
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
      }} data-testid="punch-list-filters">
        <FilterGroup
          label="Status"
          values={PUNCH_LIST_STATUS_VALUES as readonly string[]}
          selected={statuses}
          onToggle={toggle(setStatuses)}
        />
        <FilterGroup
          label="Source"
          values={PUNCH_LIST_SOURCE_VALUES as readonly string[]}
          selected={sources}
          onToggle={toggle(setSources)}
        />
        <FilterGroup
          label="Category"
          values={PUNCH_LIST_CATEGORY_VALUES as readonly string[]}
          selected={categories}
          onToggle={toggle(setCategories)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Assignee
          </div>
          <select
            value={assignee ?? ''}
            onChange={(e) => setAssignee(e.target.value === '' ? null : e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-surface-border)',
              background: 'white', fontSize: 12, color: 'var(--color-ink-primary)', maxWidth: 320,
            }}
          >
            <option value="">All assignees</option>
            <option value="__unassigned__">Unassigned</option>
            {assignees.map((uid) => (
              <option key={uid} value={uid}>{uid.slice(0, 8)}…</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-disabled)', letterSpacing: '0.04em',
      }}>
        Showing {filtered.length} of {items.length} items
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)' }}>
          <EmptyState
            icon={<span style={{ fontSize: 24 }}>📋</span>}
            heading="No items match the current filters."
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((item) => (
            <PunchListItemDetailCard key={item.punch_item_id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
