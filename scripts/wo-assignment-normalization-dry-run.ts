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
function norm(v: string) { return clean(v).toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function splitAssigned(raw: string) { return clean(raw).split(/[,;/&]+|\band\b/i).map(clean).filter(Boolean); }
function bump(map: CountMap, key: unknown) { const k = clean(key) || 'blank'; map[k] = (map[k] || 0) + 1; }
function top(map: CountMap, limit = 20) { return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0, limit).map(([value,count])=>({value,count})); }
function pct(n: number, d: number) { return d ? Number(((n/d)*100).toFixed(1)) : 0; }

async function main() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    mode: 'read-only WO assignment normalization dry-run',
    noWriteConfirmation: 'readonly scope only; no mutating Google Sheets calls; no Postgres/QBO/Drive/Gmail/calendar calls',
    sheets: {},
  };

  for (const sheet of SHEETS) {
    const [woRes, usersRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: sheet.spreadsheetId, range: 'Service_Work_Orders!A1:AU2000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: sheet.spreadsheetId, range: 'Users_Roles!A2:R500' }).catch(() => ({ data: { values: [] } })),
    ]);
    const userAliases = new Map<string, { user_id: string; name: string; email: string }>();
    for (const r of (usersRes.data.values || []) as string[][]) {
      const user = { user_id: clean(r[0]), name: clean(r[1]), email: clean(r[3]) };
      for (const alias of [user.user_id, user.name, user.email]) if (alias) userAliases.set(norm(alias), user);
    }

    const rows = ((woRes.data.values || []) as string[][]).slice(1).filter(r => r.some(Boolean));
    const rawCounts: CountMap = {}; const tokenCounts: CountMap = {}; const unresolvedCounts: CountMap = {};
    let assignedRows = 0, multiAssignedRows = 0, tokens = 0, matchedTokens = 0, unresolvedTokens = 0;

    for (const row of rows) {
      const raw = clean(row[14]);
      if (!raw) continue;
      assignedRows++;
      bump(rawCounts, raw);
      const parts = splitAssigned(raw);
      if (parts.length > 1) multiAssignedRows++;
      for (const part of parts) {
        tokens++;
        bump(tokenCounts, part);
        const hit = userAliases.get(norm(part));
        if (hit) matchedTokens++;
        else { unresolvedTokens++; bump(unresolvedCounts, part); }
      }
    }

    (report.sheets as Record<string, unknown>)[sheet.label] = {
      spreadsheetId: sheet.spreadsheetId,
      rows: rows.length,
      usersIndexed: userAliases.size,
      assignedRows,
      multiAssignedRows,
      tokens,
      matchedTokens,
      unresolvedTokens,
      percentages: {
        assignedRows: pct(assignedRows, rows.length),
        multiAssignedRows: pct(multiAssignedRows, assignedRows),
        matchedTokens: pct(matchedTokens, tokens),
        unresolvedTokens: pct(unresolvedTokens, tokens),
      },
      topAssignedRaw: top(rawCounts),
      topTokens: top(tokenCounts),
      topUnresolvedTokens: top(unresolvedCounts),
      proposedPayload: {
        assigned_to_raw: 'original Sheet O value',
        assigned_user_ids: 'exact matched Users_Roles user_id array',
        assigned_unresolved_tokens: 'tokens with no exact user_id/name/email match',
        assignment_resolution_status: 'resolved | partial | unresolved | unassigned',
      },
    };
  }

  const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || path.join(process.cwd(), 'wo-assignment-normalization-dry-run.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  const md = out.replace(/\.json$/, '.md');
  const lines = ['# BAN-192 WO Assignment Normalization Dry-Run — 2026-05-07 HST', '', 'No writes performed.', ''];
  for (const [label, s] of Object.entries(report.sheets as Record<string, any>)) {
    lines.push(`## ${label}`, `- Rows: ${s.rows}`, `- Assigned rows: ${s.assignedRows}`, `- Multi-assigned rows: ${s.multiAssignedRows}`, `- Tokens: ${s.tokens}`, `- Matched tokens: ${s.matchedTokens} (${s.percentages.matchedTokens}%)`, `- Unresolved tokens: ${s.unresolvedTokens} (${s.percentages.unresolvedTokens}%)`, '', 'Top unresolved tokens:', ...s.topUnresolvedTokens.slice(0, 10).map((x: any) => `- ${x.value} — ${x.count}`), '');
  }
  fs.writeFileSync(md, lines.join('\n'));
  console.log(out); console.log(md);
}
main().catch(err => { console.error(err); process.exit(1); });
