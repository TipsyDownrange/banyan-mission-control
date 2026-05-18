/**
 * BAN-338 Pay Apps v2c — Lien waiver auto-generation rules.
 *
 * Pure functions that map a (pay_app state transition, is_final_pay_app)
 * tuple to the waiver type that should be auto-generated, per the master
 * packet §6 / AIA Billing Trunk v1.1 §10 rule table:
 *
 *   PAY_APP → SUBMITTED      + is_final_pay_app=false → CONDITIONAL_PROGRESS
 *   PAY_APP → SUBMITTED      + is_final_pay_app=true  → CONDITIONAL_FINAL
 *   PAY_APP → PAID_PARTIAL   + is_final_pay_app=false → UNCONDITIONAL_PROGRESS
 *   PAY_APP → PAID_PARTIAL   + is_final_pay_app=true  → UNCONDITIONAL_FINAL
 *   PAY_APP → PAID_FULL      + is_final_pay_app=false → UNCONDITIONAL_PROGRESS
 *   PAY_APP → PAID_FULL      + is_final_pay_app=true  → UNCONDITIONAL_FINAL
 *
 * Any other transition returns null (no waiver is generated).
 *
 * The dispatcher itself (the part that actually inserts a lien_waivers row
 * and emits LIEN_WAIVER_GENERATED) lives in dispatcher.ts and consumes the
 * output of this function.
 */

export const WAIVER_TYPES = [
  'CONDITIONAL_PROGRESS',
  'UNCONDITIONAL_PROGRESS',
  'CONDITIONAL_FINAL',
  'UNCONDITIONAL_FINAL',
] as const;
export type WaiverType = typeof WAIVER_TYPES[number];

export type WaiverTriggerSource =
  | 'AUTO_PAY_APP_SUBMITTED'
  | 'AUTO_PAY_APP_PAID'
  | 'MANUAL';

export interface AutoWaiverDecision {
  waiver_type: WaiverType;
  trigger_source: 'AUTO_PAY_APP_SUBMITTED' | 'AUTO_PAY_APP_PAID';
}

export function computeWaiverTypeForTransition(input: {
  to_state: string;
  is_final_pay_app: boolean;
}): AutoWaiverDecision | null {
  const { to_state, is_final_pay_app } = input;

  if (to_state === 'SUBMITTED') {
    return {
      waiver_type: is_final_pay_app ? 'CONDITIONAL_FINAL' : 'CONDITIONAL_PROGRESS',
      trigger_source: 'AUTO_PAY_APP_SUBMITTED',
    };
  }

  if (to_state === 'PAID_PARTIAL' || to_state === 'PAID_FULL') {
    return {
      waiver_type: is_final_pay_app ? 'UNCONDITIONAL_FINAL' : 'UNCONDITIONAL_PROGRESS',
      trigger_source: 'AUTO_PAY_APP_PAID',
    };
  }

  return null;
}

export function isAutoWaiverTransition(toState: string): boolean {
  return toState === 'SUBMITTED' || toState === 'PAID_PARTIAL' || toState === 'PAID_FULL';
}

/**
 * Per master packet §6.3, the conditional/unconditional pair is keyed to the
 * pay app + the is_final flag. We use this to dedupe within a (pay_app_id,
 * waiver_type, NOT SUPERSEDED) bucket so a re-emit of the lifecycle event
 * doesn't double-generate.
 */
export interface ExistingWaiverIndex {
  pay_app_id: string | null;
  waiver_type: WaiverType;
  state: string;
}

export function shouldGenerateWaiver(input: {
  payAppId: string;
  decision: AutoWaiverDecision;
  existing: ExistingWaiverIndex[];
}): boolean {
  const live = input.existing.filter(
    (w) =>
      w.pay_app_id === input.payAppId &&
      w.waiver_type === input.decision.waiver_type &&
      w.state !== 'SUPERSEDED' &&
      w.state !== 'VOIDED',
  );
  return live.length === 0;
}
