import fs from 'fs';
import path from 'path';

type AnyRecord = Record<string, any>;
const readinessPath = '/Users/kulaglassopenclaw/.openclaw/workspace/BAN-189_ALL_ROW_DRY_RUN_READINESS_2026-05-07.json';
const crosswalkPath = '/Users/kulaglassopenclaw/.openclaw/workspace/BAN-190_WO_MIGRATION_CROSSWALK_READINESS_2026-05-07.json';

function readJson(p: string) {
  if (!fs.existsSync(p)) throw new Error(`Missing prerequisite report: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as AnyRecord;
}

function lane(name: string, blocker: string, impact: string, repair: string, writeRisk: string, nextPacket: string) {
  return { name, blocker, impact, repair, writeRisk, nextPacket };
}

function main() {
  const readiness = readJson(readinessPath);
  const crosswalk = readJson(crosswalkPath);
  const prodReady = readiness.sheets.production;
  const prodCross = crosswalk.sheets.production;
  const stagingReady = readiness.sheets.staging;
  const stagingCross = crosswalk.sheets.staging;

  const lanes = [
    lane(
      'Assignment normalization',
      'assigned_to contains human names, emails, and comma-separated crews; only about 28% direct user-token hit.',
      `Production assigned present ${prodCross.counts.assignedPresent}/${prodCross.counts.rows}; direct hit ${prodCross.counts.assignedUserHit}.`,
      'Build deterministic assigned_to parser/crosswalk: split comma crews, normalize emails/names, map to Users_Roles IDs, preserve unresolved raw values.',
      'No write needed for planning. Later write risk: medium because assigned_to in Postgres is UUID/user relation.',
      'BAN-192 assignment normalization dry-run',
    ),
    lane(
      'Folder URL remediation',
      'folder_url exists for only about 8% of rows, but folder_url is the WO document anchor.',
      `Production folder present ${prodCross.counts.folderPresent}/${prodCross.counts.rows}; staging folder present ${stagingCross.counts.folderPresent}/${stagingCross.counts.rows}.`,
      'Classify rows by missing folder_url; resolve via existing Drive folder rules only after separate approval. Until then preserve missing state and block write-confidence.',
      'High if repairing Drive/Sheet; keep next packet read-only classification first.',
      'BAN-193 folder URL remediation classification',
    ),
    lane(
      'Site/address resolution',
      'address is raw text; site matching is partial and cannot be trusted as site_id.',
      `Production possible site hit ${prodCross.counts.sitePossibleHit}/${prodCross.counts.rows}; staging possible site hit ${stagingCross.counts.sitePossibleHit}/${stagingCross.counts.rows}.`,
      'Create address normalization + candidate site match report with confidence bands; do not assign site_id without review rules.',
      'Medium; wrong site_id would pollute core identity graph.',
      'BAN-194 site/address candidate matching dry-run',
    ),
    lane(
      'Invoice drift/manual review',
      'AA:AH is legacy_qbo_first header with mixed row semantics; manual invoice review rows remain.',
      `Production manual invoice review ${prodReady.issueCounts.manualInvoiceReview}/${prodReady.totalNonEmptyRows}; staging ${stagingReady.issueCounts.manualInvoiceReview}/${stagingReady.totalNonEmptyRows}.`,
      'Keep invoice fields in legacy_payload until QBO/final/deposit semantics are reconciled; create manual review queue for mixed_drift rows.',
      'High if mapped into canonical invoice fields prematurely.',
      'BAN-195 invoice drift review queue',
    ),
    lane(
      'Cutover delta sync',
      'Sheets stay live during prep; one-time import will miss changed status/schedule/assignment/folder/invoice fields.',
      'Required for final cutover, independent of row cleanup quality.',
      'Implement snapshot hash + changed-row diff report by wo_id/wo_number. Final sync happens after freeze window and before read/write flip.',
      'Medium; read-only diff first, then staging final-sync fixture only with explicit approval.',
      'BAN-196 WO cutover delta diff dry-run',
    ),
  ];

  const lightsOnChecklist = [
    'All WO rows classified by write readiness and blocker lane.',
    'Assignment parser maps crew/name/email strings to Users_Roles IDs or unresolved raw payload.',
    'Folder URL remediation plan approved for missing folder_url rows.',
    'Address/site matching confidence bands reviewed; no blind site_id assignment.',
    'Invoice mixed_drift rows held in manual-review queue or legacy_payload.',
    'First staging shadow import uses a tiny explicit fixture only after Sean approval.',
    'All-row staging shadow import passes counts/reconciliation.',
    'Pre-cutover freeze window declared.',
    'Final Sheet snapshot compared against first import snapshot.',
    'Changed rows delta-synced in staging, then production only with approval.',
    'WO board/detail/dispatch/scheduling/FA handoff verified end-to-end.',
    'Sheets locked read-only as backup after flip.',
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'no-write remediation plan from BAN-189/BAN-190 reports',
    noWriteConfirmation: 'Read existing local reports only. No Sheet/Postgres/QBO/Drive/Gmail/calendar calls.',
    lanes,
    lightsOnChecklist,
    recommendedSequence: lanes.map(l => l.nextPacket),
  };

  const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || '/Users/kulaglassopenclaw/.openclaw/workspace/BAN-191_WO_MIGRATION_REMEDIATION_PLAN_2026-05-07.json';
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  const md = out.replace(/\.json$/, '.md');
  fs.writeFileSync(md, `# BAN-191 WO Migration Remediation Plan — 2026-05-07 HST\n\nNo-write plan generated from BAN-189/BAN-190 reports.\n\n## Remediation lanes\n\n${lanes.map((l, i) => `### ${i + 1}. ${l.name}\n- Blocker: ${l.blocker}\n- Impact: ${l.impact}\n- Repair: ${l.repair}\n- Write risk: ${l.writeRisk}\n- Next packet: ${l.nextPacket}`).join('\n\n')}\n\n## Lights-on checklist\n${lightsOnChecklist.map(item => `- ${item}`).join('\n')}\n`);
  console.log(out);
  console.log(md);
}

main();
