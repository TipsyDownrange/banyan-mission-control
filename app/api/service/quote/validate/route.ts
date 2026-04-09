import { NextResponse } from 'next/server';
import { GET_PASS_ON_RATE } from '@/lib/tax-rates';

type EstimateData = {
  aluminum?: Array<{ amount?: string | number | null }>;
  glass?: Array<{ amount?: string | number | null }>;
  misc?: Record<string, string | number | null | undefined>;
  miscExtra?: Array<{ amount?: string | number | null }>;
  other?: Record<string, string | number | null | undefined>;
  otherExtra?: Array<{ amount?: string | number | null }>;
  labor?: Array<{ hours?: string | number | null; rate?: string | number | null; amount?: string | number | null }>;
  driveTime?: { trips?: string | number | null; hoursPerTrip?: string | number | null; rate?: string | number | null };
  markup?: { overheadOverride?: string | number | null; profitPct?: string | number | null };
  xModifier?: string | number | null;
};

function parseMoney(value: unknown): number {
  if (value === '' || value === undefined) return 0;
  if (value === null) return NaN;
  const parsed = typeof value === 'number'
    ? value
    : parseFloat(String(value).replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function sumRecord(record: Record<string, string | number | null | undefined> = {}): number {
  return Object.values(record).reduce((sum: number, value) => sum + parseMoney(value), 0);
}

function sumAmounts(items: Array<{ amount?: string | number | null }> = []): number {
  return items.reduce((sum, item) => sum + parseMoney(item.amount), 0);
}

function hasInvalidNumber(values: Array<[string, number]>, errors: string[]) {
  for (const [label, value] of values) {
    if (!Number.isFinite(value)) {
      errors.push(`${label} is NaN or null`);
    } else if (value < 0) {
      errors.push(`${label} cannot be negative`);
    }
  }
}

export async function POST(req: Request) {
  try {
    const { estimate, woId } = await req.json();

    if (!woId || typeof woId !== 'string') {
      return NextResponse.json({ valid: false, errors: ['woId is required'] }, { status: 400 });
    }
    if (!estimate || typeof estimate !== 'object') {
      return NextResponse.json({ valid: false, errors: ['estimate is required'] }, { status: 400 });
    }

    const data = estimate as EstimateData;
    const errors: string[] = [];

    const metalTotal = sumAmounts(data.aluminum || []);
    const glassTotal = sumAmounts(data.glass || []);
    const miscTotal = sumRecord(data.misc || {}) + sumAmounts(data.miscExtra || []);
    const otherTotal = sumRecord(data.other || {}) + sumAmounts(data.otherExtra || []);

    const laborAmounts = (data.labor || []).map((line, index) => {
      const explicitAmount = parseMoney(line.amount);
      const hours = parseMoney(line.hours);
      const rate = parseMoney(line.rate);
      if (line.amount !== undefined && line.amount !== '') return ['labor.amount.' + index, explicitAmount, explicitAmount] as const;
      const derived = hours * rate;
      return ['labor.derived.' + index, derived, derived] as const;
    });
    const laborTotal = laborAmounts.reduce((sum, entry) => sum + entry[2], 0);

    const driveTrips = parseMoney(data.driveTime?.trips);
    const driveHoursPerTrip = parseMoney(data.driveTime?.hoursPerTrip);
    const driveRate = parseMoney(data.driveTime?.rate);
    const driveTotal = driveTrips * driveHoursPerTrip * driveRate;

    const subtotal = metalTotal + glassTotal + miscTotal + otherTotal + laborTotal + driveTotal;
    const overhead = data.markup?.overheadOverride !== undefined && data.markup?.overheadOverride !== ''
      ? parseMoney(data.markup?.overheadOverride)
      : laborTotal + driveTotal;
    const profitPct = parseMoney(data.markup?.profitPct ?? 10);
    const xModifier = parseMoney(data.xModifier);
    const profit = ((subtotal + overhead) * (profitPct / 100)) + xModifier;
    const totalBeforeTax = subtotal + overhead + profit;
    const getRate = GET_PASS_ON_RATE;
    const getAmount = totalBeforeTax * (getRate / 100);
    const grandTotal = totalBeforeTax + getAmount;
    const deposit = grandTotal * 0.5;

    hasInvalidNumber([
      ['materials.metalTotal', metalTotal],
      ['materials.glassTotal', glassTotal],
      ['materials.miscTotal', miscTotal],
      ['materials.otherTotal', otherTotal],
      ['labor.total', laborTotal],
      ['drive.trips', driveTrips],
      ['drive.hoursPerTrip', driveHoursPerTrip],
      ['drive.rate', driveRate],
      ['drive.total', driveTotal],
      ['markup.overhead', overhead],
      ['markup.profitPct', profitPct],
      ['markup.xModifier', xModifier],
      ['profit', profit],
      ['totalBeforeTax', totalBeforeTax],
      ['getRate', getRate],
      ['getAmount', getAmount],
      ['grandTotal', grandTotal],
      ['deposit', deposit],
    ], errors);

    for (const [label, value] of laborAmounts.map(([label, , numeric]) => [label, numeric] as [string, number])) {
      if (!Number.isFinite(value)) errors.push(`${label} is NaN or null`);
      else if (value < 0) errors.push(`${label} cannot be negative`);
    }

    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      calculations: {
        woId,
        materials: {
          metalTotal,
          glassTotal,
          miscTotal,
          otherTotal,
          total: metalTotal + glassTotal + miscTotal + otherTotal,
        },
        labor: {
          total: laborTotal,
          driveTrips,
          driveHoursPerTrip,
          driveRate,
          driveTotal,
        },
        overhead,
        profitPct,
        profit,
        getRate,
        getAmount,
        totalBeforeTax,
        grandTotal,
        deposit,
      },
    });
  } catch (err) {
    return NextResponse.json({ valid: false, errors: [err instanceof Error ? err.message : String(err)] }, { status: 500 });
  }
}
