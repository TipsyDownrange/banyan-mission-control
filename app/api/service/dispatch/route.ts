import { hawaiiToday, hawaiiNow, hawaiiYear2 } from '@/lib/hawaii-time';
import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { fireAndForgetCustomerUpdate } from '@/lib/updateCustomerRecord';
import { checkPermission } from '@/lib/permissions';
import { invalidateCache } from '@/app/api/service/route';
import { getBackendSheetId } from '@/lib/backend-config';

const BACKEND_SHEET_ID = getBackendSheetId();
const TAB = 'Service_Work_Orders';
const BANYAN_DRIVE_ID = '0AKSVpf3AnH7CUk9PVA';

/**
 * Find or create a folder by name inside a parent, using the Drive API.
 */
async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
): Promise<string> {
  const safeName = name.replace(/[^\w\s\-—()]/g, '').trim();
  const search = await drive.files.list({
    q: `name = '${safeName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`,
    driveId: BANYAN_DRIVE_ID,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: 'drive',
    fields: 'files(id,name)',
  });
  if (search.data.files && search.data.files.length > 0) {
    return search.data.files[0].id!;
  }
  const created = await drive.files.create({
    requestBody: { name: safeName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    supportsAllDrives: true,
    fields: 'id',
  });
  return created.data.id!;
}

/**
 * Creates the WO folder structure in BanyanOS shared Drive:
 *   Service / [Island] / WO-[number] — [Customer Name] /
 *     Photos/
 *     Quotes/
 *     Correspondence/
 * Returns the webViewLink of the WO folder.
 */
async function createWOFolderStructure(
  woId: string,
  customerName: string,
  island: string,
): Promise<string | null> {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive']);
    const drive = google.drive({ version: 'v3', auth });

    // Layer 1: Service folder
    const serviceFolderId = await findOrCreateFolder(drive, 'Service', BANYAN_DRIVE_ID);

    // Layer 2: Island folder (e.g., "Maui")
    const islandLabel = island || 'Unassigned';
    const islandFolderId = await findOrCreateFolder(drive, islandLabel, serviceFolderId);

    // Layer 3: WO folder
    const woFolderName = `${woId} — ${customerName}`;
    const woFolderId = await findOrCreateFolder(drive, woFolderName, islandFolderId);

    // Layer 4: Standard subfolders
    await Promise.all([
      findOrCreateFolder(drive, 'Photos', woFolderId),
      findOrCreateFolder(drive, 'Quotes', woFolderId),
      findOrCreateFolder(drive, 'Correspondence', woFolderId),
      findOrCreateFolder(drive, 'Field Issues', woFolderId),
      findOrCreateFolder(drive, 'Daily Reports', woFolderId),
      findOrCreateFolder(drive, 'Measurements', woFolderId),
    ]);

    // Layer 4b: Kai shadow folder + subfolders (immutable backup, invisible to users)
    try {
      const shadowFolderId = await findOrCreateFolder(drive, '10 - AI Project Documents [Kai]', woFolderId);
      await Promise.all([
        findOrCreateFolder(drive, 'Photos', shadowFolderId),
        findOrCreateFolder(drive, 'Daily Reports', shadowFolderId),
        findOrCreateFolder(drive, 'Measurements', shadowFolderId),
        findOrCreateFolder(drive, 'Field Issues', shadowFolderId),
        findOrCreateFolder(drive, 'System Generated', shadowFolderId),
      ]);
    } catch (shadowErr) {
      console.error('[createWOFolderStructure] shadow folder creation failed (non-fatal):', shadowErr);
    }

    // Share with @kulaglass.com domain
    try {
      await drive.permissions.create({
        fileId: woFolderId,
        supportsAllDrives: true,
        requestBody: { type: 'domain', domain: 'kulaglass.com', role: 'writer' },
      });
    } catch { /* non-fatal if already shared via drive inheritance */ }

    // Get the webViewLink
    const meta = await drive.files.get({
      fileId: woFolderId,
      supportsAllDrives: true,
      fields: 'webViewLink',
    });

    return meta.data.webViewLink || `https://drive.google.com/drive/folders/${woFolderId}`;
  } catch (e) {
    console.error('WO folder creation failed:', e);
    return null;
  }
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
      assignedTo, notes, woNumber, dateReceived,
      customer_id, org_id,
    } = body;

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
    let wo = woNumber;
    if (!wo) {
      const yr = hawaiiYear2();
      // Find the highest existing WO number for this year
      const existingWOs = await sheets.spreadsheets.values.get({
        spreadsheetId: BACKEND_SHEET_ID,
        range: 'Service_Work_Orders!B2:B2000',
      });
      const nums = (existingWOs.data.values || []).flat()
        .filter((v: string) => v && v.startsWith(yr + '-'))
        .map((v: string) => parseInt(v.split('-')[1]) || 0);
      const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      wo = `${yr}-${String(nextNum).padStart(4, '0')}`;
    }
    const woId = `WO-${wo.replace(/[^A-Za-z0-9\-]/g, '')}`;
    // Column C (name): use businessName if provided; otherwise derive from customerName + systemType
    const name = businessName ||
      (systemType ? `${customerName} — ${systemType}` : customerName);
    const notesStr = [notes, urgency === 'urgent' ? '⚡ URGENT' : ''].filter(Boolean).join(' | ');

    // Create Drive folder structure before writing the sheet row
    // Non-fatal if it fails — WO creation still proceeds
    const folderUrl = await createWOFolderStructure(woId, customerName, island || city || '');

    const rowPrefix = [
      woId,           // wo_id
      wo,             // wo_number
      name,           // name
      description,    // description
      'lead',         // status — new WOs start as New Lead
      island || city || '',                           // island (F)
      areaOfIsland || island || city || '',            // area_of_island (G)
      (() => { const parts = [address, city]; if (state || zip) parts.push([state, zip].filter(Boolean).join(' ')); return parts.filter(Boolean).join(', '); })(),  // address (H)
      contactPerson || '',                             // contact_person (I)
      contactTitle || '',                              // contact_title (J)
      contactPhone || '',                              // contact_phone (K)
      contactEmail || '',                              // contact_email (L)
      customerName || businessName || '',              // customer_name (M)
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
    }

    invalidateCache();

    // Fire-and-forget customer DB backfeed — never blocks WO creation
    fireAndForgetCustomerUpdate({
      name:           customerName || businessName || '',
      island:         island || city || '',
      address:        address,
      city:           city,
      primaryContact: contactPerson,
      phone:          contactPhone,
    });

    return NextResponse.json({ ok: true, woId, woNumber: wo, folderUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
