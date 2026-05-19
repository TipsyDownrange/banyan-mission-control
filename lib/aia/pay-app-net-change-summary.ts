import { and, eq } from 'drizzle-orm';
import { google } from 'googleapis';
import { db, engagements, pay_applications, tm_authorizations } from '@/db';
import { getBackendSheetId } from '@/lib/backend-config';
import { getGoogleAuth } from '@/lib/gauth';

const CHANGE_ORDER_COLS = [
  'co_id',
  'co_number',
  'kID',
  'status',
  'title',
  'description',
  'basis',
  'trigger_type',
  'trigger_ref',
  'amount_requested',
  'amount_approved',
  'schedule_impact_days',
  'submitted_at',
  'approved_at',
  'approved_by',
  'sov_line',
  'exhibits',
  'internal_notes',
  'created_at',
] as const;

const APPROVED_CO_STATUSES = new Set(['APPROVED', 'APPROVED_WITH_T&M']);

export type NetChangeSource = 'CO' | 'TM_AUTH';

export interface NetChangeFootnoteItem {
  source: NetChangeSource;
  label: string;
  amount: number;
  date?: string | null;
}

export interface NetChangeFootnoteSummary {
  items: NetChangeFootnoteItem[];
  total: number;
  footnote: string;
}

interface ChangeOrderRow {
  co_number: string;
  kID: string;
  status: string;
  amount_approved: string;
  approved_at: string;
}

function rowToChangeOrder(row: string[]): ChangeOrderRow {
  const mapped: Record<string, string> = {};
  CHANGE_ORDER_COLS.forEach((col, i) => {
    mapped[col] = row[i] || '';
  });
  return {
    co_number: mapped.co_number || '',
    kID: mapped.kID || '',
    status: mapped.status || '',
    amount_approved: mapped.amount_approved || '0',
    approved_at: mapped.approved_at || '',
  };
}

function toNumber(value: unknown): number {
  const n = Number(String(value ?? '0').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function toDateOnly(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const dateOnly = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

function inPeriod(value: unknown, start: string, end: string): boolean {
  const date = toDateOnly(value);
  if (!date) return false;
  return date >= start && date <= end;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatNetChangeFootnote(items: NetChangeFootnoteItem[]): string {
  const total = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const lines = [`Net Change by Change Orders: ${formatMoney(total)}`];

  for (const item of items) {
    const dateLabel = item.source === 'CO' ? 'approved' : 'signed';
    const suffix = item.date ? ` (${dateLabel} ${item.date})` : '';
    lines.push(`- ${item.label} ${formatMoney(item.amount)}${suffix}`);
  }

  lines.push(`Total: ${formatMoney(total)}`);
  return lines.join('\n');
}

export function buildNetChangeFootnoteSummary(
  items: NetChangeFootnoteItem[],
): NetChangeFootnoteSummary {
  const sorted = [...items].sort((a, b) => {
    const dateCompare = String(a.date ?? '').localeCompare(String(b.date ?? ''));
    if (dateCompare !== 0) return dateCompare;
    return a.label.localeCompare(b.label);
  });
  return {
    items: sorted,
    total: round2(sorted.reduce((sum, item) => sum + item.amount, 0)),
    footnote: formatNetChangeFootnote(sorted),
  };
}

async function fetchApprovedChangeOrderItems(input: {
  kid: string;
  periodStart: string;
  periodEnd: string;
}): Promise<NetChangeFootnoteItem[]> {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getBackendSheetId(),
    range: 'Change_Orders!A2:S5000',
  });
  const rows = (res.data.values || []).map((row) => rowToChangeOrder(row.map(String)));
  return rows
    .filter((row) => row.kID === input.kid)
    .filter((row) => APPROVED_CO_STATUSES.has(row.status))
    .filter((row) => inPeriod(row.approved_at, input.periodStart, input.periodEnd))
    .map((row) => ({
      source: 'CO' as const,
      label: row.co_number || 'CO',
      amount: toNumber(row.amount_approved),
      date: toDateOnly(row.approved_at),
    }));
}

export async function composeNetChangeFootnote(
  payAppId: string,
  tenantId: string,
): Promise<NetChangeFootnoteSummary> {
  const payAppRows = await db
    .select({
      engagement_id: pay_applications.engagement_id,
      period_start: pay_applications.period_start,
      period_end: pay_applications.period_end,
    })
    .from(pay_applications)
    .where(and(
      eq(pay_applications.pay_app_id, payAppId),
      eq(pay_applications.tenant_id, tenantId),
    ))
    .limit(1);

  const payApp = payAppRows[0];
  if (!payApp) return buildNetChangeFootnoteSummary([]);

  const periodStart = String(payApp.period_start);
  const periodEnd = String(payApp.period_end);

  const engagementRows = await db
    .select({ kid: engagements.kid })
    .from(engagements)
    .where(and(
      eq(engagements.engagement_id, payApp.engagement_id),
      eq(engagements.tenant_id, tenantId),
    ))
    .limit(1);

  const kid = engagementRows[0]?.kid ?? '';
  const [changeOrderItems, tmRows] = await Promise.all([
    kid ? fetchApprovedChangeOrderItems({ kid, periodStart, periodEnd }) : Promise.resolve([]),
    db
      .select({
        authorization_number: tm_authorizations.authorization_number,
        authorized_by_date: tm_authorizations.authorized_by_date,
        not_to_exceed_amount: tm_authorizations.not_to_exceed_amount,
        status: tm_authorizations.status,
      })
      .from(tm_authorizations)
      .where(and(
        eq(tm_authorizations.tenant_id, tenantId),
        eq(tm_authorizations.engagement_id, payApp.engagement_id),
      )),
  ]);

  const tmItems = tmRows
    .filter((row) => row.status !== 'DISPUTED')
    .filter((row) => inPeriod(row.authorized_by_date, periodStart, periodEnd))
    .map((row) => ({
      source: 'TM_AUTH' as const,
      label: `T&M Auth #${row.authorization_number}`,
      amount: toNumber(row.not_to_exceed_amount),
      date: toDateOnly(row.authorized_by_date),
    }));

  return buildNetChangeFootnoteSummary([...changeOrderItems, ...tmItems]);
}
