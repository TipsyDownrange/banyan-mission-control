/**
 * BAN-376 Customer Pipeline — DB-touching inquiry helpers.
 *
 * Pure helpers (state machine, routing suggestion, SRV-id validation) live in
 * lib/inquiries/state-machine.ts so the UI bundle can import them without
 * dragging the Postgres driver into the browser.  This file is server-only:
 * nextInquiryNumber issues a SELECT against the inquiries table to assign
 * the next INQ-YY-NNNN.
 */

import { and, desc, eq, like } from 'drizzle-orm';
import { db, inquiries } from '@/db';
import type { InquiryState } from '@/db';
import { canTransitionLite, suggestAssignedRole, isValidServiceWorkOrderId } from './state-machine';

export { suggestAssignedRole, isValidServiceWorkOrderId };

export async function nextInquiryNumber(tenantId: string, now: Date = new Date()): Promise<string> {
  const year = now.getFullYear() % 100;
  const prefix = `INQ-${String(year).padStart(2, '0')}-`;
  const rows = await db
    .select({ inquiry_number: inquiries.inquiry_number })
    .from(inquiries)
    .where(and(eq(inquiries.tenant_id, tenantId), like(inquiries.inquiry_number, `${prefix}%`)))
    .orderBy(desc(inquiries.inquiry_number));
  let max = 0;
  for (const r of rows) {
    const m = (r.inquiry_number as string).match(/^INQ-\d{2}-(\d{4})$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export function canTransition(from: InquiryState, to: InquiryState): boolean {
  return canTransitionLite(from, to);
}
