/**
 * BAN-342 PM-V1.0-C — Follow-up email draft generation.
 *
 * PM Trunk v1.0 §7.3 recommends a confirming email with a 3-business-day
 * response window so an offline agreement becomes stronger written evidence.
 */

export type VerbalAgreementEmailInput = {
  subject: string;
  external_party_org: string;
  external_party_contact_name?: string | null;
  agreement_summary: string;
  occurred_at?: string | Date | null;
  cost_impact_estimate?: string | number | null;
  schedule_impact_days?: number | null;
};

export function addBusinessDays(start: Date, businessDays: number): Date {
  const out = new Date(start);
  let added = 0;
  while (added < businessDays) {
    out.setDate(out.getDate() + 1);
    const day = out.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return out;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatOccurredAt(value: string | Date | null | undefined): string {
  if (!value) return 'our recent conversation';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return 'our recent conversation';
  return `our conversation on ${formatDate(d)}`;
}

export function buildVerbalAgreementFollowupEmail(
  input: VerbalAgreementEmailInput,
  ctx: { now?: Date } = {},
) {
  const now = ctx.now ?? new Date();
  const deadline = addBusinessDays(now, 3);
  const recipientName = input.external_party_contact_name?.trim() || 'there';
  const cost = input.cost_impact_estimate !== null && input.cost_impact_estimate !== undefined && String(input.cost_impact_estimate).trim() !== ''
    ? `\n\nCost impact noted: $${Number(input.cost_impact_estimate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
    : '';
  const schedule = Number.isFinite(input.schedule_impact_days)
    ? `\nSchedule impact noted: ${input.schedule_impact_days} day${input.schedule_impact_days === 1 ? '' : 's'}.`
    : '';

  return {
    subject: `Follow-up: ${input.subject}`,
    response_deadline: deadline.toISOString().slice(0, 10),
    body: [
      `Hi ${recipientName},`,
      '',
      `Per ${formatOccurredAt(input.occurred_at)}, I captured the following agreement for ${input.external_party_org}:`,
      '',
      input.agreement_summary,
      `${cost}${schedule}`,
      '',
      `If I have captured this incorrectly, please reply by ${formatDate(deadline)} so we can correct the record.`,
      '',
      'Thank you,',
      'Kula Glass',
    ].filter(Boolean).join('\n'),
  };
}
