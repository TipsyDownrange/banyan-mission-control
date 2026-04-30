import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

export const ENTITY_CROSSWALK_TAB = 'Entity_Crosswalk';
export const ENTITY_CROSSWALK_HEADERS = [
  'customer_id',
  'org_id',
  'source',
  'confidence',
  'updated_at',
];

export type CrosswalkSource = 'manual' | 'repair_panel' | 'migration';

export type CrosswalkEntry = {
  customer_id: string;
  org_id: string;
  source: CrosswalkSource;
  confidence: string;
  updated_at: string;
};

export type CrosswalkMismatch = {
  customer_id: string;
  org_ids: string[];
  count: number;
  entries: CrosswalkEntry[];
};

type SheetsClient = ReturnType<typeof google.sheets>;

const SHEET_ID = getBackendSheetId();

export function getCrosswalkSheets(readonly = false) {
  const auth = getGoogleAuth([
    readonly
      ? 'https://www.googleapis.com/auth/spreadsheets.readonly'
      : 'https://www.googleapis.com/auth/spreadsheets',
  ]);
  return google.sheets({ version: 'v4', auth });
}

export function normalizeCrosswalkSource(value: unknown): CrosswalkSource {
  if (value === 'manual' || value === 'repair_panel' || value === 'migration') return value;
  return 'manual';
}

export function normalizeConfidence(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '1';
  return String(Math.max(0, Math.min(1, parsed)));
}

function rowToEntry(row: string[]): CrosswalkEntry {
  return {
    customer_id: (row[0] || '').trim(),
    org_id: (row[1] || '').trim(),
    source: normalizeCrosswalkSource((row[2] || '').trim()),
    confidence: (row[3] || '').trim(),
    updated_at: (row[4] || '').trim(),
  };
}

export async function ensureEntityCrosswalkSheet(sheets: SheetsClient): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = (meta.data.sheets || []).some(sheet => sheet.properties?.title === ENTITY_CROSSWALK_TAB);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ENTITY_CROSSWALK_TAB } } }],
      },
    });
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${ENTITY_CROSSWALK_TAB}!A1:E1`,
  });
  const header = headerRes.data.values?.[0] || [];
  const matches = ENTITY_CROSSWALK_HEADERS.every((expected, idx) => header[idx] === expected);
  if (!matches) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${ENTITY_CROSSWALK_TAB}!A1:E1`,
      valueInputOption: 'RAW',
      requestBody: { values: [ENTITY_CROSSWALK_HEADERS] },
    });
  }
}

export async function loadCrosswalkEntries(
  sheets: SheetsClient,
  customerId?: string,
): Promise<CrosswalkEntry[]> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${ENTITY_CROSSWALK_TAB}!A2:E5000`,
    });
    return (res.data.values || [])
      .map(row => rowToEntry(row as string[]))
      .filter(entry => entry.customer_id && entry.org_id)
      .filter(entry => !customerId || entry.customer_id === customerId);
  } catch {
    return [];
  }
}

export async function loadCrosswalkByCustomer(sheets: SheetsClient): Promise<Map<string, CrosswalkEntry>> {
  const entries = await loadCrosswalkEntries(sheets);
  const map = new Map<string, CrosswalkEntry>();
  for (const entry of entries) map.set(entry.customer_id, entry);
  return map;
}

export function findCrosswalkMismatches(entries: CrosswalkEntry[]): CrosswalkMismatch[] {
  const byCustomer = new Map<string, CrosswalkEntry[]>();
  for (const entry of entries) {
    const group = byCustomer.get(entry.customer_id) || [];
    group.push(entry);
    byCustomer.set(entry.customer_id, group);
  }

  return Array.from(byCustomer.entries())
    .map(([customerId, customerEntries]) => {
      const orgIds = Array.from(new Set(customerEntries.map(entry => entry.org_id))).sort();
      return {
        customer_id: customerId,
        org_ids: orgIds,
        count: customerEntries.length,
        entries: customerEntries,
      };
    })
    .filter(group => group.org_ids.length > 1);
}

export async function buildCrosswalkDiagnostics(
  sheets: SheetsClient,
  entries: CrosswalkEntry[],
): Promise<{
  total_work_orders: number;
  missing_org_with_customer_id: number;
  auto_hydrated_work_orders: number;
  auto_hydrated_pct_of_all_wos: number;
  auto_hydrated_pct_of_missing_org_with_customer_id: number;
  mismatches: CrosswalkMismatch[];
}> {
  const crosswalkByCustomer = new Map<string, CrosswalkEntry>();
  for (const entry of entries) crosswalkByCustomer.set(entry.customer_id, entry);

  const woRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Service_Work_Orders!A2:AR5000',
  });
  const woRows = (woRes.data.values || []) as string[][];
  const dataRows = woRows.filter(row => row[0] || row[2]);
  const missingOrgWithCustomer = dataRows.filter(row => {
    const orgId = (row[42] || '').trim();
    const customerId = (row[43] || '').trim();
    return !orgId && !!customerId;
  });
  const hydrated = missingOrgWithCustomer.filter(row => crosswalkByCustomer.has((row[43] || '').trim()));

  const pct = (part: number, whole: number) => whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : 0;

  return {
    total_work_orders: dataRows.length,
    missing_org_with_customer_id: missingOrgWithCustomer.length,
    auto_hydrated_work_orders: hydrated.length,
    auto_hydrated_pct_of_all_wos: pct(hydrated.length, dataRows.length),
    auto_hydrated_pct_of_missing_org_with_customer_id: pct(hydrated.length, missingOrgWithCustomer.length),
    mismatches: findCrosswalkMismatches(entries),
  };
}

export async function upsertCrosswalkEntry(
  sheets: SheetsClient,
  entry: Omit<CrosswalkEntry, 'updated_at'> & { updated_at?: string },
): Promise<CrosswalkEntry> {
  const cleanEntry: CrosswalkEntry = {
    customer_id: entry.customer_id.trim(),
    org_id: entry.org_id.trim(),
    source: normalizeCrosswalkSource(entry.source),
    confidence: normalizeConfidence(entry.confidence),
    updated_at: entry.updated_at || new Date().toISOString(),
  };

  if (!cleanEntry.customer_id) throw new Error('customer_id required');
  if (!cleanEntry.org_id) throw new Error('org_id required');

  await ensureEntityCrosswalkSheet(sheets);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${ENTITY_CROSSWALK_TAB}!A2:E5000`,
  });
  const rows = (res.data.values || []) as string[][];
  const existingIdx = rows.findIndex(row => (row[0] || '').trim() === cleanEntry.customer_id);
  const values = [[
    cleanEntry.customer_id,
    cleanEntry.org_id,
    cleanEntry.source,
    cleanEntry.confidence,
    cleanEntry.updated_at,
  ]];

  if (existingIdx >= 0) {
    const sheetRow = existingIdx + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${ENTITY_CROSSWALK_TAB}!A${sheetRow}:E${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${ENTITY_CROSSWALK_TAB}!A:E`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  }

  return cleanEntry;
}
