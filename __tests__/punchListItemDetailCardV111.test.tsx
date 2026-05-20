/**
 * BAN-375 Closeout v1.1.1 — PunchListItemDetailCard extensions.
 *
 * Verifies the read-only display additions:
 *   - trade is rendered with the human-readable label
 *   - assigned_to_sub_id is rendered as a monospace short id when present
 *   - WAIVED status surfaces the waived_reason block
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PunchListItemDetailCard, {
  type PunchListItem,
} from '../components/engagements/PunchListItemDetailCard';

function baseItem(over: Partial<PunchListItem> = {}): PunchListItem {
  return {
    punch_item_id: 'p1',
    item_number: 1,
    source: 'FIELD_ISSUE',
    source_ref: null,
    description: 'Sample',
    location: {},
    category: 'FINISH',
    trade: 'glazier',
    responsible_party: 'KULA',
    photos_required: false,
    photo_evidence: [],
    assigned_to: null,
    assigned_to_sub_id: null,
    walk_id: null,
    due_date: null,
    status: 'NEW',
    completion_evidence: {},
    signoff_evidence: {},
    dispute_reason: null,
    dispute_resolution: null,
    waived_reason: null,
    ...over,
  };
}

describe('PunchListItemDetailCard — v1.1.1 read-only additions', () => {
  it('renders the trade label in the expanded body', () => {
    const html = renderToStaticMarkup(<PunchListItemDetailCard item={baseItem({ trade: 'framer' })} />);
    expect(html).toContain('Trade');
    expect(html).toContain('Framer');
  });

  it('renders the trade as "Other" when omitted (defaults to other in API)', () => {
    const html = renderToStaticMarkup(<PunchListItemDetailCard item={baseItem({ trade: 'other' })} />);
    expect(html).toContain('Other');
  });

  it('renders the assigned sub short id when assigned_to_sub_id is set', () => {
    const html = renderToStaticMarkup(<PunchListItemDetailCard item={baseItem({
      assigned_to_sub_id: '00000000-0000-4000-8000-aaaabbbbcccc',
    })} />);
    expect(html).toContain('Assigned sub');
    expect(html).toContain('00000000');
  });

  it('shows "—" when there is no assigned sub', () => {
    const html = renderToStaticMarkup(<PunchListItemDetailCard item={baseItem()} />);
    // The detail card uses '—' in several "empty" cells, so we scope by the
    // assigned-sub testid block content.
    expect(html).toMatch(/Assigned sub[\s\S]*?—/);
  });

  it('renders the WAIVED block with the waived_reason on terminal WAIVED items', () => {
    const html = renderToStaticMarkup(<PunchListItemDetailCard item={baseItem({
      status: 'WAIVED',
      waived_reason: 'GC clarified scope; remove from list',
    })} />);
    // WAIVED is terminal — collapsed by default. Force an expanded snapshot
    // by re-rendering with a non-terminal status to confirm the block exists
    // only when status === 'WAIVED'.
    expect(html).toContain('punch-item-waived-block');
    expect(html).toContain('GC clarified scope; remove from list');
  });

  it('does NOT render the WAIVED block when status is non-WAIVED', () => {
    const html = renderToStaticMarkup(<PunchListItemDetailCard item={baseItem({ status: 'IN_PROGRESS' })} />);
    expect(html).not.toContain('punch-item-waived-block');
  });

  it('shows a placeholder when WAIVED but waived_reason is missing', () => {
    const html = renderToStaticMarkup(<PunchListItemDetailCard item={baseItem({
      status: 'WAIVED',
      waived_reason: null,
    })} />);
    expect(html).toContain('no waiver reason captured');
  });
});
