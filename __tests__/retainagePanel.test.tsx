import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RetainagePanel, { type RetainageHolding } from '../components/engagements/RetainagePanel';

describe('BAN-322 RetainagePanel', () => {
  it('renders empty state when no retainage holdings', () => {
    const html = renderToStaticMarkup(<RetainagePanel retainage={[]} />);
    expect(html).toContain('No retainage on file');
  });

  it('totals held vs released and renders one row per holding', () => {
    const retainage: RetainageHolding[] = [
      {
        holding_id: 'h1',
        pay_app_id: 'aaaaaaaa-1111-1111-1111-111111111111',
        amount_held: '10000',
        release_trigger: 'SUBSTANTIAL_COMPLETION',
        released_at: null,
        released_pay_app_id: null,
      },
      {
        holding_id: 'h2',
        pay_app_id: 'bbbbbbbb-2222-2222-2222-222222222222',
        amount_held: '7500',
        release_trigger: 'FINAL_PAYMENT',
        released_at: '2026-05-10T12:00:00.000Z',
        released_pay_app_id: 'cccccccc-3333-3333-3333-333333333333',
      },
      {
        holding_id: 'h3',
        pay_app_id: 'dddddddd-4444-4444-4444-444444444444',
        amount_held: '2500',
        release_trigger: 'MANUAL',
        released_at: null,
        released_pay_app_id: null,
      },
    ];
    const html = renderToStaticMarkup(<RetainagePanel retainage={retainage} />);
    expect(html).toContain('Held $12,500');     // 10000 + 2500
    expect(html).toContain('Released $7,500');  // 7500
    expect(html).toContain('aaaaaaaa');
    expect(html).toContain('bbbbbbbb');
    expect(html).toContain('SUBSTANTIAL COMPLETION');
    expect(html).toContain('FINAL PAYMENT');
    expect(html).toContain('Released');
    expect(html).toContain('Held');
  });
});
