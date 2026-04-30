/**
 * updateCustomerRecord — fire-and-forget customer DB upsert.
 *
 * Searches the Customers tab by phone, email, or name.
 *   - Found → fills any empty fields with new data (never overwrites existing data with blanks)
 *   - Not found → skips creation; canonical customer creation must be explicit
 *
 * This function is intentionally non-blocking; callers should NOT await it
 * in request handlers where a customer DB failure must not block the response.
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const CUSTOMER_DB   = '1ZJtlJPM0GBogzdIRlC50JpNpi96bSY7tS7xnIn08d6A';
const CUSTOMER_TAB  = 'Customers';
const CUSTOMER_RANGE = `${CUSTOMER_TAB}!A1:N500`;

// Columns: Customer ID, Name, Type, Island, Address, City, Primary Contact, Phone, Email,
//          Last Job Date, Job Count, Notes, Source, Created At
const COLUMNS = [
  'Customer ID', 'Name', 'Type', 'Island', 'Address', 'City',
  'Primary Contact', 'Phone', 'Email', 'Last Job Date', 'Job Count',
  'Notes', 'Source', 'Created At',
] as const;

export type CustomerData = {
  name?:           string;
  type?:           string;
  island?:         string;
  address?:        string;
  city?:           string;
  primaryContact?: string;
  phone?:          string;
  email?:          string;
  lastJobDate?:    string;
  jobCount?:       string | number;
  notes?:          string;
  source?:         string;
};

// Map friendly keys → column header names
function toRow(data: CustomerData): Record<string, string> {
  const d: Record<string, string> = {};
  if (data.name           != null) d['Name']            = String(data.name);
  if (data.type           != null) d['Type']            = String(data.type);
  if (data.island         != null) d['Island']          = String(data.island);
  if (data.address        != null) d['Address']         = String(data.address);
  if (data.city           != null) d['City']            = String(data.city);
  if (data.primaryContact != null) d['Primary Contact'] = String(data.primaryContact);
  if (data.phone          != null) d['Phone']           = String(data.phone);
  if (data.email          != null) d['Email']           = String(data.email);
  if (data.lastJobDate    != null) d['Last Job Date']   = String(data.lastJobDate);
  if (data.jobCount       != null) d['Job Count']       = String(data.jobCount);
  if (data.notes          != null) d['Notes']           = String(data.notes);
  if (data.source         != null) d['Source']          = String(data.source);
  return d;
}

function normalize(s: string | undefined): string {
  return (s || '').toLowerCase().replace(/\D/g, '').trim();
}

export async function updateCustomerRecord(data: CustomerData): Promise<void> {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  // Fetch all rows
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CUSTOMER_DB,
    range: CUSTOMER_RANGE,
  });
  const rows = res.data.values || [];
  if (rows.length === 0) return; // empty sheet — nothing we can do safely

  const headers = rows[0] as string[];
  const dataRows = rows.slice(1);

  const incoming = toRow(data);

  // Build lookup values for match
  const inPhone = normalize(data.phone);
  const inEmail = (data.email || '').toLowerCase().trim();
  const inName  = (data.name  || '').toLowerCase().trim();

  const colIdx = (h: string) => headers.indexOf(h);

  // Try to find an existing record
  let matchRowIdx = -1; // 0-based index in dataRows
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowPhone = normalize(row[colIdx('Phone')]);
    const rowEmail = (row[colIdx('Email')] || '').toLowerCase().trim();
    const rowName  = (row[colIdx('Name')]  || '').toLowerCase().trim();

    if (inPhone && rowPhone && inPhone === rowPhone) { matchRowIdx = i; break; }
    if (inEmail && rowEmail && inEmail === rowEmail) { matchRowIdx = i; break; }
    if (inName  && rowName  && inName  === rowName ) { matchRowIdx = i; break; }
  }

  if (matchRowIdx !== -1) {
    // ── UPDATE: fill gaps only ──────────────────────────────────────────────
    const existingRow = [...dataRows[matchRowIdx]];
    // Pad to header length
    while (existingRow.length < headers.length) existingRow.push('');

    let changed = false;
    for (const [col, val] of Object.entries(incoming)) {
      const idx = colIdx(col);
      if (idx === -1) continue;
      if (val && !existingRow[idx]) {
        existingRow[idx] = val;
        changed = true;
      } else if (val && existingRow[idx] !== val && col !== 'Customer ID') {
        // Overwrite if caller provided a new non-empty value (except ID)
        existingRow[idx] = val;
        changed = true;
      }
    }

    if (changed) {
      const sheetRowNumber = matchRowIdx + 2; // +1 for header, +1 for 1-indexing
      await sheets.spreadsheets.values.update({
        spreadsheetId: CUSTOMER_DB,
        range: `${CUSTOMER_TAB}!A${sheetRowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [existingRow] },
      });
    }
  } else {
    console.warn('[customer-backfeed] skipped automatic customer creation', {
      name: data.name || '',
      source: data.source || '',
    });
  }
}

/**
 * fireAndForgetCustomerUpdate — wraps updateCustomerRecord to be truly non-blocking.
 * Swallows errors silently so callers never throw.
 */
export function fireAndForgetCustomerUpdate(data: CustomerData): void {
  updateCustomerRecord(data).catch(err => {
    console.warn('[customer-backfeed] non-blocking write failed:', err?.message || err);
  });
}
