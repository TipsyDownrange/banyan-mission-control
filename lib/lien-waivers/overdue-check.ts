/**
 * BAN-338 Pay Apps v2c — Kai overdue flag stubs.
 *
 * Pure functions consumed by the v2c UI badges (red/yellow/green by days
 * outstanding) and by a future Kai cron alert job (out of scope here — the
 * alert dispatch is BAN-339 follow-up). These return the overdue lists; the
 * cron and the UI both call them and apply their own thresholds.
 */

export interface ExternalWaiverOverdueInput {
  external_waiver_id: string;
  status: string;
  requested_at: Date | string;
  manufacturer_org_id: string;
  waiver_type: string;
}

export interface ExternalWaiverOverdueRow extends ExternalWaiverOverdueInput {
  days_outstanding: number;
  badge: 'GREEN' | 'YELLOW' | 'RED';
}

export function badgeForExternalWaiverDays(days: number): 'GREEN' | 'YELLOW' | 'RED' {
  if (days < 7) return 'GREEN';
  if (days <= 14) return 'YELLOW';
  return 'RED';
}

/**
 * Returns external waiver requests still in REQUESTED status with a
 * computed days_outstanding + colour badge per the v2c thresholds:
 *   <7 days  → GREEN
 *   7-14    → YELLOW
 *   >14     → RED
 *
 * `now` is injected so tests are deterministic.
 */
export function computeOverdueExternalWaivers(
  rows: ExternalWaiverOverdueInput[],
  now: Date = new Date(),
): ExternalWaiverOverdueRow[] {
  return rows
    .filter((row) => row.status === 'REQUESTED')
    .map((row) => {
      const requested =
        row.requested_at instanceof Date
          ? row.requested_at
          : new Date(row.requested_at);
      const ms = Math.max(0, now.getTime() - requested.getTime());
      const days = Math.floor(ms / (24 * 60 * 60 * 1000));
      return {
        ...row,
        days_outstanding: days,
        badge: badgeForExternalWaiverDays(days),
      };
    });
}

export interface UnconditionalWaiverOverdueInput {
  waiver_id: string;
  pay_app_id: string | null;
  waiver_type: string;
  state: string;
  generated_at: Date | string | null;
  pay_app_paid_at: Date | string | null;
}

export interface UnconditionalWaiverOverdueRow {
  waiver_id: string;
  pay_app_id: string | null;
  waiver_type: string;
  state: string;
  days_since_paid: number;
}

/**
 * Returns unconditional waivers that are still GENERATED/PENDING after the
 * pay app has been paid. The Kai cron will use this to nudge admin to get
 * the waiver notarized + filed; the threshold is policy-set externally
 * (default: any row where the pay app was paid more than 7 days ago).
 */
export function computeOverdueUnconditionalWaivers(
  rows: UnconditionalWaiverOverdueInput[],
  now: Date = new Date(),
  thresholdDays: number = 7,
): UnconditionalWaiverOverdueRow[] {
  const out: UnconditionalWaiverOverdueRow[] = [];
  for (const row of rows) {
    if (row.waiver_type !== 'UNCONDITIONAL_PROGRESS' && row.waiver_type !== 'UNCONDITIONAL_FINAL') {
      continue;
    }
    if (row.state !== 'GENERATED' && row.state !== 'PENDING' && row.state !== 'NOTARIZED') {
      continue;
    }
    if (!row.pay_app_paid_at) continue;
    const paid =
      row.pay_app_paid_at instanceof Date
        ? row.pay_app_paid_at
        : new Date(row.pay_app_paid_at);
    const ms = Math.max(0, now.getTime() - paid.getTime());
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    if (days >= thresholdDays) {
      out.push({
        waiver_id: row.waiver_id,
        pay_app_id: row.pay_app_id,
        waiver_type: row.waiver_type,
        state: row.state,
        days_since_paid: days,
      });
    }
  }
  return out;
}

/**
 * Outstanding lien exposure per the tracker UI: SUM(pay_app
 * current_amount_due) for pay apps that have NO matching live
 * unconditional waiver (i.e., the GC has been billed but Kula has not yet
 * filed an unconditional waiver releasing those funds).
 */
export interface ExposurePayAppInput {
  pay_app_id: string;
  current_amount_due: number;
  state: string;
  is_final_pay_app: boolean;
}

export interface ExposureWaiverInput {
  pay_app_id: string | null;
  waiver_type: string;
  state: string;
}

export function computeOutstandingLienExposure(
  payApps: ExposurePayAppInput[],
  waivers: ExposureWaiverInput[],
): number {
  let total = 0;
  for (const payApp of payApps) {
    const needs =
      payApp.state === 'SUBMITTED' ||
      payApp.state === 'ARCHITECT_CERTIFIED' ||
      payApp.state === 'GC_APPROVED' ||
      payApp.state === 'PAID_PARTIAL' ||
      payApp.state === 'PAID_FULL';
    if (!needs) continue;

    const expectedType = payApp.is_final_pay_app
      ? 'UNCONDITIONAL_FINAL'
      : 'UNCONDITIONAL_PROGRESS';
    const matching = waivers.find(
      (w) =>
        w.pay_app_id === payApp.pay_app_id &&
        w.waiver_type === expectedType &&
        w.state !== 'VOIDED' &&
        w.state !== 'SUPERSEDED',
    );
    if (!matching) {
      total += Number.isFinite(payApp.current_amount_due) ? payApp.current_amount_due : 0;
    }
  }
  return Math.round(total * 100) / 100;
}
