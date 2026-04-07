/**
 * Seed system_type for existing Step Library templates.
 * Requires GOOGLE_SA_KEY_B64 env var (same as the Next.js app).
 * Run with: GOOGLE_SA_KEY_B64=... npx tsx scripts/seed-step-template-meta.ts
 * Or: source .vercel/.env.development.local && npx tsx scripts/seed-step-template-meta.ts
 */
import { google } from 'googleapis';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const DATA_RANGE = 'Step_Templates!A2:I2000';
const RANGE_BASE = 'Step_Templates';

// Explicit seeds for the 9 known templates
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

// Fallback regex map for partial matches
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
  // Exact match first
  if (EXPLICIT_SEEDS[name]) return EXPLICIT_SEEDS[name];
  // Partial regex fallback
  for (const { match, system_type } of SEED_MAP) {
    if (match.test(name)) return system_type;
  }
  return '';
}

function getGoogleAuth(scopes: string[]) {
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (!b64) throw new Error('GOOGLE_SA_KEY_B64 env var not set');
  const key = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes,
  });
}

async function main() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  // Load current rows
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: DATA_RANGE,
  });
  const rows = res.data.values || [];

  if (rows.length === 0) {
    console.log('No rows found in Step_Templates.');
    return;
  }

  const seenTemplates = new Set<string>();
  let updatedCount = 0;

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
          updatedCount++;
          console.log(`  ✓ "${name}" → system_type: ${systemType}`);
        } else {
          console.log(`  – "${name}" → no match (skipped)`);
        }
      } else {
        console.log(`  ○ "${name}" → already has system_type: ${existingSystemType}`);
      }
    }

    return row;
  });

  if (updatedCount === 0) {
    console.log('\nAll templates already have system_type set. Nothing to update.');
    return;
  }

  console.log(`\nWriting ${updatedCount} update(s) to sheet…`);

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

  console.log('Done!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
