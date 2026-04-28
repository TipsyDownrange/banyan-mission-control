/**
 * POST /api/projects/handoff
 *
 * Creates a PM project from a won estimating bid (BID_WON event).
 *
 * Steps (each runs independently — failures are logged, not thrown):
 *   1. Generate target_kID = PRJ-{YY}-{NNNN}
 *   2. Create Core_Entities row
 *   3. Create Drive folder structure (10 subfolders)
 *   4. Create Schedule_of_Values rows from Carls_Method estimate
 *   5. Create Budget rows (9 categories)
 *
 * Returns: { handoff_id, target_kID, auto_created: { success[], failed[] } }
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { randomUUID } from 'crypto';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();
const BANYAN_DRIVE_PARENT = '0AKSVpf3AnH7CUk9PVA'; // BanyanOS shared drive

const DRIVE_SUBFOLDERS = [
  '01 - Contract Documents',
  '02 - Submittals',
  '03 - RFIs',
  '04 - Change Orders',
  '05 - Field Reports & QA',
  '06 - Schedule',
  '07 - Photos',
  '08 - Budget & Costs',
  '09 - Closeout',
  '10 - Correspondence',
];

const SOV_HEADERS = [
  'sov_id',
  'kID',
  'line_number',
  'description',
  'scheduled_value',
  'previous_periods_total',
  'this_period',
  'stored_materials',
  'total_completed',
  'retainage_pct',
  'retainage_amount',
  'balance_to_finish',
  'status',
];

const BUDGET_HEADERS = [
  'budget_id',
  'kID',
  'category',
  'original_estimate',
  'current_budget',
  'projected_actual',
  'variance',
  'variance_pct',
  'status',
];

const BUDGET_CATEGORIES = [
  'Labor',
  'Material-Glass',
  'Material-Aluminum',
  'Material-Hardware',
  'Material-Sealants',
  'Equipment',
  'Travel',
  'Overhead',
  'Contingency',
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function getSheets() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  return google.sheets({ version: 'v4', auth });
}

function getDrive() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive']);
  return google.drive({ version: 'v3', auth });
}

/** Ensure a tab exists; if not, create it and write headers in row 1. */
async function ensureTab(
  sheets: ReturnType<typeof google.sheets>,
  tabName: string,
  headers: string[]
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets?.some(s => s.properties?.title === tabName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
}

/** Read all Core_Entities rows to find the highest PRJ- number for this year. */
async function generateKID(sheets: ReturnType<typeof google.sheets>): Promise<string> {
  const yy = new Date().getFullYear().toString().slice(-2);
  const prefix = `PRJ-${yy}-`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Core_Entities!A2:A2000',
  });
  const rows = (res.data.values || []) as string[][];
  const nums = rows
    .map(r => r[0] || '')
    .filter(id => id.startsWith(prefix))
    .map(id => parseInt(id.replace(prefix, '')) || 0);

  const next = (Math.max(0, ...nums) + 1).toString().padStart(4, '0');
  return `${prefix}${next}`;
}

// ─── step implementations ─────────────────────────────────────────────────────

async function step_createCoreEntity(
  sheets: ReturnType<typeof google.sheets>,
  kID: string,
  name: string,
  pm_user_id: string,
  super_user_id: string
): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Core_Entities!A:H',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        kID,           // A: kID
        'Project',     // B: Entity_Type
        name,          // C: Name
        'Active',      // D: Status
        pm_user_id,    // E: PM_User_ID
        super_user_id, // F: Superintendent_User_ID
        '',            // G: Island (blank at handoff)
        '',            // H: Gate_Code (blank at handoff)
      ]],
    },
  });
}

async function step_createDriveFolders(
  kID: string,
  projectName: string
): Promise<void> {
  const drive = getDrive();
  const rootName = `${kID} — ${projectName}`;

  // Create root folder in the shared drive
  const rootRes = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: rootName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [BANYAN_DRIVE_PARENT],
    },
    fields: 'id',
  });

  const rootId = rootRes.data.id;
  if (!rootId) throw new Error('Root folder creation returned no id');

  // Create all subfolders in parallel
  await Promise.all(
    DRIVE_SUBFOLDERS.map(subfolder =>
      drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: subfolder,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootId],
        },
        fields: 'id',
      })
    )
  );
}

interface CarlsMethodData {
  sections?: Record<string, { total?: number; label?: string }>;
  totals?: Record<string, number>;
  aluminum?: number;
  glass?: number;
  labor?: number;
  misc?: number;
  drive_time?: number;
  [key: string]: unknown;
}

async function step_createSOV(
  sheets: ReturnType<typeof google.sheets>,
  kID: string,
  sourceId: string,
  carlsData: CarlsMethodData
): Promise<void> {
  await ensureTab(sheets, 'Schedule_of_Values', SOV_HEADERS);

  // Map Carls_Method sections → SOV line items
  const sections: Array<{ key: string; label: string; value: number }> = [];

  // Try structured sections first
  if (carlsData.sections && typeof carlsData.sections === 'object') {
    for (const [key, sec] of Object.entries(carlsData.sections)) {
      sections.push({
        key,
        label: sec.label || key,
        value: sec.total || 0,
      });
    }
  } else {
    // Fall back to top-level numeric keys
    const knownKeys = ['aluminum', 'glass', 'labor', 'misc', 'drive_time'];
    for (const k of knownKeys) {
      const v = carlsData[k];
      if (typeof v === 'number') {
        sections.push({ key: k, label: k.replace(/_/g, ' '), value: v });
      }
    }
    // Also check totals sub-object
    if (carlsData.totals && typeof carlsData.totals === 'object') {
      for (const [k, v] of Object.entries(carlsData.totals)) {
        if (typeof v === 'number' && !knownKeys.includes(k)) {
          sections.push({ key: k, label: k.replace(/_/g, ' '), value: v });
        }
      }
    }
  }

  if (sections.length === 0) {
    // No data — still create placeholder rows for the 5 standard sections
    const defaults = ['aluminum', 'glass', 'labor', 'misc', 'drive time'];
    for (const d of defaults) {
      sections.push({ key: d, label: d, value: 0 });
    }
  }

  const now = new Date().toISOString();
  const rows = sections.map((sec, i) => {
    const sovId = `SOV-${kID}-${String(i + 1).padStart(3, '0')}`;
    const scheduled = sec.value;
    return [
      sovId,         // sov_id
      kID,           // kID
      i + 1,         // line_number
      sec.label,     // description
      scheduled,     // scheduled_value
      0,             // previous_periods_total
      0,             // this_period
      0,             // stored_materials
      0,             // total_completed
      10,            // retainage_pct (10% default)
      0,             // retainage_amount
      scheduled,     // balance_to_finish
      'draft',       // status
    ];
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Schedule_of_Values!A:M',
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

async function step_createBudget(
  sheets: ReturnType<typeof google.sheets>,
  kID: string,
  carlsData: CarlsMethodData
): Promise<void> {
  await ensureTab(sheets, 'Budget', BUDGET_HEADERS);

  // Extract category totals from Carls_Method data
  const categoryMap: Record<string, number> = {
    'Labor':              carlsData.labor    as number || carlsData.totals?.['labor']    as number || 0,
    'Material-Glass':     carlsData.glass    as number || carlsData.totals?.['glass']    as number || 0,
    'Material-Aluminum':  carlsData.aluminum as number || carlsData.totals?.['aluminum'] as number || 0,
    'Material-Hardware':  carlsData.hardware as number || carlsData.totals?.['hardware'] as number || 0,
    'Material-Sealants':  carlsData.sealants as number || carlsData.totals?.['sealants'] as number || 0,
    'Equipment':          carlsData.equipment as number || carlsData.totals?.['equipment'] as number || 0,
    'Travel':             carlsData.drive_time as number || carlsData.totals?.['drive_time'] as number || 0,
    'Overhead':           carlsData.overhead  as number || carlsData.totals?.['overhead']  as number || 0,
    'Contingency':        carlsData.contingency as number || carlsData.totals?.['contingency'] as number || 0,
  };

  const rows = BUDGET_CATEGORIES.map((cat, i) => {
    const budgetId = `BUD-${kID}-${String(i + 1).padStart(3, '0')}`;
    const estimate = categoryMap[cat] || 0;
    return [
      budgetId,  // budget_id
      kID,       // kID
      cat,       // category
      estimate,  // original_estimate
      estimate,  // current_budget (= original at handoff)
      0,         // projected_actual
      0,         // variance
      0,         // variance_pct
      'active',  // status
    ];
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Budget!A:I',
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

// ─── main route ───────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Auth gate — must be @kulaglass.com
  const session = await getServerSession(authOptions);
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    source_type: string;
    source_id: string;
    pm_user_id: string;
    super_user_id: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { source_type, source_id, pm_user_id, super_user_id } = body;

  if (source_type !== 'BID_WON') {
    return NextResponse.json({ error: 'source_type must be BID_WON' }, { status: 400 });
  }
  if (!source_id || !pm_user_id || !super_user_id) {
    return NextResponse.json({ error: 'source_id, pm_user_id, and super_user_id are required' }, { status: 400 });
  }

  const handoff_id = randomUUID();
  const sheets = getSheets();
  const success: string[] = [];
  const failed: string[] = [];

  // ── Step 1: Generate kID ──────────────────────────────────────────────────
  let target_kID: string;
  try {
    target_kID = await generateKID(sheets);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate kID', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  // ── Load Carls_Method data (needed by steps 4 & 5) ───────────────────────
  let carlsData: CarlsMethodData = {};
  let projectName = source_id; // fallback name

  try {
    const cmRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Carls_Method!A2:D2000',
    });
    const cmRows = (cmRes.data.values || []) as string[][];

    // Match by source_id or WO-{source_id}
    const cmRow = cmRows.find(r => r[1] === source_id || r[1] === `WO-${source_id}`);
    if (cmRow?.[2]) {
      carlsData = JSON.parse(cmRow[2]) as CarlsMethodData;
      // Try to get project name from the data
      if (typeof carlsData.project_name === 'string') projectName = carlsData.project_name;
      else if (typeof carlsData.name === 'string') projectName = carlsData.name;
      else if (typeof carlsData.job_name === 'string') projectName = carlsData.job_name;
    }
  } catch {
    // Non-fatal — steps 4 & 5 will use empty data → placeholder rows
  }

  // ── Step 2: Core_Entities row ─────────────────────────────────────────────
  try {
    await step_createCoreEntity(sheets, target_kID, projectName, pm_user_id, super_user_id);
    success.push('core_entity');
  } catch (err) {
    failed.push('core_entity');
    console.error('[handoff] step2 core_entity failed:', err);
  }

  // ── Step 3: Drive folder structure ────────────────────────────────────────
  try {
    await step_createDriveFolders(target_kID, projectName);
    success.push('drive_folder');
  } catch (err) {
    failed.push('drive_folder');
    console.error('[handoff] step3 drive_folder failed:', err);
  }

  // ── Step 4: Schedule_of_Values rows ──────────────────────────────────────
  try {
    await step_createSOV(sheets, target_kID, source_id, carlsData);
    success.push('sov_draft');
  } catch (err) {
    failed.push('sov_draft');
    console.error('[handoff] step4 sov_draft failed:', err);
  }

  // ── Step 5: Budget rows ───────────────────────────────────────────────────
  try {
    await step_createBudget(sheets, target_kID, carlsData);
    success.push('budget');
  } catch (err) {
    failed.push('budget');
    console.error('[handoff] step5 budget failed:', err);
  }

  return NextResponse.json({
    handoff_id,
    target_kID,
    project_name: projectName,
    auto_created: { success, failed },
  });
}
