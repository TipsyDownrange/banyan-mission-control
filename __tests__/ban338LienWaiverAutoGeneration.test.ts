/**
 * BAN-338 Pay Apps v2c — auto-generation rules + overdue helpers + exposure calc.
 *
 * Pure-function tests for lib/lien-waivers/auto-generation.ts and
 * lib/lien-waivers/overdue-check.ts. The dispatcher integration test
 * lives in ban338PayAppDispatchHook.test.ts.
 */

import {
  WAIVER_TYPES,
  computeWaiverTypeForTransition,
  isAutoWaiverTransition,
  shouldGenerateWaiver,
} from '@/lib/lien-waivers/auto-generation';
import {
  badgeForExternalWaiverDays,
  computeOverdueExternalWaivers,
  computeOverdueUnconditionalWaivers,
  computeOutstandingLienExposure,
} from '@/lib/lien-waivers/overdue-check';
import { buildJointCheckPaymentFooter } from '@/lib/lien-waivers/joint-check-footer';

describe('BAN-338 lien waiver auto-generation rules', () => {
  it('exposes the canonical 4 waiver types', () => {
    expect(WAIVER_TYPES).toEqual([
      'CONDITIONAL_PROGRESS',
      'UNCONDITIONAL_PROGRESS',
      'CONDITIONAL_FINAL',
      'UNCONDITIONAL_FINAL',
    ]);
  });

  it('SUBMITTED + is_final_pay_app=false → CONDITIONAL_PROGRESS', () => {
    expect(computeWaiverTypeForTransition({ to_state: 'SUBMITTED', is_final_pay_app: false }))
      .toEqual({ waiver_type: 'CONDITIONAL_PROGRESS', trigger_source: 'AUTO_PAY_APP_SUBMITTED' });
  });

  it('SUBMITTED + is_final_pay_app=true → CONDITIONAL_FINAL', () => {
    expect(computeWaiverTypeForTransition({ to_state: 'SUBMITTED', is_final_pay_app: true }))
      .toEqual({ waiver_type: 'CONDITIONAL_FINAL', trigger_source: 'AUTO_PAY_APP_SUBMITTED' });
  });

  it('PAID_PARTIAL + is_final_pay_app=false → UNCONDITIONAL_PROGRESS', () => {
    expect(computeWaiverTypeForTransition({ to_state: 'PAID_PARTIAL', is_final_pay_app: false }))
      .toEqual({ waiver_type: 'UNCONDITIONAL_PROGRESS', trigger_source: 'AUTO_PAY_APP_PAID' });
  });

  it('PAID_FULL + is_final_pay_app=false → UNCONDITIONAL_PROGRESS', () => {
    expect(computeWaiverTypeForTransition({ to_state: 'PAID_FULL', is_final_pay_app: false }))
      .toEqual({ waiver_type: 'UNCONDITIONAL_PROGRESS', trigger_source: 'AUTO_PAY_APP_PAID' });
  });

  it('PAID_FULL + is_final_pay_app=true → UNCONDITIONAL_FINAL', () => {
    expect(computeWaiverTypeForTransition({ to_state: 'PAID_FULL', is_final_pay_app: true }))
      .toEqual({ waiver_type: 'UNCONDITIONAL_FINAL', trigger_source: 'AUTO_PAY_APP_PAID' });
  });

  it('PAID_PARTIAL + is_final_pay_app=true → UNCONDITIONAL_FINAL', () => {
    expect(computeWaiverTypeForTransition({ to_state: 'PAID_PARTIAL', is_final_pay_app: true }))
      .toEqual({ waiver_type: 'UNCONDITIONAL_FINAL', trigger_source: 'AUTO_PAY_APP_PAID' });
  });

  it('non-auto transitions return null', () => {
    for (const s of ['PENDING_DRAFT', 'READY_FOR_NOTARIZATION', 'READY_FOR_SUBMISSION', 'ARCHITECT_CERTIFIED', 'GC_APPROVED', 'REJECTED']) {
      expect(computeWaiverTypeForTransition({ to_state: s, is_final_pay_app: false })).toBeNull();
      expect(computeWaiverTypeForTransition({ to_state: s, is_final_pay_app: true })).toBeNull();
    }
  });

  it('isAutoWaiverTransition recognizes the 3 trigger states', () => {
    expect(isAutoWaiverTransition('SUBMITTED')).toBe(true);
    expect(isAutoWaiverTransition('PAID_PARTIAL')).toBe(true);
    expect(isAutoWaiverTransition('PAID_FULL')).toBe(true);
    expect(isAutoWaiverTransition('ARCHITECT_CERTIFIED')).toBe(false);
  });
});

describe('BAN-338 shouldGenerateWaiver — dedup logic', () => {
  const decision = { waiver_type: 'CONDITIONAL_PROGRESS' as const, trigger_source: 'AUTO_PAY_APP_SUBMITTED' as const };
  it('generates when no existing waivers', () => {
    expect(shouldGenerateWaiver({ payAppId: 'pa1', decision, existing: [] })).toBe(true);
  });

  it('skips when a live waiver of the same type exists', () => {
    expect(shouldGenerateWaiver({
      payAppId: 'pa1',
      decision,
      existing: [{ pay_app_id: 'pa1', waiver_type: 'CONDITIONAL_PROGRESS', state: 'GENERATED' }],
    })).toBe(false);
  });

  it('regenerates when the existing waiver is SUPERSEDED', () => {
    expect(shouldGenerateWaiver({
      payAppId: 'pa1',
      decision,
      existing: [{ pay_app_id: 'pa1', waiver_type: 'CONDITIONAL_PROGRESS', state: 'SUPERSEDED' }],
    })).toBe(true);
  });

  it('regenerates when the existing waiver is VOIDED', () => {
    expect(shouldGenerateWaiver({
      payAppId: 'pa1',
      decision,
      existing: [{ pay_app_id: 'pa1', waiver_type: 'CONDITIONAL_PROGRESS', state: 'VOIDED' }],
    })).toBe(true);
  });

  it('ignores waivers from a different pay app', () => {
    expect(shouldGenerateWaiver({
      payAppId: 'pa1',
      decision,
      existing: [{ pay_app_id: 'pa2', waiver_type: 'CONDITIONAL_PROGRESS', state: 'GENERATED' }],
    })).toBe(true);
  });
});

describe('BAN-338 external-waiver overdue badge thresholds', () => {
  it('<7 days → GREEN', () => {
    expect(badgeForExternalWaiverDays(0)).toBe('GREEN');
    expect(badgeForExternalWaiverDays(6)).toBe('GREEN');
  });
  it('7-14 days → YELLOW', () => {
    expect(badgeForExternalWaiverDays(7)).toBe('YELLOW');
    expect(badgeForExternalWaiverDays(14)).toBe('YELLOW');
  });
  it('>14 days → RED', () => {
    expect(badgeForExternalWaiverDays(15)).toBe('RED');
    expect(badgeForExternalWaiverDays(60)).toBe('RED');
  });

  it('computeOverdueExternalWaivers filters non-REQUESTED rows', () => {
    const now = new Date('2026-05-20T00:00:00Z');
    const out = computeOverdueExternalWaivers([
      { external_waiver_id: 'a', status: 'REQUESTED', requested_at: '2026-05-10T00:00:00Z', manufacturer_org_id: 'm1', waiver_type: 'CONDITIONAL_PROGRESS' },
      { external_waiver_id: 'b', status: 'UPLOADED', requested_at: '2026-04-01T00:00:00Z', manufacturer_org_id: 'm2', waiver_type: 'CONDITIONAL_PROGRESS' },
    ], now);
    expect(out.length).toBe(1);
    expect(out[0].external_waiver_id).toBe('a');
    expect(out[0].days_outstanding).toBe(10);
    expect(out[0].badge).toBe('YELLOW');
  });
});

describe('BAN-338 unconditional-waiver overdue calc', () => {
  it('flags an unconditional waiver still GENERATED 8 days after pay app paid', () => {
    const now = new Date('2026-05-20T00:00:00Z');
    const out = computeOverdueUnconditionalWaivers([
      {
        waiver_id: 'w1',
        pay_app_id: 'pa1',
        waiver_type: 'UNCONDITIONAL_PROGRESS',
        state: 'GENERATED',
        generated_at: '2026-05-12T00:00:00Z',
        pay_app_paid_at: '2026-05-11T00:00:00Z',
      },
    ], now, 7);
    expect(out.length).toBe(1);
    expect(out[0].days_since_paid).toBe(9);
  });

  it('ignores filed waivers', () => {
    const now = new Date('2026-05-20T00:00:00Z');
    const out = computeOverdueUnconditionalWaivers([
      {
        waiver_id: 'w1',
        pay_app_id: 'pa1',
        waiver_type: 'UNCONDITIONAL_PROGRESS',
        state: 'FILED',
        generated_at: '2026-05-01T00:00:00Z',
        pay_app_paid_at: '2026-05-01T00:00:00Z',
      },
    ], now, 7);
    expect(out.length).toBe(0);
  });

  it('ignores conditional waivers (only unconditional gates exposure)', () => {
    const now = new Date('2026-05-20T00:00:00Z');
    const out = computeOverdueUnconditionalWaivers([
      {
        waiver_id: 'w1',
        pay_app_id: 'pa1',
        waiver_type: 'CONDITIONAL_PROGRESS',
        state: 'GENERATED',
        generated_at: '2026-05-01T00:00:00Z',
        pay_app_paid_at: '2026-05-01T00:00:00Z',
      },
    ], now, 7);
    expect(out.length).toBe(0);
  });
});

describe('BAN-338 outstanding lien exposure', () => {
  it('sums current_amount_due for submitted pay apps without matching unconditional waivers', () => {
    const exposure = computeOutstandingLienExposure(
      [
        { pay_app_id: 'pa1', current_amount_due: 10000, state: 'SUBMITTED', is_final_pay_app: false },
        { pay_app_id: 'pa2', current_amount_due: 25000, state: 'PAID_FULL', is_final_pay_app: false },
        { pay_app_id: 'pa3', current_amount_due: 5000, state: 'PENDING_DRAFT', is_final_pay_app: false },
      ],
      [
        { pay_app_id: 'pa1', waiver_type: 'UNCONDITIONAL_PROGRESS', state: 'GENERATED' },
      ],
    );
    // pa1 has a live UNCONDITIONAL_PROGRESS → covered (waiver exists, so NOT in exposure).
    // pa2 has no waiver → 25000 in exposure.
    // pa3 still draft → not in exposure.
    expect(exposure).toBe(25000);
  });

  it('VOIDED unconditional waivers do not cover exposure', () => {
    const exposure = computeOutstandingLienExposure(
      [{ pay_app_id: 'pa1', current_amount_due: 7500, state: 'SUBMITTED', is_final_pay_app: false }],
      [{ pay_app_id: 'pa1', waiver_type: 'UNCONDITIONAL_PROGRESS', state: 'VOIDED' }],
    );
    expect(exposure).toBe(7500);
  });

  it('is_final_pay_app=true requires UNCONDITIONAL_FINAL coverage', () => {
    const exposure = computeOutstandingLienExposure(
      [{ pay_app_id: 'pa1', current_amount_due: 1000, state: 'SUBMITTED', is_final_pay_app: true }],
      [{ pay_app_id: 'pa1', waiver_type: 'UNCONDITIONAL_PROGRESS', state: 'GENERATED' }],
    );
    // Progress waiver does NOT cover a final pay app.
    expect(exposure).toBe(1000);
  });
});

describe('BAN-338 joint check footer rendering', () => {
  it('renders a single-manufacturer footer', () => {
    const out = buildJointCheckPaymentFooter({ manufacturers: ['Vitro Glass'] });
    expect(out).toBe('Payment to be made joint check to Kula Glass Company Inc + Vitro Glass');
  });
  it('renders a 2-manufacturer footer', () => {
    const out = buildJointCheckPaymentFooter({ manufacturers: ['Vitro', 'Guardian'] });
    expect(out).toContain('Vitro');
    expect(out).toContain('Guardian');
  });
  it('returns empty string when no manufacturers are active', () => {
    expect(buildJointCheckPaymentFooter({ manufacturers: [] })).toBe('');
  });
  it('overrides party name when provided', () => {
    expect(buildJointCheckPaymentFooter({ manufacturers: ['X'], party_name: 'Acme LLC' }))
      .toBe('Payment to be made joint check to Acme LLC + X');
  });
});
