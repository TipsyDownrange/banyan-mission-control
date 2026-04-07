/**
 * Seed system_type for existing Step Library templates.
 * Run with: npx tsx scripts/seed-step-template-meta.ts
 */
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const DATA_RANGE = 'Step_Templates!A2:I2000';
const RANGE_BASE = 'Step_Templates';

// Map of template name substrings → system_type
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
  for (const { match, system_type } of SEED_MAP) {
    if (match.test(name)) return system_type;
  }
  return '';
}

async function getGoogleAuth(scopes: string[]) {
  // Try service account key file locations
  const candidates = [
    process.env.GOOGLE_SA_KEY_PATH,
    path.join(process.cwd(), 'service-account.json'),
    path.join(process.cwd(), 'google-service-account.json'),
  ].filter(Boolean) as string[];

  for (const keyPath of candidates) {
    if (fs.existsSync(keyPath)) {
      const auth = new google.auth.GoogleAuth({ keyFile: keyPath, scopes });
      return auth;
    }
  }

  // Fall back to application default credentials
  const auth = new google.auth.GoogleAuth({ scopes });
  return auth;
}

async function main() {
  const auth = await getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
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

  // Track which template names we've already seeded (first row per template gets the system_type)
  const seenTemplates = new Set<string>();
  let updatedCount = 0;

  const updatedRows = rows.map(r => {
    const name = r[0];
    if (!name) return r;

    const row = [...r];
    while (row.length < 9) row.push('');

    // Only set system_type on first row for this template if it's currently blank
    if (!seenTemplates.has(name)) {
      seenTemplates.add(name);
      const existingSystemType = row[6] || '';
      if (!existingSystemType) {
        const systemType = getSystemType(name);
        if (systemType) {
          row[6] = systemType;
          updatedCount++;
          console.log(`  ✓ ${name} → system_type: ${systemType}`);
        } else {
          console.log(`  – ${name} → no match (skipped)`);
        }
      } else {
        console.log(`  ○ ${name} → already has system_type: ${existingSystemType}`);
      }
    }

    return row;
  });

  if (updatedCount === 0) {
    console.log('\nAll templates already have system_type set. Nothing to update.');
    return;
  }

  console.log(`\nWriting ${updatedCount} updates to sheet…`);

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
