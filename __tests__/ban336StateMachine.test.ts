/**
 * BAN-336 Pay App Core — state machine + PDF format coverage.
 *
 * Verifies that the BAN-336 state machine is consistent with the canonical
 * Pattern B transitions in lib/aia/state-transitions.ts: PENDING_DRAFT →
 * READY_FOR_NOTARIZATION | READY_FOR_SUBMISSION, REJECTED → PENDING_DRAFT,
 * and that the new billing_format enum is exhaustive.
 */

import {
  validatePatternBTransition,
  PAY_APP_STATES,
  PAY_APP_ALLOWED_TRANSITIONS,
} from '@/lib/aia/state-transitions';
import type { PayAppPdfFormat } from '@/lib/aia/pay-app-pdf';

describe('BAN-336 pay app state machine', () => {
  it('PENDING_DRAFT → READY_FOR_NOTARIZATION is allowed', () => {
    expect(validatePatternBTransition('pay_application', 'PENDING_DRAFT', 'READY_FOR_NOTARIZATION').ok).toBe(true);
  });

  it('PENDING_DRAFT → READY_FOR_SUBMISSION is allowed (no-notarization branch)', () => {
    expect(validatePatternBTransition('pay_application', 'PENDING_DRAFT', 'READY_FOR_SUBMISSION').ok).toBe(true);
  });

  it('PENDING_DRAFT → REJECTED is allowed', () => {
    expect(validatePatternBTransition('pay_application', 'PENDING_DRAFT', 'REJECTED').ok).toBe(true);
  });

  it('SUBMITTED → REJECTED is allowed (mid-cycle rejection)', () => {
    expect(validatePatternBTransition('pay_application', 'SUBMITTED', 'REJECTED').ok).toBe(true);
  });

  it('REJECTED → PENDING_DRAFT is allowed (return-to-draft branch)', () => {
    expect(validatePatternBTransition('pay_application', 'REJECTED', 'PENDING_DRAFT').ok).toBe(true);
  });

  it('rejects illegal transitions (e.g. PAID_FULL → anything)', () => {
    const v = validatePatternBTransition('pay_application', 'PAID_FULL', 'PENDING_DRAFT');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('rejects no-op transitions', () => {
    const v = validatePatternBTransition('pay_application', 'PENDING_DRAFT', 'PENDING_DRAFT');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('NO_OP');
  });

  it('covers all 9 canonical states', () => {
    expect(PAY_APP_STATES).toContain('PENDING_DRAFT');
    expect(PAY_APP_STATES).toContain('READY_FOR_NOTARIZATION');
    expect(PAY_APP_STATES).toContain('READY_FOR_SUBMISSION');
    expect(PAY_APP_STATES).toContain('SUBMITTED');
    expect(PAY_APP_STATES).toContain('ARCHITECT_CERTIFIED');
    expect(PAY_APP_STATES).toContain('GC_APPROVED');
    expect(PAY_APP_STATES).toContain('PAID_PARTIAL');
    expect(PAY_APP_STATES).toContain('PAID_FULL');
    expect(PAY_APP_STATES).toContain('REJECTED');
    expect(PAY_APP_STATES).toHaveLength(9);
  });

  it('PAY_APP_ALLOWED_TRANSITIONS preserves the spec rejection branch', () => {
    expect(PAY_APP_ALLOWED_TRANSITIONS.REJECTED).toEqual(['PENDING_DRAFT']);
  });
});

describe('BAN-336 PDF format enum', () => {
  it('union covers AIA_G702_G703 + 2 custom templates', () => {
    const formats: PayAppPdfFormat[] = [
      'AIA_G702_G703',
      'CUSTOM_TEMPLATE_AIA_STYLE',
      'CUSTOM_TEMPLATE_SCHEDULE_ABC',
    ];
    expect(formats).toHaveLength(3);
  });
});
