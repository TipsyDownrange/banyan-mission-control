/**
 * BAN-375 Closeout v1.1.1 Phase 1 — punch walk picker (presentational).
 *
 * Parent supplies the walks array (fetched via /api/closeout/punch-walks)
 * and a callback for the selected walk_id. The picker renders a labelled
 * <select>; "All walks" maps to null. Type tag is shown after the date so
 * superintendents can pick a specific walk type at a glance.
 *
 * Stays presentational (no fetch logic of its own) so it can be reused
 * outside the PunchListTab orchestrator without duplicating wiring.
 */

'use client';

import type { CSSProperties } from 'react';

export type WalkOption = {
  walk_id: string;
  type: string;
  walk_date: string;
  status: string;
};

const TYPE_LABEL: Record<string, string> = {
  initial: 'Initial',
  reinspection: 'Reinspection',
  substantial_completion: 'Substantial completion',
  owner_walkthrough: 'Owner walkthrough',
  architect: 'Architect',
  final: 'Final',
  internal_qa: 'Internal QA',
};

const WRAP: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
};

const LABEL: CSSProperties = {
  fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

const SELECT: CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
  background: 'white', fontSize: 12, color: '#0f172a', maxWidth: 360,
};

export default function PunchWalkPicker({
  walks,
  selectedWalkId,
  onSelect,
}: {
  walks: WalkOption[];
  selectedWalkId: string | null;
  onSelect: (walkId: string | null) => void;
}) {
  return (
    <div style={WRAP} data-testid="punch-walk-picker">
      <div style={LABEL}>Walk</div>
      <select
        value={selectedWalkId ?? ''}
        onChange={(e) => onSelect(e.target.value === '' ? null : e.target.value)}
        style={SELECT}
      >
        <option value="">All walks ({walks.length})</option>
        {walks.map((w) => (
          <option key={w.walk_id} value={w.walk_id}>
            {w.walk_date} · {TYPE_LABEL[w.type] ?? w.type}
            {w.status === 'complete' ? ' · complete' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
