import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import {
  KB_ARTICLES_SHEET,
  KB_FEEDBACK_SHEET,
  KB_PRODUCT_LINES_SHEET,
  articleToRow,
} from '@/lib/knowledge';

function isAuthorized(email?: string | null) {
  return email?.endsWith('@kulaglass.com');
}

const SHEET_ID = getBackendSheetId();

const SEED_PRODUCT_LINES = [
  { id: 'pl-auto-entrances', name: 'Automatic Entrances', description: 'Automatic sliding, swing, and revolving door systems' },
  { id: 'pl-storefront', name: 'Storefront', description: 'Aluminum storefront framing and glazing' },
  { id: 'pl-curtainwall', name: 'Curtainwall', description: 'Stick and unitized curtainwall systems' },
  { id: 'pl-window-wall', name: 'Window Wall', description: 'Window wall systems and glazing' },
  { id: 'pl-shower-bath', name: 'Shower & Bath', description: 'Frameless and semi-frameless shower enclosures' },
  { id: 'pl-mirrors', name: 'Mirrors', description: 'Commercial and residential mirror fabrication and installation' },
  { id: 'pl-railing', name: 'Railing', description: 'Glass and cable railing systems' },
  { id: 'pl-igu', name: 'IGU / Glass', description: 'Insulated glass units, tempered, laminated, and specialty glass' },
];

const SEED_ARTICLE_BODY = `## Symptoms
- Door does not respond to sensor activation
- Door opens partially and reverses
- Door opens but does not close

## Step 1 — Check Power
Verify the controller box shows a green power LED. Check the circuit breaker. Confirm 120V AC at the power inlet.

## Step 2 — Check Sensor Loop
Cover the activation sensor with your hand and observe the controller indicator. If no response, test sensor wiring continuity from sensor head to controller terminal block.

## Step 3 — Check Safety Edges
Inspect all rubber safety edges for damage or disconnection. A tripped safety edge will prevent door movement.

## Step 4 — Check Motor Drive
With door in manual mode, push door by hand. Resistance indicates a drive belt or gear issue. Check belt tension and motor coupling.

## Step 5 — Check Controller Fault Codes
Refer to manufacturer fault code table. Common codes: E01 = motor overload, E02 = encoder fault, E03 = safety edge open.

## Notes
- Always engage manual mode before working on drive components
- Document fault codes and conditions before clearing`;

export async function POST() {
  const session = await getServerSession();
  if (!isAuthorized(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get existing sheet titles
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const existingTitles = new Set(
      (spreadsheet.data.sheets || []).map(s => s.properties?.title || '')
    );

    const sheetsToCreate = [KB_ARTICLES_SHEET, KB_FEEDBACK_SHEET, KB_PRODUCT_LINES_SHEET]
      .filter(name => !existingTitles.has(name));

    const created: string[] = [];

    // Create missing sheets
    if (sheetsToCreate.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: sheetsToCreate.map(title => ({
            addSheet: { properties: { title } },
          })),
        },
      });
      created.push(...sheetsToCreate);
    }

    // Write headers to newly created sheets
    const headerWrites: { range: string; values: string[][] }[] = [];

    if (sheetsToCreate.includes(KB_ARTICLES_SHEET)) {
      headerWrites.push({
        range: `${KB_ARTICLES_SHEET}!A1`,
        values: [['article_id', 'title', 'body', 'product_line', 'tags', 'status', 'author', 'created_at', 'updated_at', 'helpful_count', 'not_helpful_count', 'parts_refs', 'sources']],
      });
    }
    if (sheetsToCreate.includes(KB_FEEDBACK_SHEET)) {
      headerWrites.push({
        range: `${KB_FEEDBACK_SHEET}!A1`,
        values: [['feedback_id', 'article_id', 'helpful', 'comment', 'submitted_by', 'submitted_at']],
      });
    }
    if (sheetsToCreate.includes(KB_PRODUCT_LINES_SHEET)) {
      headerWrites.push({
        range: `${KB_PRODUCT_LINES_SHEET}!A1`,
        values: [['product_line_id', 'name', 'description']],
      });
    }

    if (headerWrites.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: headerWrites,
        },
      });
    }

    let seeded = false;

    // Seed product lines if newly created OR empty
    const seedProductLines = sheetsToCreate.includes(KB_PRODUCT_LINES_SHEET);
    let plEmpty = seedProductLines;
    if (!plEmpty) {
      const plCheck = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${KB_PRODUCT_LINES_SHEET}!A2:A10`,
      });
      plEmpty = !(plCheck.data.values && plCheck.data.values.length > 0 && plCheck.data.values[0][0]);
    }

    if (plEmpty) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${KB_PRODUCT_LINES_SHEET}!A2`,
        valueInputOption: 'RAW',
        requestBody: {
          values: SEED_PRODUCT_LINES.map(pl => [pl.id, pl.name, pl.description]),
        },
      });
      seeded = true;
    }

    // Seed articles if newly created OR empty
    const seedArticles = sheetsToCreate.includes(KB_ARTICLES_SHEET);
    let artEmpty = seedArticles;
    if (!artEmpty) {
      const artCheck = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${KB_ARTICLES_SHEET}!A2:A3`,
      });
      artEmpty = !(artCheck.data.values && artCheck.data.values.length > 0 && artCheck.data.values[0][0]);
    }

    if (artEmpty) {
      const now = new Date().toISOString();
      const seedArticle = articleToRow({
        article_id: 'ka-ae-001',
        title: 'Automatic Entrance Door Fails to Open — Troubleshooting Guide',
        body: SEED_ARTICLE_BODY,
        product_line: 'Automatic Entrances',
        tags: ['troubleshooting', 'automatic entrances', 'sensor', 'motor'],
        status: 'published',
        author: 'BanyanOS Seed',
        created_at: now,
        updated_at: now,
        helpful_count: 0,
        not_helpful_count: 0,
        parts_refs: [],
        sources: [],
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${KB_ARTICLES_SHEET}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values: [seedArticle] },
      });
      seeded = true;
    }

    return NextResponse.json({ ok: true, created, seeded });
  } catch (err) {
    return NextResponse.json({ error: 'Setup failed', detail: String(err) }, { status: 500 });
  }
}
