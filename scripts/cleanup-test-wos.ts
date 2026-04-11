/**
 * scripts/cleanup-test-wos.ts
 *
 * One-time cleanup: removes known test WOs and all cascade data.
 * Run with: npx tsx scripts/cleanup-test-wos.ts
 *
 * Deletes rows for: WO-26-8289, WO-26-8290, WO-26-1204
 * Cascades: Install_Plans → Install_Steps → Step_Completions → Dispatch_Schedule → Carls_Method
 *
 * Safety rules:
 * - Only deletes rows whose IDs appear in KNOWN_TEST_WO_IDS
 * - Deletes rows in reverse order (bottom→top) to avoid index shift
 * - Logs every row before deleting
 * - DRY_RUN=true (default) — set DRY_RUN=false to actually delete
 */

import { google } from 'googleapis';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const DRY_RUN = process.env.DRY_RUN !== 'false';

// These are the only WO IDs that will be deleted. Edit this list before running.
const KNOWN_TEST_WO_IDS = new Set([
  'WO-26-8289',  // "test"
  'WO-26-8290',  // "test 1"
  'WO-26-1204',  // "test ocean view resort — IG Unit Replacement"
  // WO-26-E2E-722374 is a transient E2E ID written to Install_Plans/Steps/Dispatch only,
  // not in Service_Work_Orders — handled by cascade below
]);

// Also cascade-delete these WO IDs from child tables even if not in Service_Work_Orders
const ALL_TEST_WO_IDS = new Set([
  ...KNOWN_TEST_WO_IDS,
  'WO-26-E2E-722374',
]);

function getAuth() {
  const b64 = process.env.GOOGLE_SA_KEY_BASE64;
  if (!b64) throw new Error('GOOGLE_SA_KEY_BASE64 env var required');
  const keyJson = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
  return new google.auth.GoogleAuth({
    credentials: keyJson,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetId(sheets: ReturnType<typeof google.sheets>, tabName: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = meta.data.sheets?.find(s => s.properties?.title === tabName);
  if (!sheet?.properties?.sheetId === undefined) throw new Error(`Tab not found: ${tabName}`);
  return sheet!.properties!.sheetId!;
}

async function deleteRows(
  sheets: ReturnType<typeof google.sheets>,
  sheetId: number,
  tabName: string,
  rowIndices: number[], // 0-based
) {
  if (rowIndices.length === 0) return;
  // Sort descending so we delete from bottom to top (no index shift)
  const sorted = [...rowIndices].sort((a, b) => b - a);
  console.log(`  Deleting ${sorted.length} rows from ${tabName} (bottom→top): rows ${sorted.map(r => r + 1).join(', ')}`);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would delete ${sorted.length} rows`);
    return;
  }

  const requests = sorted.map(rowIdx => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: 'ROWS',
        startIndex: rowIdx,
        endIndex: rowIdx + 1,
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  });
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (no changes will be made) ===' : '=== LIVE RUN — deleting rows ===');
  console.log('Test WO IDs targeted:', [...ALL_TEST_WO_IDS].join(', '));
  console.log('');

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // ── Step 1: Find and log WO rows to delete ────────────────────────────────
  console.log('--- Service_Work_Orders ---');
  const woRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:D2000',
  });
  const woRows = woRes.data.values || [];
  const woToDelete: number[] = []; // 0-based sheet row indices (row 2 = index 1)
  const deletedWoIds = new Set<string>();

  woRows.forEach((r, i) => {
    const woId = (r[0] || '').trim();
    if (KNOWN_TEST_WO_IDS.has(woId)) {
      console.log(`  [DELETE] row ${i + 2}: ${woId} — "${r[2]}"`);
      woToDelete.push(i + 1); // +1 for header row (0-based: row2 = index 1)
      deletedWoIds.add(woId);
    }
  });
  console.log(`  Total to delete: ${woToDelete.length}`);

  // ── Step 2: Find Install_Plans to cascade ─────────────────────────────────
  console.log('\n--- Install_Plans ---');
  const plansRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Install_Plans!A2:B2000',
  });
  const planRows = plansRes.data.values || [];
  const planToDelete: number[] = [];
  const deletedPlanIds = new Set<string>();

  planRows.forEach((r, i) => {
    const planId = (r[0] || '').trim();
    const jobId = (r[1] || '').trim();
    if (ALL_TEST_WO_IDS.has(jobId)) {
      console.log(`  [DELETE] row ${i + 2}: ${planId} → job ${jobId}`);
      planToDelete.push(i + 1);
      deletedPlanIds.add(planId);
    }
  });
  console.log(`  Total to delete: ${planToDelete.length}`);

  // ── Step 3: Find Install_Steps to cascade ─────────────────────────────────
  console.log('\n--- Install_Steps ---');
  const stepsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Install_Steps!A2:B2000',
  });
  const stepRows = stepsRes.data.values || [];
  const stepsToDelete: number[] = [];
  const deletedStepIds = new Set<string>();

  stepRows.forEach((r, i) => {
    const stepId = (r[0] || '').trim();
    const planId = (r[1] || '').trim();
    if (deletedPlanIds.has(planId)) {
      console.log(`  [DELETE] row ${i + 2}: ${stepId} → plan ${planId}`);
      stepsToDelete.push(i + 1);
      deletedStepIds.add(stepId);
    }
  });
  console.log(`  Total to delete: ${stepsToDelete.length}`);

  // ── Step 4: Find Step_Completions to cascade ──────────────────────────────
  console.log('\n--- Step_Completions ---');
  const compRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Step_Completions!A2:C2000',
  });
  const compRows = compRes.data.values || [];
  const compsToDelete: number[] = [];

  compRows.forEach((r, i) => {
    const compId = (r[0] || '').trim();
    const stepId = (r[1] || '').trim();
    const jobId = (r[2] || '').trim();
    if (deletedStepIds.has(stepId) || ALL_TEST_WO_IDS.has(jobId)) {
      console.log(`  [DELETE] row ${i + 2}: ${compId} → step ${stepId} job ${jobId}`);
      compsToDelete.push(i + 1);
    }
  });
  console.log(`  Total to delete: ${compsToDelete.length}`);

  // ── Step 5: Find Dispatch_Schedule rows to cascade ────────────────────────
  console.log('\n--- Dispatch_Schedule ---');
  const dispRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Dispatch_Schedule!A2:C2000',
  });
  const dispRows = dispRes.data.values || [];
  const dispToDelete: number[] = [];

  dispRows.forEach((r, i) => {
    const slotId = (r[0] || '').trim();
    const kID = (r[2] || '').trim();
    if (ALL_TEST_WO_IDS.has(kID)) {
      console.log(`  [DELETE] row ${i + 2}: ${slotId} → kID ${kID}`);
      dispToDelete.push(i + 1);
    }
  });
  console.log(`  Total to delete: ${dispToDelete.length}`);

  // ── Step 6: Find Carls_Method rows to cascade ─────────────────────────────
  console.log('\n--- Carls_Method ---');
  const cmRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Carls_Method!A2:B2000',
  });
  const cmRows = cmRes.data.values || [];
  const cmToDelete: number[] = [];

  cmRows.forEach((r, i) => {
    const cmId = (r[0] || '').trim();
    const bidVerRef = (r[1] || '').trim();
    // Carls_Method Bid_Version_ID contains a WO reference in the ID string
    if ([...ALL_TEST_WO_IDS].some(wid => cmId.includes(wid.replace('WO-','')) || bidVerRef.includes(wid.replace('WO-','')))) {
      console.log(`  [DELETE] row ${i + 2}: ${cmId}`);
      cmToDelete.push(i + 1);
    }
  });
  console.log(`  Total to delete: ${cmToDelete.length}`);

  // ── Execute deletes ────────────────────────────────────────────────────────
  console.log('\n=== Executing deletes ===');

  const [woSheetId, plansSheetId, stepsSheetId, compsSheetId, dispSheetId, cmSheetId] = await Promise.all([
    getSheetId(sheets, 'Service_Work_Orders'),
    getSheetId(sheets, 'Install_Plans'),
    getSheetId(sheets, 'Install_Steps'),
    getSheetId(sheets, 'Step_Completions'),
    getSheetId(sheets, 'Dispatch_Schedule'),
    getSheetId(sheets, 'Carls_Method'),
  ]);

  await deleteRows(sheets, compsSheetId, 'Step_Completions', compsToDelete);
  await deleteRows(sheets, stepsSheetId, 'Install_Steps', stepsToDelete);
  await deleteRows(sheets, plansSheetId, 'Install_Plans', planToDelete);
  await deleteRows(sheets, dispSheetId, 'Dispatch_Schedule', dispToDelete);
  await deleteRows(sheets, cmSheetId, 'Carls_Method', cmToDelete);
  await deleteRows(sheets, woSheetId, 'Service_Work_Orders', woToDelete);

  // ── Verification ───────────────────────────────────────────────────────────
  console.log('\n=== Verification ===');
  if (!DRY_RUN) {
    const verify = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:B2000',
    });
    const remaining = verify.data.values || [];
    const stillPresent = remaining.filter(r => KNOWN_TEST_WO_IDS.has((r[0]||'').trim()));
    if (stillPresent.length === 0) {
      console.log(`✅ All test WOs removed. Remaining WO count: ${remaining.filter(r => r[0]).length}`);
    } else {
      console.log('❌ Still present:', stillPresent.map(r => r[0]).join(', '));
    }
  } else {
    console.log('[DRY RUN] Re-run with DRY_RUN=false to apply changes.');
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
