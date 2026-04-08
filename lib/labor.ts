// ─── Union Labor Rates (Effective July 1, 2025) ───────────────────────────────
// Source: Glaziers Union Local 1889 Exhibit A

export const LABOR_RATES = {
  journeyman:  120.00, // bid rate $/hr (default)
  leadperson:  125.00, // lead/foreman bid rate
  apprentice_70: 95.00, // apprentice bid rate (senior)
  apprentice_50: 80.00, // apprentice bid rate (entry)
};

// Default crew for service quoting
export const DEFAULT_SERVICE_CREW = {
  count: 2,
  rate: LABOR_RATES.journeyman,
  label: '2-Person Crew',
};

// GET rate
// Hawaii GET pass-on rate — all counties 4.712% through 12/31/2030
// Source: tax.hawaii.gov/geninfo/countysurcharge/
export const GET_RATE = 0.04712;

// ─── Drive Time Estimates ─────────────────────────────────────────────────────
// From shop: 289 Pakana St, Wailuku HI 96793
// Round-trip hours (drive only, not work time)

type DriveEstimate = {
  roundTripHours: number;
  description: string;
  source: 'maps_api' | 'table';
};

// Island zone table — fallback when Maps API not available
const MAUI_ZONES: { keywords: string[]; roundTripHours: number; description: string }[] = [
  { keywords: ['wailuku', 'kahului', 'puunene'],      roundTripHours: 0.5,  description: 'Central Maui (Wailuku/Kahului)' },
  { keywords: ['kihei', 'wailea', 'makena', 'maalaea'], roundTripHours: 1.0, description: 'South Maui (Kihei/Wailea)' },
  { keywords: ['lahaina', 'kaanapali', 'kapalua', 'napili', 'honokowai'], roundTripHours: 2.0, description: 'West Maui (Lahaina/Ka\'anapali)' },
  { keywords: ['paia', 'haiku', 'makawao', 'pukalani', 'kula'],           roundTripHours: 1.5, description: 'Upcountry/North Shore' },
  { keywords: ['hana'],                               roundTripHours: 6.0,  description: 'East Maui (Hana)' },
];

const OAHU_ZONES: { keywords: string[]; roundTripHours: number; description: string }[] = [
  { keywords: ['honolulu', 'downtown', 'kakaako', 'queen'],  roundTripHours: 1.0, description: 'Honolulu/Downtown' },
  { keywords: ['kailua', 'kaneohe', 'windward'],              roundTripHours: 1.5, description: 'Windward Oahu' },
  { keywords: ['kapolei', 'ewa', 'ko olina'],                 roundTripHours: 1.5, description: 'West Oahu' },
  { keywords: ['north shore', 'haleiwa', 'wahiawa'],          roundTripHours: 2.0, description: 'North Shore' },
  { keywords: ['hawaii kai', 'portlock', 'waimanalo'],        roundTripHours: 1.5, description: 'East Honolulu' },
];

export function estimateDriveTime(address: string, island: string): DriveEstimate {
  const addr = address.toLowerCase();

  const zones = island === 'Oahu' ? OAHU_ZONES : MAUI_ZONES;
  for (const zone of zones) {
    if (zone.keywords.some(kw => addr.includes(kw))) {
      return { roundTripHours: zone.roundTripHours, description: zone.description, source: 'table' };
    }
  }

  // Default by island
  const defaults: Record<string, { hours: number; desc: string }> = {
    Maui:    { hours: 1.5, desc: 'Maui (estimated)' },
    Oahu:    { hours: 1.5, desc: 'Oahu (estimated)' },
    Kauai:   { hours: 1.0, desc: 'Kauai (estimated)' },
    Hawaii:  { hours: 1.5, desc: 'Big Island (estimated)' },
  };
  const def = defaults[island] || { hours: 1.5, desc: 'Island (estimated)' };
  return { roundTripHours: def.hours, description: def.desc, source: 'table' };
}

// ─── Site Visit Fee Calculator ────────────────────────────────────────────────

export type SiteVisitFee = {
  crewCount: number;
  hourlyRate: number;
  driveHours: number;
  siteHours: number;    // time on site for measurement
  totalHours: number;
  subtotal: number;
  description: string;
  isOverride: boolean;
};

export function calculateSiteVisitFee(params: {
  address: string;
  island: string;
  crewCount?: number;      // default 2
  hourlyRate?: number;     // default journeyman full burden
  siteHours?: number;      // default 1hr on site
  overrideTotal?: number;  // manual override
}): SiteVisitFee {
  const crewCount   = params.crewCount   ?? 2;
  const hourlyRate  = params.hourlyRate  ?? LABOR_RATES.journeyman;
  const siteHours   = params.siteHours   ?? 1.0;

  if (params.overrideTotal !== undefined) {
    return {
      crewCount, hourlyRate, driveHours: 0, siteHours, totalHours: 0,
      subtotal: params.overrideTotal,
      description: 'Site visit fee (fixed)',
      isOverride: true,
    };
  }

  const drive = estimateDriveTime(params.address, params.island);
  const totalHours = drive.roundTripHours + siteHours;
  const subtotal = crewCount * hourlyRate * totalHours;

  return {
    crewCount,
    hourlyRate,
    driveHours: drive.roundTripHours,
    siteHours,
    totalHours,
    subtotal: Math.ceil(subtotal / 50) * 50, // round up to nearest $50
    description: `${crewCount} Journeyman × ${totalHours.toFixed(1)}h (${drive.roundTripHours}h drive + ${siteHours}h site) — ${drive.description}`,
    isOverride: false,
  };
}

// ─── Default Labor Hours by Job Type ─────────────────────────────────────────
// Based on industry standard service work. Will be replaced by Gold Dataset
// as historical data accumulates.

export type JobTypeEstimate = {
  jobType: string;
  crewCount: number;
  hours: number;
  totalHours: number; // crewCount × hours
  totalLaborCost: number;
  notes: string;
  confidence: 'gold_data' | 'industry_standard' | 'estimate';
};

const JOB_DEFAULTS: Record<string, { crew: number; hours: number; notes: string }> = {
  // Glass replacement
  'IGU Replacement — residential':        { crew: 2, hours: 2.0,  notes: 'Standard residential IGU, ground floor' },
  'IGU Replacement — commercial':         { crew: 2, hours: 3.0,  notes: 'Commercial IGU, may require lift' },
  'Tempered glass panel':                 { crew: 2, hours: 2.5,  notes: 'Single tempered panel' },
  'Laminated glass':                      { crew: 2, hours: 3.0,  notes: 'Laminated — heavier, more care required' },
  'Mirror supply & install':              { crew: 2, hours: 2.0,  notes: 'Standard wall mirror' },
  'Shower enclosure':                     { crew: 2, hours: 4.0,  notes: 'Full shower glass install' },
  'Tabletop glass':                       { crew: 1, hours: 1.0,  notes: 'Deliver and set only' },

  // Door work
  'Storefront door — repair':             { crew: 2, hours: 3.0,  notes: 'Adjust/repair existing door' },
  'Storefront door — replace':            { crew: 2, hours: 5.0,  notes: 'Full door replacement' },
  'Automatic door — repair':             { crew: 2, hours: 4.0,  notes: 'SW200 or similar operator' },
  'Automatic door — replace':            { crew: 3, hours: 8.0,  notes: 'Full unit swap, may need equipment' },
  'Door closer — replace':               { crew: 2, hours: 2.0,  notes: 'Standard door closer' },
  'Hardware — repair/adjust':            { crew: 1, hours: 2.0,  notes: 'Lock, handle, pivot' },

  // Skylights
  'Skylight — IGU replacement':          { crew: 3, hours: 6.0,  notes: 'Roof access, safety equipment required' },
  'Skylight — frame repair':             { crew: 2, hours: 4.0,  notes: 'Roof access' },

  // Storefront / window wall
  'Storefront — glass replacement':      { crew: 2, hours: 3.0,  notes: 'Single storefront lite' },
  'Window — residential replace':        { crew: 2, hours: 3.0,  notes: 'Single residential window' },
  'Sealant / caulking':                  { crew: 1, hours: 2.0,  notes: 'Per elevation / linear run' },

  // Site visit only
  'Site visit — measure only':           { crew: 2, hours: 0,    notes: 'Drive time only, no install' },
};

export function getJobTypeDefaults(
  jobType: string,
  rate: number = LABOR_RATES.journeyman
): JobTypeEstimate | null {
  const def = JOB_DEFAULTS[jobType];
  if (!def) return null;

  const totalHours = def.crew * def.hours;
  return {
    jobType,
    crewCount: def.crew,
    hours: def.hours,
    totalHours,
    totalLaborCost: totalHours * rate,
    notes: def.notes,
    confidence: 'industry_standard',
  };
}

export function listJobTypes(): string[] {
  return Object.keys(JOB_DEFAULTS);
}
