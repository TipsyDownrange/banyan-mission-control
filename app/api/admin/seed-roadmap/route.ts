/**
 * GET /api/admin/seed-roadmap
 * One-time: backfills phase + source on existing Tasks rows.
 * Sean only. Uses category to infer phase.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Tasks';

const CATEGORY_PHASE: Record<string, string> = {
  'Estimating': 'Phase 1',
  'Documentation': 'Phase 1',
  'Service': 'Phase 3',
  'Infrastructure': 'Phase 0',
  'Field App': 'Phase 1',
  'Mission Control': 'Phase 1',
  'Scheduling': 'Phase 2',
  'Feedback': 'Inbox',
};

export async function GET(req: Request) {
  const session = await getServerSession();
  if (session?.user?.email !== 'sean@kulaglass.com') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const dry = new URL(req.url).searchParams.get('dry') === 'true';

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A2:N2000`,
    });
    const rows = (res.data.values || []) as string[][];

    const updates: { range: string; values: string[][] }[] = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue; // empty row

      const taskId = row[0];
      const category = row[5] || '';
      const existingPhase = row[12] || '';
      const existingSource = row[13] || '';
      const rowNum = i + 2;

      // Infer phase from category if not already set
      const inferredPhase = existingPhase || CATEGORY_PHASE[category] || '';
      const inferredSource = existingSource || (category === 'Feedback' ? 'feedback' : 'manual');

      let changed = false;
      if (inferredPhase && inferredPhase !== existingPhase) {
        updates.push({ range: `${TAB}!M${rowNum}`, values: [[inferredPhase]] });
        changed = true;
      }
      if (inferredSource !== existingSource) {
        updates.push({ range: `${TAB}!N${rowNum}`, values: [[inferredSource]] });
        changed = true;
      }

      if (!changed) skipped++;
      else console.log(`[seed-roadmap] ${taskId} → phase: ${inferredPhase}, source: ${inferredSource}`);
    }

    if (!dry && updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
      });
    }

    return NextResponse.json({
      ok: true,
      rows_scanned: rows.filter(r => r[0]).length,
      updated: dry ? 0 : updates.length,
      would_update: updates.length,
      skipped,
      dry_run: dry,
    });
  } catch (err) {
    console.error('[seed-roadmap]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
