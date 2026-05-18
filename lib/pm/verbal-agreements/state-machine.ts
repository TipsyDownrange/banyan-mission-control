/**
 * BAN-342 PM-V1.0-C — Verbal Agreement lifecycle rules.
 *
 * PM Trunk v1.0 §7 keeps the workflow intentionally small:
 * LOGGED -> FOLLOWED_UP -> FORMALIZED -> RESOLVED, with a dispute path.
 */

export const VERBAL_AGREEMENT_STATUSES = [
  'LOGGED',
  'FOLLOWED_UP',
  'FORMALIZED',
  'DISPUTED',
  'RESOLVED',
] as const;

export type VerbalAgreementStatus = typeof VERBAL_AGREEMENT_STATUSES[number];

export const VERBAL_AGREEMENT_TYPES = [
  'SCOPE_CHANGE',
  'SCHEDULE_AGREEMENT',
  'T_M_AUTHORIZATION',
  'DESIGN_CLARIFICATION',
  'PAYMENT_TERM',
  'DELIVERY_COMMITMENT',
  'OTHER',
] as const;

export type VerbalAgreementType = typeof VERBAL_AGREEMENT_TYPES[number];

export const FORMAL_DOCUMENTATION_TYPES = [
  'CHANGE_ORDER',
  'TM_TICKET',
  'RFI',
] as const;

export type FormalDocumentationType = typeof FORMAL_DOCUMENTATION_TYPES[number];

export const VERBAL_AGREEMENT_ALLOWED_TRANSITIONS: Record<VerbalAgreementStatus, VerbalAgreementStatus[]> = {
  LOGGED: ['FOLLOWED_UP', 'DISPUTED'],
  FOLLOWED_UP: ['FORMALIZED', 'DISPUTED'],
  FORMALIZED: ['RESOLVED'],
  DISPUTED: ['RESOLVED'],
  RESOLVED: [],
};

export type TransitionValidationResult =
  | { ok: true }
  | { ok: false; reason: 'UNKNOWN_FROM_STATE' | 'UNKNOWN_TO_STATE' | 'NO_OP' | 'TRANSITION_NOT_ALLOWED'; message: string };

export function isVerbalAgreementStatus(value: unknown): value is VerbalAgreementStatus {
  return typeof value === 'string' && (VERBAL_AGREEMENT_STATUSES as readonly string[]).includes(value);
}

export function isVerbalAgreementType(value: unknown): value is VerbalAgreementType {
  return typeof value === 'string' && (VERBAL_AGREEMENT_TYPES as readonly string[]).includes(value);
}

export function isFormalDocumentationType(value: unknown): value is FormalDocumentationType {
  return typeof value === 'string' && (FORMAL_DOCUMENTATION_TYPES as readonly string[]).includes(value);
}

export function validateVerbalAgreementTransition(
  fromState: string,
  toState: string,
): TransitionValidationResult {
  if (!isVerbalAgreementStatus(fromState)) {
    return { ok: false, reason: 'UNKNOWN_FROM_STATE', message: `Unknown verbal agreement from_state: ${fromState}` };
  }
  if (!isVerbalAgreementStatus(toState)) {
    return { ok: false, reason: 'UNKNOWN_TO_STATE', message: `Unknown verbal agreement to_state: ${toState}` };
  }
  if (fromState === toState) {
    return { ok: false, reason: 'NO_OP', message: `verbal agreement transition ${fromState} -> ${toState} is a no-op` };
  }
  if (!VERBAL_AGREEMENT_ALLOWED_TRANSITIONS[fromState].includes(toState)) {
    return {
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
      message: `verbal agreement transition ${fromState} -> ${toState} is not allowed`,
    };
  }
  return { ok: true };
}
