import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEETS = [
  { label: 'staging', spreadsheetId: '1DZRiKveSJTbCHxBXdWgl_ZqQCaXOjnv02tFZNmnZJ90' },
  { label: 'production', spreadsheetId: '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU' },
] as const;

type CountMap = Record<string, number>;
function clean(v: unknown) { return String(v || '').trim(); }
function bump(map: CountMap, key: unknown) { const k = clean(key) || 'blank'; map[k] = (map[k] || 0) + 1; }
function pct(n: number, d: number) { return d ? Number(((n / d) * 100).toFixed(1)) : 0; }
function norm(v: string) { return v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function top(map: CountMap, limit = 15) { return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0, limit).map(([value,count])=>({value,count})); }

async function main() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    mode: 'read-only WO migration crosswalk readiness; aggregate/sanitized output',
    noWriteConfirmation: 'readonly scope only; no mutating Google Sheets calls; no Postgres/QBO/Drive/Gmail/calendar calls',
    sheets: {},
  };

  for (const sheet of SHEETS) {
    const [woRes, crosswalkRes, usersRes, sitesRes, orgsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: sheet.spreadsheetId, range: 'Service_Work_Orders!A1:AU2000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: sheet.spreadsheetId, range: 'Entity_Crosswalk!A2:E5000' }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({ spreadsheetId: sheet.spreadsheetId, range: 'Users_Roles!A2:R500' }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({ spreadsheetId: sheet.spreadsheetId, range: 'Sites!A2:M5000' }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({ spreadsheetId: sheet.spreadsheetId, range: 'Organizations!A2:P5000' }).catch(() => ({ data: { values: [] } })),
    ]);

    const rows = ((woRes.data.values || []) as string[][]).slice(1).filter(r => r.some(Boolean));
    const crosswalk = new Map<string, string>();
    for (const r of (crosswalkRes.data.values || []) as string[][]) if (clean(r[0]) && clean(r[1])) crosswalk.set(clean(r[0]), clean(r[1]));
    const orgIds = new Set(((orgsRes.data.values || []) as string[][]).map(r => clean(r[0])).filter(Boolean));
    const userTokens = new Set<string>();
    for (const r of (usersRes.data.values || []) as string[][]) [r[0], r[1], r[3]].map(clean).filter(Boolean).forEach(v => userTokens.add(norm(v)));
    const siteTokens = new Set<string>();
    for (const r of (sitesRes.data.values || []) as string[][]) [r[2], r[3], r[5], r[8]].map(clean).filter(Boolean).forEach(v => siteTokens.add(norm(v)));

    const counts = {
      rows: rows.length,
      customerIdPresent: 0, customerCrosswalkHit: 0, orgIdPresent: 0, orgIdKnown: 0,
      assignedPresent: 0, assignedUserHit: 0, addressPresent: 0, sitePossibleHit: 0,
      folderPresent: 0, requiresOrgAssignment: 0, legacyFlagged: 0,
    };
    const rawAssigned: CountMap = {}; const rawStatus: CountMap = {}; const rawIsland: CountMap = {};

    for (const r of rows) {
      const status = clean(r[4]); const island = clean(r[5]); const address = clean(r[7]); const assigned = clean(r[14]);
      const folder = clean(r[23]); const orgId = clean(r[42]); const customerId = clean(r[43]); const legacyFlag = clean(r[44]); const requiresOrg = clean(r[46]);
      bump(rawStatus, status); bump(rawIsland, island); if (assigned) bump(rawAssigned, assigned);
      if (customerId) counts.customerIdPresent++;
      if (customerId && crosswalk.has(customerId)) counts.customerCrosswalkHit++;
      if (orgId) counts.orgIdPresent++;
      if (orgId && orgIds.has(orgId)) counts.orgIdKnown++;
      if (assigned) counts.assignedPresent++;
      if (assigned && userTokens.has(norm(assigned))) counts.assignedUserHit++;
      if (address) counts.addressPresent++;
      if (address && Array.from(siteTokens).some(t => t && norm(address).includes(t))) counts.sitePossibleHit++;
      if (folder) counts.folderPresent++;
      if (['true','yes','1','y'].includes(requiresOrg.toLowerCase())) counts.requiresOrgAssignment++;
      if (legacyFlag && !['false','0','no','n'].includes(legacyFlag.toLowerCase())) counts.legacyFlagged++;
    }

    (report.sheets as Record<string, unknown>)[sheet.label] = {
      spreadsheetId: sheet.spreadsheetId,
      sourceCounts: { crosswalkEntries: crosswalk.size, users: userTokens.size, sites: siteTokens.size, organizations: orgIds.size },
      counts,
      percentages: Object.fromEntries(Object.entries(counts).filter(([k])=>k !== 'rows').map(([k,v]) => [k, pct(v, counts.rows)])),
      topAssignedRaw: top(rawAssigned),
      statusCounts: top(rawStatus, 25),
      islandCounts: top(rawIsland, 25),
      recommendation: 'Do not write to Postgres until customer/org, assigned_to/user, site/address, and folder mappings are repaired or explicitly allowed as raw-only legacy_payload.',
    };
  }

  const outArg = process.argv.find(a => a.startsWith('--out='));
  const out = outArg?.slice(6) || path.join(process.cwd(), 'wo-migration-crosswalk-readiness.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(out);
}
main().catch(err => { console.error(err); process.exit(1); });
