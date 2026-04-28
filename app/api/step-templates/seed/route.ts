/**
 * One-time seed endpoint: sets system_type for existing templates that lack it.
 * POST /api/step-templates/seed
 * Internal use only — kulaglass.com auth required.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();
const DATA_RANGE = 'Step_Templates!A2:I2000';
const RANGE_BASE = 'Step_Templates';

function isAuthorized(email?: string | null) {
  return email?.endsWith('@kulaglass.com');
}

// Explicit seeds for known templates
const EXPLICIT_SEEDS: Record<string, string> = {
  'Storefront': 'Storefront',
  'Curtainwall': 'Curtainwall',
  'IGU Replacement': 'IGU',
  'Mirror': 'Mirror',
  'Shower Enclosure': 'Shower',
  'Sliding Door': 'Sliding Door',
  'Glass Handrail': 'Railing',
  'Automatic Door': 'Automatic Entrances',
  'BLOCK FRAME WINDOW': 'Window',
};

const SEED_MAP: { match: RegExp; system_type: string }[] = [
  { match: /storefront/i, system_type: 'Storefront' },
  { match: /curtainwall|curtain wall/i, system_type: 'Curtainwall' },
  { match: /igu/i, system_type: 'IGU' },
  { match: /mirror/i, system_type: 'Mirror' },
  { match: /shower/i, system_type: 'Shower' },
  { match: /sliding/i, system_type: 'Sliding Door' },
  { match: /handrail|railing/i, system_type: 'Railing' },
  { match: /automatic/i, system_type: 'Automatic Entrances' },
  { match: /block.frame|window/i, system_type: 'Window' },
];

function getSystemType(name: string): string {
  if (EXPLICIT_SEEDS[name]) return EXPLICIT_SEEDS[name];
  for (const { match, system_type } of SEED_MAP) {
    if (match.test(name)) return system_type;
  }
  return '';
}

export async function POST() {
  try {
    const session = await getServerSession();
    if (!isAuthorized(session?.user?.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Auth check failed' }, { status: 500 });
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: DATA_RANGE,
    });
    const rows = res.data.values || [];

    const seenTemplates = new Set<string>();
    const updates: { name: string; system_type: string }[] = [];

    const updatedRows = rows.map(r => {
      const name = r[0];
      if (!name) return r;

      const row = [...r];
      while (row.length < 9) row.push('');

      if (!seenTemplates.has(name)) {
        seenTemplates.add(name);
        const existingSystemType = row[6] || '';
        if (!existingSystemType) {
          const systemType = getSystemType(name);
          if (systemType) {
            row[6] = systemType;
            updates.push({ name, system_type: systemType });
          }
        }
      }

      return row;
    });

    if (updates.length === 0) {
      return NextResponse.json({ ok: true, message: 'All templates already seeded', updates: [] });
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: DATA_RANGE,
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${RANGE_BASE}!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: updatedRows },
    });

    return NextResponse.json({ ok: true, message: `Seeded ${updates.length} templates`, updates });
  } catch (err) {
    return NextResponse.json({ error: 'Seed failed', detail: String(err) }, { status: 500 });
  }
}
