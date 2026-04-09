import { hawaiiToday } from '@/lib/hawaii-time';
import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { fireAndForgetCustomerUpdate } from '@/lib/updateCustomerRecord';
import {
  calculateSiteVisitFee, getJobTypeDefaults, listJobTypes,
  LABOR_RATES, GET_RATE, estimateDriveTime, DEFAULT_SERVICE_CREW,
} from '@/lib/labor';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// Column indices in Service_Work_Orders tab (0-based, row starts at A)
const COL = {
  wo_id:          0,
  wo_number:      1,
  name:           2,
  description:    3,
  status:         4,
  island:         5,
  address:        7,
  contact_person: 8,
  contact_phone:  10,
  contact_email:  11,
  customer_name:  12,
  system_type:    13,
  assigned_to:    14,
  scheduled_date: 17,
};

// Fetch a single WO from the backend Google Sheet by WO number or wo_id
async function fetchWO(woNumber: string) {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Service_Work_Orders!A2:AB2000',
  });
  const rows = res.data.values || [];
  const row = rows.find(r =>
    (r[COL.wo_number] || '') === woNumber || (r[COL.wo_id] || '') === woNumber
  );
  if (!row) return null;
  const g = (i: number) => (row[i] || '') as string;
  return {
    wo_id:          g(COL.wo_id),
    wo_number:      g(COL.wo_number),
    name:           g(COL.name),
    description:    g(COL.description),
    status:         g(COL.status),
    island:         g(COL.island),
    address:        g(COL.address),
    contact_person: g(COL.contact_person),
    contact_phone:  g(COL.contact_phone),
    contact_email:  g(COL.contact_email),
    assigned_to:    g(COL.assigned_to),
    scheduled_date: g(COL.scheduled_date),
    customer_name:  g(COL.customer_name),
    system_type:    g(COL.system_type),
  };
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

    const wo = await fetchWO(woNumber);
    if (!wo) return NextResponse.json({ error: `WO ${woNumber} not found` }, { status: 404 });

    // Extract key fields
    const address    = wo.address;
    const island     = wo.island || 'Maui';
    const contact    = [wo.contact_person, wo.contact_phone].filter(Boolean).join(' · ');
    const name       = wo.name;
    const desc       = wo.description;
    const assignedTo = wo.assigned_to;

    // Calculate site visit fee defaults
    const siteVisit = calculateSiteVisitFee({ address, island });

    // Estimate drive time for display
    const driveEst  = estimateDriveTime(address, island);

    // Default labor estimate (null if no job type match)
    const suggestedLabor = null; // Will be populated when job type is selected

    return NextResponse.json({
      wo: {
        woNumber,
        wo_id: wo.wo_id,
        name,
        address,
        island,
        contact,
        contactPhone: wo.contact_phone,
        contactEmail: wo.contact_email,
        customerName: wo.customer_name,
        systemType: wo.system_type,
        description: desc,
        assignedTo,
        status: wo.status,
        scheduledDate: wo.scheduled_date,
      },
      defaults: {
        crewCount: DEFAULT_SERVICE_CREW.count,
        hourlyRate: LABOR_RATES.journeyman,
        journeymanRate: LABOR_RATES.journeyman,
        leadpersonRate: LABOR_RATES.leadperson,
        getRate: Math.round(GET_RATE * 100 * 1000) / 1000,  // 4.712 (clean, no float noise)
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

    // ORPHAN cols 16,17,19,20,21 — frozen do not write
    // hours_estimated (col 19 / T) write-back removed: canonical hours live in Install_Steps.Allotted_Hours

    return NextResponse.json({
      quote: {
        woNumber,
        quoteDate: hawaiiToday(),
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
        overheadAmt,
        profitAmt,
        getRate: Math.round(GET_RATE * 100 * 1000) / 1000,  // 4.712 (clean, no float noise)
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
