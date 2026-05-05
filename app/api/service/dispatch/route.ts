import { hawaiiToday, hawaiiNow, hawaiiYear2 } from '@/lib/hawaii-time';
import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { checkPermission } from '@/lib/permissions';
import { invalidateCache } from '@/app/api/service/route';
import { getBackendSheetId } from '@/lib/backend-config';
import { normalizeAddressComponent, normalizeEmail, normalizeNameForWrite, normalizePhone, resolveWorkOrderIsland } from '@/lib/normalize';
import {
  ServiceWOFolderCreationError,
  createWOFolderStructure,
  requireServiceWOFolderUrl,
} from '@/lib/drive-wo-folder';

export { ServiceWOFolderCreationError, requireServiceWOFolderUrl };

const BACKEND_SHEET_ID = getBackendSheetId();
const TAB = 'Service_Work_Orders';
const SERVICE_WO_NUMBER_PATTERN = /^\d{2}-\d{4}$/;

export class InvalidServiceWONumberError extends Error {
  constructor(value: string) {
    super(`Invalid work order number "${value}". Use the standard YY-#### format, for example 26-0001.`);
    this.name = 'InvalidServiceWONumberError';
  }
}

export function normalizeIncomingServiceWONumber(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  if (!SERVICE_WO_NUMBER_PATTERN.test(normalized)) {
    throw new InvalidServiceWONumberError(normalized);
  }
  return normalized;
}

export function buildServiceWOId(woNumber: string): string {
  if (!SERVICE_WO_NUMBER_PATTERN.test(woNumber)) {
    throw new InvalidServiceWONumberError(woNumber);
  }
  return `WO-${woNumber}`;
}

export function nextServiceWONumber(existingNumbers: string[], yearTwoDigit: string): string {
  const nums = existingNumbers
    .map(v => String(v || '').trim())
    .filter(v => SERVICE_WO_NUMBER_PATTERN.test(v) && v.startsWith(`${yearTwoDigit}-`))
    .map(v => Number.parseInt(v.split('-')[1], 10));
  const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${yearTwoDigit}-${String(nextNum).padStart(4, '0')}`;
}

// POST — create new work order row in backend sheet
export async function POST(req: Request) {
  // Permission check — wo:create required (Joey, Sean, Jody)
  const { allowed } = await checkPermission(req, 'wo:create');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: wo:create required' }, { status: 403 });

  try {
    const body = await req.json();
    const {
      businessName, customerName, address, city, state, zip, island, areaOfIsland,
      contactPerson, contactPhone, contactEmail, contactTitle,
      description, systemType, urgency,
      assignedTo, notes, woNumber: rawWONumber, dateReceived,
      customer_id, org_id,
    } = body;

    let incomingWONumber: string | undefined;
    try {
      incomingWONumber = normalizeIncomingServiceWONumber(rawWONumber);
    } catch (err) {
      if (err instanceof InvalidServiceWONumberError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    if ((!businessName && !customerName) || !description) {
      return NextResponse.json(
        { error: 'customerName (or businessName) and description are required' },
        { status: 400 }
      );
    }

    // GC-D053: customer_id is MANDATORY on WO create
    if (!customer_id) {
      return NextResponse.json(
        { error: 'customer_id required — GC-D053 MANDATORY' },
        { status: 400 }
      );
    }
    if (!org_id) {
      console.warn('[identity] missing org_id on WO create', {
        customer_id,
        customerName: customerName || businessName || '',
      });
    }
    const requiresOrgAssignment = !org_id;

    const auth0 = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth: auth0 });

    // Validate customer_id resolves against Customers table (GC-D053)
    const custValidRes = await sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: 'Customers!A:N',
    });
    const custRows = custValidRes.data.values || [];
    const custHeaders = (custRows[0] || []) as string[];
    const cidIdx = custHeaders.indexOf('Customer_ID');
    if (cidIdx < 0) {
      return NextResponse.json(
        { error: 'Customers table missing Customer_ID column — GC-D053' },
        { status: 500 }
      );
    }
    const customerExists = custRows.slice(1).some(
      r => (r[cidIdx] || '').trim() === String(customer_id).trim()
    );
    if (!customerExists) {
      return NextResponse.json(
        { error: `customer_id "${customer_id}" not found in Customers table — GC-D053 MANDATORY` },
        { status: 400 }
      );
    }

    const now = hawaiiNow();
    const today = dateReceived || hawaiiToday();
    // Sequential WO numbering: WO-26-XXXX
    let wo = incomingWONumber;
    if (!wo) {
      const yr = hawaiiYear2();
      // Find the highest existing WO number for this year
      const existingWOs = await sheets.spreadsheets.values.get({
        spreadsheetId: BACKEND_SHEET_ID,
        range: 'Service_Work_Orders!B2:B2000',
      });
      wo = nextServiceWONumber((existingWOs.data.values || []).flat(), yr);
    }
    const woId = buildServiceWOId(wo);
    const cleanBusinessName = normalizeNameForWrite(String(businessName || ''));
    const cleanCustomerName = normalizeNameForWrite(String(customerName || ''));
    const cleanContactPerson = normalizeNameForWrite(String(contactPerson || ''));
    const cleanContactPhone = normalizePhone(String(contactPhone || ''));
    const cleanContactEmail = normalizeEmail(String(contactEmail || ''));
    const cleanContactTitle = normalizeNameForWrite(String(contactTitle || ''));
    const cleanAddress = normalizeAddressComponent(String(address || ''));
    const cleanCity = normalizeAddressComponent(String(city || ''));
    const cleanState = normalizeAddressComponent(String(state || ''));
    const cleanZip = normalizeAddressComponent(String(zip || ''));
    const cleanIsland = String(island || '').trim() ? resolveWorkOrderIsland(String(island)) : '';
    const cleanAreaOfIsland = normalizeAddressComponent(String(areaOfIsland || cleanIsland || cleanCity || ''));
    // Column C (name): use businessName if provided; otherwise derive from customerName + systemType
    const name = cleanBusinessName ||
      (systemType ? `${cleanCustomerName} — ${systemType}` : cleanCustomerName);
    const notesStr = [notes, urgency === 'urgent' ? '⚡ URGENT' : ''].filter(Boolean).join(' | ');

    // Create Drive folder structure before writing the sheet row. This is fatal:
    // never create a new WO that has no Drive folder for job files.
    let folderUrl: string;
    try {
      folderUrl = requireServiceWOFolderUrl(
        await createWOFolderStructure(woId, cleanCustomerName || cleanBusinessName || '', cleanIsland || cleanCity || '')
      );
    } catch (err) {
      if (err instanceof ServiceWOFolderCreationError) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
      throw err;
    }

    const rowPrefix = [
      woId,           // wo_id
      wo,             // wo_number
      name,           // name
      description,    // description
      'lead',         // status — new WOs start as New Lead
      cleanIsland || cleanCity || '',                  // island (F)
      cleanAreaOfIsland,                               // area_of_island (G)
      (() => { const parts = [cleanAddress, cleanCity]; if (cleanState || cleanZip) parts.push([cleanState, cleanZip].filter(Boolean).join(' ')); return parts.filter(Boolean).join(', '); })(),  // address (H)
      cleanContactPerson,                              // contact_person (I)
      cleanContactTitle,                               // contact_title (J)
      cleanContactPhone,                               // contact_phone (K)
      cleanContactEmail,                               // contact_email (L)
      cleanCustomerName || cleanBusinessName || '',    // customer_name (M)
      systemType || '',                                // system_type
      assignedTo || '',                                // assigned_to
      today,                                           // date_received
    ];
    // ORPHAN cols 16,17,19,20,21 — frozen do not write
    const rowSuffix = [
      notesStr,          // comments (W)
      folderUrl || '',   // folder_url (X)
      '',                // quote_total (Y)
      '',                // quote_status (Z)
      now,               // created_at (AA)
      now,               // updated_at (AB)
      'banyan_dispatch', // source (AC)
    ];

    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId: BACKEND_SHEET_ID,
      range: `${TAB}!A:P`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowPrefix] },
    });

    const updatedRange = appendRes.data.updates?.updatedRange || '';
    const rowMatch = updatedRange.match(/![A-Z]+(\d+):[A-Z]+\d+$/);
    const sheetRow = rowMatch ? parseInt(rowMatch[1], 10) : NaN;

    if (Number.isFinite(sheetRow)) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${TAB}!W${sheetRow}:AC${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowSuffix] },
      });
      // Write org_id (AQ), customer_id (AR), legacy_flag (AS) — GC-D053
      await sheets.spreadsheets.values.update({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${TAB}!AQ${sheetRow}:AS${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[org_id || '', customer_id, 'false']] },
      });
      // Write requires_org_assignment (AU) without touching legacy_wo_ids (AT).
      await sheets.spreadsheets.values.update({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${TAB}!AU${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[requiresOrgAssignment ? 'true' : 'false']] },
      });
    }

    invalidateCache();

    return NextResponse.json({ ok: true, woId, woNumber: wo, folderUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
