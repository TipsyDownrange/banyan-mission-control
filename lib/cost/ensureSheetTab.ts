/**
 * ensureSheetTab — lazy "addSheet" for new backend Sheet tabs.
 *
 * Pattern used in lib/organizationGovernance.ts, lib/entityCrosswalk.ts, etc.
 * Caches per-process so repeated calls in a hot path are cheap. Idempotent:
 * if the tab already exists, the batchUpdate request is swallowed by the
 * shared 400-on-duplicate-name guard.
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const seen = new Set<string>();

export function __resetEnsureSheetTabCacheForTests(): void {
  seen.clear();
}

export async function ensureSheetTab(
  spreadsheetId: string,
  title: string,
  headerRow: string[],
): Promise<void> {
  const cacheKey = `${spreadsheetId}::${title}`;
  if (seen.has(cacheKey)) return;

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const existing = (meta.data.sheets || []).some(s => s.properties?.title === title);

  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    });
    if (headerRow.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headerRow] },
      });
    }
  }

  seen.add(cacheKey);
}
