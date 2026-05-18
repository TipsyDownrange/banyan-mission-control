import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PayAppsList, { type PayApp } from '../components/engagements/PayAppsList';

const fixture: PayApp[] = [
  {
    pay_app_id: '11111111-1111-1111-1111-111111111111',
    pay_app_number: 3,
    period_start: '2026-04-01',
    period_end: '2026-04-30',
    state: 'SUBMITTED',
    current_amount_due: '125000',
    total_earned_less_retainage: '450000',
    retainage_held: '50000',
    submitted_at: '2026-05-02T18:00:00.000Z',
  },
  {
    pay_app_id: '22222222-2222-2222-2222-222222222222',
    pay_app_number: 2,
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    state: 'PAID_FULL',
    current_amount_due: '75000',
    total_earned_less_retainage: '325000',
    retainage_held: '36000',
    submitted_at: '2026-04-02T18:00:00.000Z',
  },
];

describe('BAN-322 PayAppsList', () => {
  it('renders an empty state with disabled create CTA when no pay apps', () => {
    const html = renderToStaticMarkup(<PayAppsList payApps={[]} />);
    expect(html).toContain('No pay applications yet');
    expect(html).toContain('disabled=""');
    expect(html).toContain('+ Create pay app (v2)');
  });

  it('renders one row per pay app with number, money totals, and state badge', () => {
    const html = renderToStaticMarkup(<PayAppsList payApps={fixture} />);
    expect(html).toContain('#3');
    expect(html).toContain('#2');
    expect(html).toContain('$125,000');
    expect(html).toContain('$450,000');
    expect(html).toContain('Submitted');
    expect(html).toContain('Paid · Full');
    expect(html).toMatch(/Pay Applications[\s\S]*\(2\)/);
  });

  it('renders fallback state badge text for unknown states', () => {
    const html = renderToStaticMarkup(
      <PayAppsList payApps={[{ ...fixture[0], state: 'SOMETHING_NEW' }]} />,
    );
    expect(html).toContain('SOMETHING NEW');
  });
});
