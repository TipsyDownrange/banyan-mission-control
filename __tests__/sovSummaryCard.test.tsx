import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SOVSummaryCard, {
  type PayAppForSummary,
  type SovLine,
  type SovVersion,
} from '../components/engagements/SOVSummaryCard';

const sovLines: SovLine[] = [
  { sov_line_id: 'a', line_number: 1, scheduled_value: '100000', retainage_pct: '10' },
  { sov_line_id: 'b', line_number: 2, scheduled_value: '50000', retainage_pct: '10' },
];

const sovVersions: SovVersion[] = [
  { sov_version_id: 'v2', version_number: 2, state: 'LOCKED', total_value: '150000' },
  { sov_version_id: 'v1', version_number: 1, state: 'RETIRED', total_value: '150000' },
];

describe('BAN-322 SOVSummaryCard', () => {
  it('shows total contract from SOV lines and pay-app derived billed-to-date', () => {
    const payApps: PayAppForSummary[] = [
      { current_amount_due: '25000', total_earned_less_retainage: '67500', retainage_held: '7500' },
    ];
    const html = renderToStaticMarkup(
      <SOVSummaryCard
        sovVersions={sovVersions}
        sovLines={sovLines}
        payApps={payApps}
        activeSovVersionId="v2"
      />,
    );
    expect(html).toContain('$150,000');         // total contract
    expect(html).toContain('$75,000');          // billed-to-date = earned 67500 + retainage 7500
    expect(html).toContain('$7,500');           // retainage held from pay apps
    expect(html).toContain('50% complete');     // 75000 / 150000
    expect(html).toContain('Version 2 · LOCKED');
    expect(html).toContain('Postgres billing data');
  });

  it('falls back to SOV line aggregates when no pay apps exist', () => {
    const linesWithBilled: SovLine[] = [
      { sov_line_id: 'a', line_number: 1, scheduled_value: '100000', retainage_pct: '10' },
    ];
    // Cast through unknown to satisfy SovLine while testing fallback path
    const linesWithPrior = linesWithBilled.map((l) => ({
      ...l,
      previous_periods: '20000',
      this_period: '10000',
    })) as unknown as SovLine[];
    const html = renderToStaticMarkup(
      <SOVSummaryCard
        sovVersions={sovVersions}
        sovLines={linesWithPrior}
        payApps={[]}
        activeSovVersionId="v2"
      />,
    );
    expect(html).toContain('$100,000');   // contract
    expect(html).toContain('$30,000');    // billed-to-date from SOV
    expect(html).toContain('30% complete');
  });

  it('renders no-version copy when sovVersions is empty', () => {
    const html = renderToStaticMarkup(
      <SOVSummaryCard
        sovVersions={[]}
        sovLines={[]}
        payApps={[]}
        activeSovVersionId={null}
      />,
    );
    expect(html).toContain('No SOV version on file yet');
    expect(html).toContain('$0');
  });
});
