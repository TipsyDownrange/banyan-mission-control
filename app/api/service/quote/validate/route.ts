import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

type EstimateData = {
  aluminum?: Array<{ amount?: string | number | null }>;
  glass?: Array<{ amount?: string | number | null }>;
  misc?: Record<string, string | number | null | undefined>;
  miscExtra?: Array<{ amount?: string | number | null }>;
  other?: Record<string, string | number | null | undefined>;
  otherExtra?: Array<{ amount?: string | number | null }>;
  labor?: Array<{
    hours?: string | number | null;
    rate?: string | number | null;
    amount?: string | number | null;
  }>;
  driveTime?: {
    trips?: string | number | null;
    hoursPerTrip?: string | number | null;
    rate?: string | number | null;
  };
  markup?: {
    overheadOverride?: string | number | null;
    profitPct?: string | number | null;
  };
  xModifier?: string | number | null;
  taxRate?: string | number | null;
};

function parseAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number'
    ? value
    : parseFloat(String(value).replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function collectRecord(values: Record<string, string | number | null | undefined> | undefined): number {
  return Object.values(values || {}).reduce((sum: number, value) => sum + parseAmount(value), 0);
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false, errors: ['Invalid JSON body'] }, { status: 400 });
  }

  const estimate = ((body as { estimate?: EstimateData })?.estimate || body) as EstimateData;
  if (!estimate || typeof estimate !== 'object') {
    return NextResponse.json({ valid: false, errors: ['Estimate JSON is required'] }, { status: 400 });
  }

  const errors: string[] = [];
  const checkNonNegative = (label: string, value: number) => {
    if (Number.isNaN(value)) errors.push(`${label} is NaN`);
    else if (value < 0) errors.push(`${label} cannot be negative`);
  };

  if (estimate.taxRate === null || estimate.taxRate === undefined || estimate.taxRate === '') {
    errors.push('taxRate is required');
  }

  for (const [index, item] of (estimate.aluminum || []).entries()) checkNonNegative(`aluminum[${index}].amount`, parseAmount(item.amount));
  for (const [index, item] of (estimate.glass || []).entries()) checkNonNegative(`glass[${index}].amount`, parseAmount(item.amount));
  for (const [index, item] of (estimate.miscExtra || []).entries()) checkNonNegative(`miscExtra[${index}].amount`, parseAmount(item.amount));
  for (const [index, item] of (estimate.otherExtra || []).entries()) checkNonNegative(`otherExtra[${index}].amount`, parseAmount(item.amount));
  for (const [key, value] of Object.entries(estimate.misc || {})) checkNonNegative(`misc.${key}`, parseAmount(value));
  for (const [key, value] of Object.entries(estimate.other || {})) checkNonNegative(`other.${key}`, parseAmount(value));

  const laborBase = (estimate.labor || []).reduce((sum, line, index) => {
    const hours = parseAmount(line.hours);
    const rate = parseAmount(line.rate);
    const amount = line.amount === undefined || line.amount === null || line.amount === '' ? hours * rate : parseAmount(line.amount);
    checkNonNegative(`labor[${index}].hours`, hours);
    checkNonNegative(`labor[${index}].rate`, rate);
    checkNonNegative(`labor[${index}].amount`, amount);
    return sum + amount;
  }, 0);

  const driveTrips = parseAmount(estimate.driveTime?.trips);
  const driveHoursPerTrip = parseAmount(estimate.driveTime?.hoursPerTrip);
  const driveRate = parseAmount(estimate.driveTime?.rate);
  checkNonNegative('driveTime.trips', driveTrips);
  checkNonNegative('driveTime.hoursPerTrip', driveHoursPerTrip);
  checkNonNegative('driveTime.rate', driveRate);

  const materialsSubtotal =
    (estimate.aluminum || []).reduce((sum, item) => sum + parseAmount(item.amount), 0) +
    (estimate.glass || []).reduce((sum, item) => sum + parseAmount(item.amount), 0) +
    collectRecord(estimate.misc) +
    (estimate.miscExtra || []).reduce((sum, item) => sum + parseAmount(item.amount), 0) +
    collectRecord(estimate.other) +
    (estimate.otherExtra || []).reduce((sum, item) => sum + parseAmount(item.amount), 0);

  const driveTotal = driveTrips * driveHoursPerTrip * driveRate;
  const laborSubtotal = laborBase + driveTotal;
  const overhead = estimate.markup?.overheadOverride !== undefined && estimate.markup?.overheadOverride !== null && estimate.markup?.overheadOverride !== ''
    ? parseAmount(estimate.markup.overheadOverride)
    : laborSubtotal;
  const profitPct = estimate.markup?.profitPct === undefined || estimate.markup?.profitPct === null || estimate.markup?.profitPct === ''
    ? 10
    : parseAmount(estimate.markup.profitPct);
  const xModifier = estimate.xModifier === undefined || estimate.xModifier === null || estimate.xModifier === ''
    ? 0
    : parseAmount(estimate.xModifier);
  const profit = ((materialsSubtotal + laborSubtotal + overhead) * (profitPct / 100)) + xModifier;
  const getRate = parseAmount(estimate.taxRate);
  const getAmount = (materialsSubtotal + laborSubtotal + overhead + profit) * (getRate / 100);
  const grandTotal = materialsSubtotal + laborSubtotal + overhead + profit + getAmount;
  const deposit = grandTotal * 0.5;

  for (const [label, value] of Object.entries({ materialsSubtotal, laborSubtotal, overhead, profit, getAmount, grandTotal, deposit })) {
    if (value === null || value === undefined || Number.isNaN(value)) errors.push(`${label} is invalid`);
  }
  checkNonNegative('materialsSubtotal', materialsSubtotal);
  checkNonNegative('laborSubtotal', laborSubtotal);
  checkNonNegative('overhead', overhead);
  checkNonNegative('getAmount', getAmount);
  checkNonNegative('grandTotal', grandTotal);
  checkNonNegative('deposit', deposit);

  if (errors.length > 0) {
    return NextResponse.json({ valid: false, errors }, { status: 400 });
  }

  return NextResponse.json({
    valid: true,
    calculations: {
      materialsSubtotal,
      laborSubtotal,
      overhead,
      profit,
      getAmount,
      grandTotal,
      deposit,
    },
  });
}
