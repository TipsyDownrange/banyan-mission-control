import {
  SERVICE_WORK_ORDERS_CONTRACT,
  SERVICE_WORK_ORDERS_COL_COUNT,
} from './service-work-orders';

export type ServiceWorkOrdersHeaderShape =
  | 'contract_v2_metadata_first'
  | 'legacy_qbo_first'
  | 'mixed_drift'
  | 'unknown';

export type ServiceWorkOrdersRowShape =
  | 'metadata_first'
  | 'legacy_qbo_first'
  | 'mixed_drift'
  | 'empty'
  | 'unknown';

export interface ServiceWorkOrdersHeaderDriftReport {
  shape: ServiceWorkOrdersHeaderShape;
  columnCount: number;
  expectedColumnCount: number;
  mismatches: Array<{
    index: number;
    letter: string;
    expected: string;
    actual: string;
  }>;
  notes: string[];
}

export interface ServiceWorkOrdersRowShapeReport {
  shape: ServiceWorkOrdersRowShape;
  aaToAhNonEmpty: number;
  metadataSignals: number;
  qboSignals: number;
  depositSignals: number;
  notes: string[];
}

const HEADER_V2_AA_AH = [
  'created_at',
  'updated_at',
  'source',
  'qbo_invoice_id',
  'invoice_number',
  'invoice_total',
  'invoice_balance',
  'invoice_date',
] as const;

export const LEGACY_QBO_FIRST_AA_AH = [
  'qbo_invoice_id',
  'invoice_number',
  'invoice_total',
  'invoice_balance',
  'invoice_date',
  'deposit_status',
  'deposit_amount',
  'deposit_invoice_num',
] as const;

const IDENTITY_CASE_DRIFT = new Map([
  ['Customer_ID', 'customer_id'],
  ['Legacy_Flag', 'legacy_flag'],
]);

export function canonicalServiceWorkOrdersHeaders(): string[] {
  return SERVICE_WORK_ORDERS_CONTRACT
    .filter(col => !col.legacy_alias)
    .sort((a, b) => a.index - b.index)
    .map(col => col.name);
}

export function classifyServiceWorkOrdersHeader(
  actualHeaders: readonly (string | undefined | null)[],
): ServiceWorkOrdersHeaderDriftReport {
  const actual = actualHeaders.map(value => String(value || '').trim());
  const expected = canonicalServiceWorkOrdersHeaders();
  const mismatches: ServiceWorkOrdersHeaderDriftReport['mismatches'] = [];
  const notes: string[] = [];

  for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
    const expectedName = expected[i] || '';
    const actualName = actual[i] || '';
    if (expectedName !== actualName) {
      mismatches.push({
        index: i,
        letter: columnLetter(i),
        expected: expectedName,
        actual: actualName,
      });
    }
  }

  const aaAh = actual.slice(26, 34);
  const matchesV2 = sameList(aaAh, HEADER_V2_AA_AH);
  const matchesLegacy = sameList(aaAh, LEGACY_QBO_FIRST_AA_AH);
  const onlyCaseIdentityDrift = mismatches.length > 0 && mismatches.every(item => IDENTITY_CASE_DRIFT.get(item.actual) === item.expected);

  let shape: ServiceWorkOrdersHeaderShape = 'unknown';
  if (actual.length !== SERVICE_WORK_ORDERS_COL_COUNT) {
    shape = 'unknown';
    notes.push(`Expected ${SERVICE_WORK_ORDERS_COL_COUNT} columns, got ${actual.length}.`);
  } else if (matchesV2 && mismatches.length === 0) {
    shape = 'contract_v2_metadata_first';
  } else if (matchesV2 && onlyCaseIdentityDrift) {
    shape = 'contract_v2_metadata_first';
    notes.push('Header matches metadata-first layout with identity casing drift only.');
  } else if (matchesLegacy) {
    shape = 'legacy_qbo_first';
    notes.push('AA:AH matches the live legacy QBO-first header block found in staging and production on 2026-05-07.');
  } else if (hasAny(aaAh, HEADER_V2_AA_AH) && hasAny(aaAh, LEGACY_QBO_FIRST_AA_AH)) {
    shape = 'mixed_drift';
    notes.push('AA:AH contains both metadata-first and legacy QBO-first signals.');
  }

  if (actual[43] === 'Customer_ID' || actual[44] === 'Legacy_Flag') {
    notes.push('Identity columns AR/AS use live Sheet casing, not code-contract casing.');
  }

  return {
    shape,
    columnCount: actual.length,
    expectedColumnCount: SERVICE_WORK_ORDERS_COL_COUNT,
    mismatches,
    notes,
  };
}

export function classifyServiceWorkOrdersRowAAtoAH(
  rowAAtoAH: readonly (string | undefined | null)[],
): ServiceWorkOrdersRowShapeReport {
  const values = rowAAtoAH.slice(0, 8).map(value => String(value || '').trim());
  const nonEmpty = values.filter(Boolean).length;
  const metadataSignals = values.filter(isMetadataLike).length;
  const qboSignals = values.filter(isQboLike).length;
  const depositSignals = values.slice(5, 8).filter(Boolean).length;
  const notes: string[] = [];

  let shape: ServiceWorkOrdersRowShape = 'unknown';
  if (nonEmpty === 0) {
    shape = 'empty';
  } else if (metadataSignals > 0 && qboSignals > 0) {
    shape = 'mixed_drift';
    notes.push('AA:AH row contains both metadata/source-like and QBO-like values.');
  } else if (metadataSignals > 0) {
    shape = 'metadata_first';
  } else if (qboSignals > 0) {
    shape = 'legacy_qbo_first';
  }

  if (depositSignals > 0) {
    notes.push('AF:AH legacy deposit cells are populated; do not treat deposit block as dormant for this row.');
    if (shape !== 'mixed_drift') shape = 'mixed_drift';
  } else {
    notes.push('AF:AH legacy deposit cells are empty/dormant for this row sample.');
  }

  return {
    shape,
    aaToAhNonEmpty: nonEmpty,
    metadataSignals,
    qboSignals,
    depositSignals,
    notes,
  };
}

export function summarizeServiceWorkOrdersRowShapes(
  rowsAAtoAH: readonly (readonly (string | undefined | null)[])[],
): ServiceWorkOrdersRowShapeReport {
  const reports = rowsAAtoAH.map(classifyServiceWorkOrdersRowAAtoAH);
  const nonEmptyReports = reports.filter(report => report.shape !== 'empty');
  const metadataSignals = reports.reduce((sum, report) => sum + report.metadataSignals, 0);
  const qboSignals = reports.reduce((sum, report) => sum + report.qboSignals, 0);
  const depositSignals = reports.reduce((sum, report) => sum + report.depositSignals, 0);
  const aaToAhNonEmpty = reports.reduce((sum, report) => sum + report.aaToAhNonEmpty, 0);
  const notes: string[] = [];

  let shape: ServiceWorkOrdersRowShape = 'empty';
  if (nonEmptyReports.length === 0) {
    shape = 'empty';
  } else if (metadataSignals > 0 && qboSignals > 0) {
    shape = 'mixed_drift';
    notes.push('Row set contains both metadata-first and legacy QBO-first value patterns.');
  } else if (metadataSignals > 0) {
    shape = 'metadata_first';
  } else if (qboSignals > 0) {
    shape = 'legacy_qbo_first';
  } else {
    shape = 'unknown';
  }

  if (depositSignals === 0) {
    notes.push('AF:AH deposit cells are dormant across the sampled row set.');
  } else {
    notes.push('AF:AH deposit cells are populated in the sampled row set.');
    shape = 'mixed_drift';
  }

  return { shape, aaToAhNonEmpty, metadataSignals, qboSignals, depositSignals, notes };
}

function sameList(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((value, index) => actual[index] === value);
}

function hasAny(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.some(value => expected.includes(value as never));
}

function isMetadataLike(value: string): boolean {
  return isIsoDateTime(value) || /^banyan_|^manual|^legacy|^api|source/i.test(value);
}

function isQboLike(value: string): boolean {
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  if (/^\d+(\.\d+)?$/.test(value.replace(/,/g, ''))) return true;
  if (/^INV[-_ ]?\d+/i.test(value)) return true;
  return false;
}

function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function columnLetter(index: number): string {
  let result = '';
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}
