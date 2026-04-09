/**
 * POST /api/service/quote/validate
 *
 * Server-side validation and calculation of a Carls_Method estimate JSON.
 * QuoteBuilder should call this before allowing proposal generation.
 *
 * Body: { estimate: CarlsMethodData, woId?: string }
 * Returns: { valid: true, calculations: {...} } | { valid: false, errors: string[] }
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { GET_PASS_ON_RATE, GET_DECIMAL_RATE } from '@/lib/tax-rates';

// taxRate always from lib/tax-rates.ts — JSON value ignored to prevent stale data
const CANONICAL_TAX_RATE = GET_PASS_ON_RATE; // 4.712
const CANONICAL_TAX_DECIMAL = GET_DECIMAL_RATE; // 0.04712

interface LaborLine   { hours: string | number; rate: string | number; amount?: string | number; }
interface MaterialLine { amount: string | number; }
interface MiscFields   { [key: string]: unknown; }
interface DriveTime    { trips?: string | number; hoursPerTrip?: string | number; rate?: string | number; }
interface Markup       { overheadOverride?: string | number; profitPct?: string | number; }

interface EstimateData {
  aluminum?: MaterialLine[];
  glass?:    MaterialLine[];
  misc?:     MiscFields;
  other?:    MiscFields;
  labor?:    LaborLine[];
  driveTime?: DriveTime;
  markup?:   Markup;
  xModifier?: string | number;
  // taxRate intentionally ignored — always from lib/tax-rates.ts
}

function n(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === '') return 0;
  const parsed = parseFloat(String(v));
  return isNaN(parsed) ? 0 : parsed;
}

function sumLines(lines?: MaterialLine[]): number {
  return (lines || []).reduce((s, l) => s + n(l.amount), 0);
}

function sumMisc(obj?: MiscFields): number {
  return Object.values(obj || {}).reduce((s: number, v) => s + n(v as string | number), 0);
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { estimate: EstimateData; woId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false, errors: ['Invalid JSON body'] }, { status: 400 });
  }

  const est = body.estimate;
  if (!est || typeof est !== 'object') {
    return NextResponse.json({ valid: false, errors: ['estimate is required'] }, { status: 400 });
  }

  const errors: string[] = [];

  // ── Materials ──────────────────────────────────────────────────────────────
  const aluminumTotal = sumLines(est.aluminum);
  const glassTotal    = sumLines(est.glass);
  const miscTotal     = sumMisc(est.misc) + sumMisc(est.other);
  const materialsSubtotal = aluminumTotal + glassTotal + miscTotal;

  if (materialsSubtotal < 0) errors.push('Materials subtotal is negative');

  // ── Labor ──────────────────────────────────────────────────────────────────
  const laborLines = (est.labor || []).map(l => {
    const hrs = n(l.hours);
    const rate = n(l.rate);
    const amt = l.amount !== undefined ? n(l.amount) : hrs * rate;
    return amt;
  });
  const laborSubtotal = laborLines.reduce((s, a) => s + a, 0);

  if (laborSubtotal < 0) errors.push('Labor subtotal is negative');

  // ── Drive Time ─────────────────────────────────────────────────────────────
  const dt = est.driveTime || {};
  const driveTrips = n(dt.trips);
  const driveHrs   = n(dt.hoursPerTrip);
  const driveRate  = n(dt.rate);
  const driveTotal = driveTrips * driveHrs * driveRate;

  // ── Overhead (labor-equal method: overhead = labor + drive time) ───────────
  const overheadOverride = est.markup?.overheadOverride !== undefined && est.markup.overheadOverride !== ''
    ? n(est.markup.overheadOverride)
    : null;
  const overhead = overheadOverride !== null ? overheadOverride : (laborSubtotal + driveTotal);

  if (overhead < 0) errors.push('Overhead is negative');

  // ── Profit ─────────────────────────────────────────────────────────────────
  const profitPct = n(est.markup?.profitPct);
  if (profitPct < 0) errors.push('Profit percentage is negative');
  const baseForProfit = materialsSubtotal + laborSubtotal + driveTotal + overhead;
  const profit = baseForProfit * (profitPct / 100);

  // ── X Modifier (adjusts profit only) ──────────────────────────────────────
  const xModifier = n(est.xModifier); // positive = add, negative = reduce profit

  const adjustedProfit = profit + xModifier;

  // ── Pre-tax total ──────────────────────────────────────────────────────────
  const preTaxTotal = materialsSubtotal + laborSubtotal + driveTotal + overhead + adjustedProfit;

  if (preTaxTotal < 0) errors.push('Grand total before GET is negative');
  if (isNaN(preTaxTotal)) errors.push('Grand total calculation produced NaN');

  // ── GET (always from lib/tax-rates.ts — never from estimate JSON) ──────────
  // taxRate always from lib/tax-rates.ts — JSON value ignored to prevent stale data
  const getAmount = preTaxTotal * CANONICAL_TAX_DECIMAL;

  // ── Grand Total + Deposit ──────────────────────────────────────────────────
  const grandTotal = preTaxTotal + getAmount;
  const deposit    = grandTotal / 2;

  if (grandTotal <= 0) errors.push('Grand total must be greater than 0');

  // ── Customer-facing distribution (markup proportionally across mat+labor) ──
  const laborPlusDrive = laborSubtotal + driveTotal;
  const totalBeforeMarkup = materialsSubtotal + laborPlusDrive;
  const totalMarkup = overhead + adjustedProfit;
  const matRatio   = totalBeforeMarkup > 0 ? materialsSubtotal / totalBeforeMarkup : 0.5;
  const laborRatio = totalBeforeMarkup > 0 ? laborPlusDrive   / totalBeforeMarkup : 0.5;
  const customerMaterials = materialsSubtotal + totalMarkup * matRatio;
  const customerLabor     = laborPlusDrive   + totalMarkup * laborRatio;

  if (errors.length > 0) {
    return NextResponse.json({ valid: false, errors });
  }

  return NextResponse.json({
    valid: true,
    calculations: {
      materialsSubtotal:  Math.round(materialsSubtotal  * 100) / 100,
      laborSubtotal:      Math.round(laborSubtotal      * 100) / 100,
      driveTotal:         Math.round(driveTotal         * 100) / 100,
      overhead:           Math.round(overhead           * 100) / 100,
      profit:             Math.round(profit             * 100) / 100,
      xModifier:          Math.round(xModifier          * 100) / 100,
      adjustedProfit:     Math.round(adjustedProfit     * 100) / 100,
      preTaxTotal:        Math.round(preTaxTotal        * 100) / 100,
      taxRate:            CANONICAL_TAX_RATE,   // always 4.712
      getAmount:          Math.round(getAmount  * 100) / 100,
      grandTotal:         Math.round(grandTotal * 100) / 100,
      deposit:            Math.round(deposit    * 100) / 100,
      customerMaterials:  Math.round(customerMaterials  * 100) / 100,
      customerLabor:      Math.round(customerLabor      * 100) / 100,
    },
  });
}
