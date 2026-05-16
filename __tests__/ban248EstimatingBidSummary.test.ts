import { normalizeBidSummary } from '@/lib/estimating/bid-summary';

describe('BAN-248 estimating bid summary normalization', () => {
  it('maps legacy Bid Log Job Name into Estimating Workspace card title', () => {
    const bid = normalizeBidSummary({
      kID: 'BID-123',
      jobName: 'Element Hotel Waikiki Storefront',
      island: 'Oahu',
      assignedTo: 'Jenny',
      status: 'ASSIGNED',
      dueDate: '2026-06-01',
      estValueLow: 125000,
      estValueHigh: 150000,
    });
    expect(bid.bidVersionId).toBe('BID-123');
    expect(bid.projectName).toBe('Element Hotel Waikiki Storefront');
    expect(bid.estimator).toBe('Jenny');
    expect(bid.totalEstimate).toBe('125,000–150,000');
  });

  it('keeps Untitled Bid only as a true fallback', () => {
    expect(normalizeBidSummary({ kID: 'BID-EMPTY' }).projectName).toBe('Untitled Bid');
  });
});
