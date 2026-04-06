import { NextResponse } from 'next/server';
import { getSSToken } from '@/lib/gauth';
import { fireAndForgetCustomerUpdate } from '@/lib/updateCustomerRecord';
import {
  calculateSiteVisitFee, getJobTypeDefaults, listJobTypes,
  LABOR_RATES, GET_RATE, estimateDriveTime, DEFAULT_SERVICE_CREW,
} from '@/lib/labor';

const WO_SHEET_ID = '7905619916154756'; // Active WOs

// Fetch a single WO from Smartsheet by WO number
async function fetchWO(token: string, woNumber: string) {
  const res = await fetch(
    `https://api.smartsheet.com/2.0/sheets/${WO_SHEET_ID}?pageSize=200`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const sheet = await res.json() as {
    columns?: { id: number; title: string }[];
    rows?: { id: number; cells: { columnId: number; value?: unknown; displayValue?: string }[] }[];
  };

  const cols: Record<number, string> = {};
  for (const c of sheet.columns || []) cols[c.id] = c.title;

  const WO_COL = Object.entries(cols).find(([, v]) => v === 'WORK ORDER #')?.[0];
  const row = sheet.rows?.find(r =>
    r.cells.some(c => String(c.value || c.displayValue || '') === woNumber && String(c.columnId) === WO_COL)
  );
  if (!row) return null;

  const rd: Record<string, string> = {};
  for (const cell of row.cells) {
    if (cols[cell.columnId]) rd[cols[cell.columnId]] = cell.displayValue || String(cell.value ?? '');
  }
  const result: Record<string, unknown> = { rowId: row.id, ...rd };
  return result;
}

// GET /api/service/quote?wo=26-2040 — fetch WO + auto-calculated defaults
// POST /api/service/quote — submit overrides + generate final quote data
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const woNumber = searchParams.get('wo') || '';

    // Return list of job types for UI dropdown
    if (searchParams.get('job_types') === '1') {
      return NextResponse.json({ jobTypes: listJobTypes(), rates: LABOR_RATES });
    }

    if (!woNumber) return NextResponse.json({ error: 'wo parameter required' }, { status: 400 });

    const token = getSSToken();
    const woRaw = await fetchWO(token, woNumber);
    if (!woRaw) return NextResponse.json({ error: `WO ${woNumber} not found` }, { status: 404 });
    const wo = woRaw as Record<string, unknown>;

    // Extract key fields
    const address   = String(wo['ADDRESS'] || '');
    const island    = String(wo['Area of island'] || 'Maui');
    const contact   = String(wo['CONTACT #'] || '');
    const name      = String(wo['Task Name / Job Name'] || wo['Job Name/WO Number'] || '');
    const desc      = String(wo['DESCRIPTION'] || '');
    const assignedTo = String(wo['Assigned To'] || '');

    // Calculate site visit fee defaults
    const siteVisit = calculateSiteVisitFee({ address, island });

    // Estimate drive time for display
    const driveEst  = estimateDriveTime(address, island);

    // Default labor estimate (null if no job type match)
    const suggestedLabor = null; // Will be populated when job type is selected

    return NextResponse.json({
      wo: {
        woNumber,
        rowId: woRaw?.rowId,
        name,
        address,
        island,
        contact,
        description: desc,
        assignedTo,
        status: String(wo['Status'] || ''),
        scheduledDate: String(wo['Scheduled Date'] || ''),
      },
      defaults: {
        crewCount: DEFAULT_SERVICE_CREW.count,
        hourlyRate: LABOR_RATES.journeyman,
        journeymanRate: LABOR_RATES.journeyman,
        leadpersonRate: LABOR_RATES.leadperson,
        getRate: GET_RATE,
        siteVisit,
        driveEstimate: driveEst,
        suggestedLabor,
      },
      jobTypes: listJobTypes(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      woNumber,
      // Customer info (from WO or manually entered)
      customerName, customerEmail, customerPhone, customerAddress,
      projectDescription,
      siteAddress, island,
      // Scope
      scopeNarrative,
      lineItems,        // [{ qty, description }]
      jobType,          // for default labor lookup
      // Labor
      crewCount,        // override
      hourlyRate,       // override
      laborHours,       // override — total hours on site (not including drive)
      // Site visit
      includeSiteVisit,
      siteVisitOverride, // null = auto-calculate, number = fixed override
      siteVisitCredit,  // true if customer already paid deposit
      // Pricing
      materialsTotal,   // sum of all material costs
      equipmentCharges, // lift, scissor lift, etc.
      additionalCharges,// [{ label, amount }]
      // Exclusions
      additionalExclusions,
      installationIncluded,
      validityDays,     // default 30
    } = body;

    if (!island || !siteAddress) {
      return NextResponse.json({ error: 'island and siteAddress required' }, { status: 400 });
    }

    // Fire-and-forget customer DB backfeed — never blocks quote generation
    if (customerName || customerPhone || customerEmail) {
      fireAndForgetCustomerUpdate({
        name:    customerName,
        phone:   customerPhone,
        email:   customerEmail,
        address: customerAddress,
        island:  island,
        source:  'quote',
      });
    }

    // ─── Labor calculation ────────────────────────────────────────────────────
    const crew     = crewCount   ?? DEFAULT_SERVICE_CREW.count;
    const rate     = hourlyRate  ?? LABOR_RATES.journeyman;

    // Get default hours from job type if not overridden
    let onSiteHours = laborHours;
    let laborConfidence: string = 'manual';
    if (!onSiteHours && jobType) {
      const defaults = getJobTypeDefaults(jobType, rate);
      if (defaults) {
        onSiteHours = defaults.hours;
        laborConfidence = defaults.confidence;
      }
    }
    onSiteHours = onSiteHours ?? 2; // absolute fallback

    // Use v2 labor subtotal if provided, otherwise calculate from crew/rate/hours
    const v2LaborSubtotal = body.laborSubtotal;
    const laborSubtotal = (typeof v2LaborSubtotal === 'number' && v2LaborSubtotal > 0) ? v2LaborSubtotal : crew * rate * onSiteHours;

    // ─── Site visit fee ───────────────────────────────────────────────────────
    let siteVisitFee = 0;
    let siteVisitDetail = '';
    if (includeSiteVisit) {
      const sv = calculateSiteVisitFee({
        address: siteAddress,
        island,
        crewCount: crew,
        hourlyRate: rate,
        overrideTotal: siteVisitOverride ?? undefined,
      });
      siteVisitFee = sv.subtotal;
      siteVisitDetail = sv.description;
    }

    // ─── Totals ───────────────────────────────────────────────────────────────
    const materials  = materialsTotal   ?? 0;
    const equipment  = equipmentCharges ?? 0;
    const extras     = (additionalCharges ?? []).reduce((s: number, c: { amount: number }) => s + c.amount, 0);
    const creditAmt  = siteVisitCredit ? siteVisitFee : 0;

    // Use v2 totals if provided (QuoteBuilder v2 calculates everything client-side including overhead+profit)
    const v2Subtotal = body.subtotal;
    const v2GrandTotal = body.grandTotal;
    const v2GetAmt = body.getAmt;
    const v2OverheadAmt = body.overheadAmt;
    const v2ProfitAmt = body.profitAmt;
    const v2DriveTimeCost = body.driveTimeCost;

    const rawSubtotal = materials + laborSubtotal + equipment + extras + (v2DriveTimeCost || 0) + siteVisitFee - creditAmt;
    const subtotal   = (typeof v2Subtotal === 'number' && v2Subtotal > 0) ? v2Subtotal : rawSubtotal;
    const overheadAmt = (typeof v2OverheadAmt === 'number') ? v2OverheadAmt : 0;
    const profitAmt   = (typeof v2ProfitAmt === 'number') ? v2ProfitAmt : 0;
    const totalBeforeTax = subtotal + overheadAmt + profitAmt;
    const getAmount  = (typeof v2GetAmt === 'number' && v2GetAmt > 0) ? v2GetAmt : Math.round(totalBeforeTax * GET_RATE * 100) / 100;
    const total      = (typeof v2GrandTotal === 'number' && v2GrandTotal > 0) ? v2GrandTotal : Math.round((totalBeforeTax + getAmount) * 100) / 100;
    const deposit    = Math.round(total * 0.5 * 100) / 100;

    // ─── Standard exclusions ─────────────────────────────────────────────────
    const standardExclusions = [
      'Bond Premium',
      'Extended Warranty',
      'Barricades',
      'Protection',
      'Aluminum frame',
      'Cleaning',
      'Testing',
      'Insurance Exceeding (1) Million',
    ];
    if (!installationIncluded) standardExclusions.push('Installation');

    return NextResponse.json({
      quote: {
        woNumber,
        quoteDate: new Date().toISOString().slice(0, 10),
        customerName, customerEmail, customerPhone, customerAddress,
        projectDescription,
        siteAddress, island,
        scopeNarrative,
        lineItems: lineItems ?? [],
        installationIncluded: installationIncluded ?? true,
        // Labor
        labor: {
          crewCount: crew,
          hourlyRate: rate,
          onSiteHours,
          subtotal: laborSubtotal,
          jobType: jobType || null,
          confidence: laborConfidence,
        },
        // Site visit
        siteVisit: includeSiteVisit ? {
          fee: siteVisitFee,
          detail: siteVisitDetail,
          creditApplied: creditAmt,
          isOverride: siteVisitOverride != null,
        } : null,
        // Materials & other
        materialsTotal: materials,
        equipmentCharges: equipment,
        additionalCharges: additionalCharges ?? [],
        // Totals
        subtotal,
        getRate: GET_RATE,
        getAmount,
        total,
        deposit,
        balanceDue: total - deposit,
        // Terms
        exclusions: [...standardExclusions, ...(additionalExclusions ?? [])],
        validityDays: validityDays ?? 30,
        terms: {
          deposit: `Customer signed proposal along with 50% deposit ($${deposit.toLocaleString()}) is needed, prior to ordering material or starting fabrication.`,
          validity: `This proposal is subject to revisions if not accepted within ${validityDays ?? 30} days after date.`,
          confirmation: `Confirmation of layout & dimensions is to be provided prior to ordering or fabricating any custom materials.`,
        },
        // Prepared by (from session in real impl)
        preparedBy: {
          name: 'Joey Ritthaler',
          email: 'joey@kulaglass.com',
          phone: '808-242-8999 ext. 22',
        },
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
