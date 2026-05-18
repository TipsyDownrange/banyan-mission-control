import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PunchListStatusBadge, {
  PUNCH_LIST_STATUS_VALUES,
  type PunchListItemStatus,
} from '../components/engagements/PunchListStatusBadge';

describe('BAN-328 PunchListStatusBadge', () => {
  const cases: Array<{ status: PunchListItemStatus; label: string; color: string }> = [
    { status: 'NEW',                  label: 'New',                  color: '#64748b' },
    { status: 'ASSIGNED',             label: 'Assigned',             color: '#1d4ed8' },
    { status: 'IN_PROGRESS',          label: 'In Progress',          color: '#92400e' },
    { status: 'COMPLETED',            label: 'Completed',            color: '#15803d' },
    { status: 'SIGNED_OFF',           label: 'Signed Off',           color: '#0f766e' },
    { status: 'DISPUTED',             label: 'Disputed',             color: '#b91c1c' },
    { status: 'DEFERRED_TO_WARRANTY', label: 'Deferred → Warranty',  color: '#7e22ce' },
  ];

  it('exports exactly the 7 schema enum values (no extra DEFERRED entry)', () => {
    expect(PUNCH_LIST_STATUS_VALUES).toHaveLength(7);
    expect(PUNCH_LIST_STATUS_VALUES).toEqual([
      'NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED',
      'SIGNED_OFF', 'DISPUTED', 'DEFERRED_TO_WARRANTY',
    ]);
  });

  it.each(cases)('renders the $status badge with label "$label" and color $color', ({ status, label, color }) => {
    const html = renderToStaticMarkup(<PunchListStatusBadge status={status} />);
    expect(html).toContain(label);
    expect(html.toLowerCase()).toContain(color.toLowerCase());
  });

  it('falls back to humanized raw text for an unknown status', () => {
    const html = renderToStaticMarkup(<PunchListStatusBadge status={'SOMETHING_NEW' as PunchListItemStatus} />);
    expect(html).toContain('SOMETHING NEW');
  });
});
