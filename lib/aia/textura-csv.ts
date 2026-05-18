/**
 * BAN-337 Pay Apps v2b — Textura CSV generators (byte-exact to Textura's
 * import templates).
 *
 * Two outputs:
 *  1. Schedule-of-Values "setup" CSV — sampleSoV.csv format, 8 columns, the
 *     8th header is the protected "PLEASE DO NOT REMOVE THIS HEADER LINE"
 *     guard string Textura embeds.
 *  2. Per-pay-app Invoice CSV — InvoiceTemplate.csv format, 7 columns; every
 *     numeric column is quoted as a string per Textura's parser quirks.
 *
 * Both honor the BAN-337 "test data watermark" rule: when the source
 * engagement has is_test_project=true, prepend a non-importable row 1 so the
 * file is impossible to submit accidentally to a live Textura tenant.
 *
 * Pure functions — no DB, no network. Callers pass plain rows.
 */

// ── Schedule-of-Values setup CSV ────────────────────────────────────────────

export const SOV_SETUP_HEADER_ROW = [
  'PhaseCode',
  'PhaseCode Description',
  'Budget Amount',
  'Billing Adjustment',
  'Retention Adjustment',
  '(Optional) Special Budget Amount',
  '(Optional) Special Budget Changes',
  'PLEASE DO NOT REMOVE THIS HEADER LINE',
] as const;

export const TEXTURA_TEST_DATA_WATERMARK_SOV =
  'TEST DATA - DO NOT IMPORT TO TEXTURA,,,,,,,';
export const TEXTURA_TEST_DATA_WATERMARK_INVOICE =
  'TEST DATA - DO NOT IMPORT TO TEXTURA,,,,,,';

export interface SovSetupRowInput {
  textura_phase_code: number | string | null;
  description: string | null;
  scheduled_value: number | string | null;
}

export interface SovSetupCsvOptions {
  is_test_project: boolean;
  /** Starting phase code when textura_phase_code is null on a line. */
  default_start_phase_code?: number;
}

export interface SovSetupCsvResult {
  csv: string;
  phase_codes_assigned: Array<{ line_index: number; assigned_phase_code: number }>;
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function numToFixed(value: number | string | null | undefined, decimals = 2): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return (0).toFixed(decimals);
  return n.toFixed(decimals);
}

/**
 * Render the Textura SoV setup CSV. The 8th column has the "PLEASE DO NOT
 * REMOVE" header in row 1, then is blank on every data row.
 *
 * Returns the assembled CSV plus a list of auto-assigned phase codes so the
 * caller can persist them back onto schedule_of_values.textura_phase_code.
 */
export function generateTexturaSovSetupCsv(
  rows: SovSetupRowInput[],
  options: SovSetupCsvOptions,
): SovSetupCsvResult {
  const start = options.default_start_phase_code ?? 100;
  const assigned: Array<{ line_index: number; assigned_phase_code: number }> = [];

  // Resolve a unique phase code per row — keep existing values; auto-assign for nulls.
  const used = new Set<number>();
  const resolved: number[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i].textura_phase_code;
    if (raw !== null && raw !== undefined && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        resolved[i] = Math.trunc(n);
        used.add(resolved[i]);
      }
    }
  }
  let cursor = start;
  for (let i = 0; i < rows.length; i++) {
    if (resolved[i] === undefined) {
      while (used.has(cursor)) cursor += 1;
      resolved[i] = cursor;
      used.add(cursor);
      assigned.push({ line_index: i, assigned_phase_code: cursor });
      cursor += 1;
    }
  }

  const lines: string[] = [];
  if (options.is_test_project) lines.push(TEXTURA_TEST_DATA_WATERMARK_SOV);
  lines.push(SOV_SETUP_HEADER_ROW.join(','));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cols = [
      String(resolved[i]),
      csvEscape(String(r.description ?? '')),
      numToFixed(r.scheduled_value, 2),
      numToFixed(0, 2),
      numToFixed(0, 2),
      '',
      '',
      '', // 8th column blank on data rows; header guard above only
    ];
    lines.push(cols.join(','));
  }

  return {
    csv: lines.join('\r\n') + '\r\n',
    phase_codes_assigned: assigned,
  };
}

// ── Per-pay-app Invoice CSV ─────────────────────────────────────────────────

export const INVOICE_HEADER_ROW = [
  'Item No.',
  'Description of Work',
  'Scheduled Value',
  'Work This Period',
  'Material Stored This Period',
  'Retention Held This Period',
  'Request Previously Held',
] as const;

export interface InvoiceRowInput {
  item_number: string | number | null;
  description: string | null;
  scheduled_value: number | string | null;
  work_this_period: number | string | null;
  material_stored_this_period: number | string | null;
  retention_held_this_period: number | string | null;
  request_previously_held: number | string | null;
}

export interface InvoiceCsvOptions {
  is_test_project: boolean;
}

function quoteNum(value: number | string | null | undefined, decimals = 2): string {
  return '"' + numToFixed(value, decimals) + '"';
}

/**
 * Render the Textura Invoice CSV. Per Textura's import quirks, every numeric
 * column is quoted as a string so leading zeros / decimals are preserved.
 */
export function generateTexturaInvoiceCsv(
  rows: InvoiceRowInput[],
  options: InvoiceCsvOptions,
): string {
  const lines: string[] = [];
  if (options.is_test_project) lines.push(TEXTURA_TEST_DATA_WATERMARK_INVOICE);
  lines.push(INVOICE_HEADER_ROW.join(','));

  for (const r of rows) {
    const cols = [
      csvEscape(String(r.item_number ?? '')),
      csvEscape(String(r.description ?? '')),
      quoteNum(r.scheduled_value),
      quoteNum(r.work_this_period),
      quoteNum(r.material_stored_this_period),
      quoteNum(r.retention_held_this_period),
      quoteNum(r.request_previously_held),
    ];
    lines.push(cols.join(','));
  }

  return lines.join('\r\n') + '\r\n';
}
