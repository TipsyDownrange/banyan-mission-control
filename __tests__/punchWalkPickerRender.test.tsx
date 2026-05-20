/**
 * BAN-375 Closeout v1.1.1 — PunchWalkPicker render tests.
 *
 * Presentational component; tests cover the option list shape and the
 * "All walks" sentinel that maps to null.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PunchWalkPicker, { type WalkOption } from '../components/closeout/PunchWalkPicker';

const WALKS: WalkOption[] = [
  { walk_id: 'w1', type: 'initial', walk_date: '2026-05-15', status: 'in_progress' },
  { walk_id: 'w2', type: 'substantial_completion', walk_date: '2026-05-18', status: 'complete' },
];

describe('PunchWalkPicker', () => {
  it('renders an "All walks" option that reports the walk count', () => {
    const html = renderToStaticMarkup(
      <PunchWalkPicker walks={WALKS} selectedWalkId={null} onSelect={() => undefined} />,
    );
    expect(html).toContain('All walks (2)');
  });

  it('renders each walk option with date + human-friendly type label', () => {
    const html = renderToStaticMarkup(
      <PunchWalkPicker walks={WALKS} selectedWalkId={null} onSelect={() => undefined} />,
    );
    expect(html).toContain('2026-05-15');
    expect(html).toContain('Initial');
    expect(html).toContain('2026-05-18');
    expect(html).toContain('Substantial completion');
    expect(html).toContain('complete');
  });

  it('falls back to the raw type when the label map has no entry', () => {
    const exotic: WalkOption[] = [
      { walk_id: 'wx', type: 'mystery_walk', walk_date: '2026-05-19', status: 'in_progress' },
    ];
    const html = renderToStaticMarkup(
      <PunchWalkPicker walks={exotic} selectedWalkId={null} onSelect={() => undefined} />,
    );
    expect(html).toContain('mystery_walk');
  });
});
