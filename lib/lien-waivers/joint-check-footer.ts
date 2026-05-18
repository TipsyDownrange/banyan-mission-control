/**
 * BAN-338 Pay Apps v2c — Joint check payment-instruction footer.
 *
 * When an ACTIVE joint_check_agreement exists for an engagement, pay-app
 * submission emails / PDFs include a payment-instruction footer naming the
 * manufacturer. Pure function so it's testable without DB.
 */

export interface JointCheckFooterInput {
  manufacturers: string[];
  party_name?: string;
}

export function buildJointCheckPaymentFooter(input: JointCheckFooterInput): string {
  const party = (input.party_name ?? 'Kula Glass Company Inc').trim();
  const list = input.manufacturers.filter((m) => m && m.trim().length > 0);
  if (list.length === 0) return '';
  if (list.length === 1) {
    return `Payment to be made joint check to ${party} + ${list[0]}`;
  }
  const head = list.slice(0, -1).join(', ');
  const tail = list[list.length - 1];
  return `Payment to be made joint check to ${party} + ${head}, and ${tail}`;
}
