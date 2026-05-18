/**
 * BAN-338 Pay Apps v2c — Post-transition hook that runs the lien-waiver
 * auto-generation dispatcher in its own transaction after a successful pay
 * app state transition.
 *
 * Best-effort: if the dispatcher fails, we log and return the error but do
 * NOT fail the pay app transition that already committed. The manual
 * "Generate Waiver" UI button is the documented fallback.
 *
 * The pay-app row fields needed by the dispatcher (number, current_amount_due,
 * period_end, is_final_pay_app, engagement.is_test_project) are looked up
 * fresh from the db so this stays a simple drop-in for both the
 * /api/pay-apps/[id]/submit-direct and /api/aia/pay-applications/[id]/transition
 * routes.
 */

import { and, eq } from 'drizzle-orm';
import { db, pay_applications, engagements } from '@/db';
import { dispatchAutoLienWaiver, type DispatchAutoWaiverResult } from './dispatcher';
import { isAutoWaiverTransition } from './auto-generation';

export interface RunAutoWaiverHookInput {
  tenantId: string;
  payAppId: string;
  toState: string;
  actorEmail: string;
}

export interface RunAutoWaiverHookResult {
  ran: boolean;
  result?: DispatchAutoWaiverResult;
  error?: string;
}

export async function runAutoLienWaiverHook(
  input: RunAutoWaiverHookInput,
): Promise<RunAutoWaiverHookResult> {
  if (!isAutoWaiverTransition(input.toState)) {
    return { ran: false };
  }

  try {
    const lookup = await db
      .select({
        pay_app_id: pay_applications.pay_app_id,
        pay_app_number: pay_applications.pay_app_number,
        engagement_id: pay_applications.engagement_id,
        current_amount_due: pay_applications.current_amount_due,
        period_end: pay_applications.period_end,
        is_final_pay_app: pay_applications.is_final_pay_app,
        is_test_project: engagements.is_test_project,
      })
      .from(pay_applications)
      .innerJoin(engagements, eq(pay_applications.engagement_id, engagements.engagement_id))
      .where(
        and(
          eq(pay_applications.pay_app_id, input.payAppId),
          eq(pay_applications.tenant_id, input.tenantId),
        ),
      )
      .limit(1);

    if (lookup.length === 0) {
      return { ran: false, error: 'pay app not found for waiver dispatch' };
    }

    const row = lookup[0];

    const result = await db.transaction(async (tx) =>
      dispatchAutoLienWaiver(tx, {
        tenantId: input.tenantId,
        engagementId: row.engagement_id,
        payAppId: input.payAppId,
        payAppNumber: row.pay_app_number,
        payAppCurrentAmountDue: row.current_amount_due,
        payAppPeriodEnd: row.period_end,
        isFinalPayApp: !!row.is_final_pay_app,
        toState: input.toState,
        isTestProject: !!row.is_test_project,
        actorEmail: input.actorEmail,
      }),
    );

    return { ran: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.error('[BAN-338] auto-waiver hook failed:', message);
    }
    return { ran: true, error: message };
  }
}
