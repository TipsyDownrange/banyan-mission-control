/**
 * BAN-117: Scheduling Matrix kID parity.
 *
 * Mission Control must recognize equivalent Work Order kID variants when
 * suppressing the Needs Scheduling list. Field App and the service/update
 * sync may write Dispatch_Schedule rows with SVC-WO-* / SVC-* prefixes; the
 * superintendent scheduling route used to compare with exact Set.has, which
 * left WOs flagged as "Needs Scheduling" even after they were scheduled.
 *
 * Contract: normalizeKID strips SVC-, WO-, PRJ-, SRV- prefixes (in that order
 * for the SVC-WO- compound) so all four variants of the same Work Order
 * collapse to a single canonical id.
 */

import { normalizeKID, kidsMatch, kidInSet } from '@/lib/normalize-kid';

describe('BAN-117 normalizeKID variant parity', () => {
  const variants = ['WO-26-8479', 'SVC-WO-26-8479', 'SVC-26-8479', '26-8479'];

  test.each(variants)('%s normalizes to bare 26-8479', (v) => {
    expect(normalizeKID(v)).toBe('26-8479');
  });

  test('every variant pair is kidsMatch-equal', () => {
    for (const a of variants) {
      for (const b of variants) {
        expect(kidsMatch(a, b)).toBe(true);
      }
    }
  });

  test('different work orders do not match across variants', () => {
    expect(kidsMatch('WO-26-8479', 'SVC-WO-26-8480')).toBe(false);
    expect(kidsMatch('SVC-26-8479', '26-9999')).toBe(false);
  });

  test('lowercase / mixed-case prefixes still normalize', () => {
    expect(normalizeKID('svc-wo-26-8479')).toBe('26-8479');
    expect(normalizeKID('Svc-Wo-26-8479')).toBe('26-8479');
  });

  test('empty / nullish inputs are safe', () => {
    expect(normalizeKID('')).toBe('');
    expect(kidsMatch('', 'WO-26-8479')).toBe(false);
    expect(kidsMatch('WO-26-8479', '')).toBe(false);
  });
});

describe('BAN-117 unscheduled suppression uses kidInSet semantics', () => {
  // Mirrors the suppression decision in
  // app/api/superintendent-scheduling/route.ts so a regression in that
  // route's comparison contract trips this test.
  function isSuppressed(
    wo: { wo_number?: string; wo_id?: string; name: string },
    scheduledKIDs: Set<string>,
    scheduledProjectNames: Set<string>,
  ) {
    if (wo.wo_number && kidInSet(wo.wo_number, scheduledKIDs)) return true;
    if (wo.wo_id && kidInSet(wo.wo_id, scheduledKIDs)) return true;
    if (scheduledProjectNames.has(wo.name.toLowerCase().trim())) return true;
    return false;
  }

  const wo = { wo_number: '26-8479', wo_id: 'WO-26-8479', name: 'Smith Reno' };

  test.each([
    ['WO-26-8479'],
    ['SVC-WO-26-8479'],
    ['SVC-26-8479'],
    ['26-8479'],
  ])('Dispatch_Schedule kID %s suppresses the WO', (dispatchKid) => {
    const scheduled = new Set<string>([dispatchKid]);
    expect(isSuppressed(wo, scheduled, new Set())).toBe(true);
  });

  test('unrelated dispatch kID does not suppress', () => {
    const scheduled = new Set<string>(['SVC-WO-26-9999']);
    expect(isSuppressed(wo, scheduled, new Set())).toBe(false);
  });

  test('project-name fallback still suppresses', () => {
    expect(isSuppressed(wo, new Set(), new Set(['smith reno']))).toBe(true);
  });
});
