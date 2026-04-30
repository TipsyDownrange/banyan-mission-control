import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import {
  KB_ARTICLES_SHEET,
  KB_FEEDBACK_SHEET,
  KB_PRODUCT_LINES_SHEET,
  KB_SOURCE_DOCUMENTS_SHEET,
  KB_PARTS_SHEET,
  KB_SEARCH_TERMS_SHEET,
  KB_ARTICLE_VIEWS_SHEET,
  articleToRow,
} from '@/lib/knowledge';

function isAuthorized(email?: string | null) {
  return email?.endsWith('@kulaglass.com');
}

const SHEET_ID = getBackendSheetId();

const ALL_KB_SHEETS = [
  KB_ARTICLES_SHEET,
  KB_FEEDBACK_SHEET,
  KB_PRODUCT_LINES_SHEET,
  KB_SOURCE_DOCUMENTS_SHEET,
  KB_PARTS_SHEET,
  KB_SEARCH_TERMS_SHEET,
  KB_ARTICLE_VIEWS_SHEET,
];

const CANON_HEADERS: Record<string, string[]> = {
  [KB_ARTICLES_SHEET]: [
    'article_id','title','product_line_id','article_type','status','field_visible','revision',
    'symptom_terms','safety_level','stop_conditions','quick_checks','likely_causes','parts_tools',
    'escalation','source_document_ids','last_reviewed_at','owner_user','approved_by','published_at',
    'created_at','updated_at','archived_at','notes',
  ],
  [KB_FEEDBACK_SHEET]: [
    'feedback_id','article_id','submitted_at','submitted_by','user_email','source_app','kID',
    'slot_id','feedback_type','feedback_text','status','triaged_by','triaged_at',
    'resolution_notes','created_task_id',
  ],
  [KB_PRODUCT_LINES_SHEET]: [
    'product_line_id','manufacturer','product_family','display_name','description','status',
    'field_visible','sort_order','created_at','updated_at','last_reviewed_at','owner_notes',
  ],
  [KB_SOURCE_DOCUMENTS_SHEET]: [
    'source_id','title','source_type','manufacturer','product_line_id','url','storage_ref',
    'revision_or_doc_number','source_status','copyright_notes','review_status','last_reviewed_at',
    'reviewed_by','created_at','updated_at','notes',
  ],
  [KB_PARTS_SHEET]: [
    'part_id','product_line_id','manufacturer','part_name','part_number','part_type','description',
    'source_id','vendor_url','verification_status','field_visible','created_at','updated_at','notes',
  ],
  [KB_SEARCH_TERMS_SHEET]: [
    'term_id','term','normalized_term','product_line_id','article_id','term_type','weight',
    'status','created_at','updated_at','notes',
  ],
  [KB_ARTICLE_VIEWS_SHEET]: [
    'view_id','article_id','viewed_at','viewed_by','user_email','source_app','kID',
    'slot_id','query','matched_terms',
  ],
};

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

    const sheetsToCreate = ALL_KB_SHEETS.filter(name => !existingTitles.has(name));
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

    // Write canon headers to newly created sheets
    const headerWrites: { range: string; values: string[][] }[] = [];
    for (const sheetName of sheetsToCreate) {
      headerWrites.push({
        range: `${sheetName}!A1`,
        values: [CANON_HEADERS[sheetName]],
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
    const now = new Date().toISOString();

    // Seed product lines if newly created OR has empty A2
    const plNewlyCreated = sheetsToCreate.includes(KB_PRODUCT_LINES_SHEET);
    let plEmpty = plNewlyCreated;
    if (!plEmpty) {
      const plCheck = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${KB_PRODUCT_LINES_SHEET}!A2:A3`,
      });
      plEmpty = !(plCheck.data.values && plCheck.data.values.length > 0 && plCheck.data.values[0][0]);
    }

    if (plEmpty) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${KB_PRODUCT_LINES_SHEET}!A2`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['ASSA_SW200','ASSA ABLOY','Pedestrian','ASSA SW200','Automatic swing door operator','active','TRUE','1',now,'','',''],
            ['ASSA_SL500','ASSA ABLOY','Pedestrian','ASSA SL500','Automatic sliding door operator','active','TRUE','2',now,'','',''],
            ['ASSA_SL500_RESILIENCE','ASSA ABLOY','Pedestrian','ASSA SL500 Resilience','High-traffic resilience automatic sliding door','active','TRUE','3',now,'','',''],
            ['AUTO_ENTRANCE_GENERIC','Generic','Automatic Entrances','Automatic Entrances (Generic)','Generic automatic entrance troubleshooting','active','TRUE','4',now,'','',''],
          ],
        },
      });
      seeded = true;
    }

    // Seed starter article if newly created OR has empty A2
    const artNewlyCreated = sheetsToCreate.includes(KB_ARTICLES_SHEET);
    let artEmpty = artNewlyCreated;
    if (!artEmpty) {
      const artCheck = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${KB_ARTICLES_SHEET}!A2:A3`,
      });
      artEmpty = !(artCheck.data.values && artCheck.data.values.length > 0 && artCheck.data.values[0][0]);
    }

    if (artEmpty) {
      const seedRow = articleToRow({
        article_id: 'ka-sw200-001',
        title: 'SW200 - Door Opens Then Reverses',
        product_line_id: 'ASSA_SW200',
        article_type: 'troubleshooting',
        status: 'in_review',
        field_visible: 'FALSE',
        revision: '0.1',
        symptom_terms: 'door reverses,opens and closes,safety edge,obstruction',
        safety_level: 'medium',
        stop_conditions: 'Do not override safety edges. Do not bypass obstruction detection.',
        quick_checks: '1. Check for physical obstruction in door path\n2. Inspect safety edges for damage or disconnection\n3. Check controller fault LED',
        likely_causes: 'Safety edge tripped, obstruction in path, encoder fault, controller E03 fault',
        parts_tools: 'Safety edge tester, multimeter, controller manual',
        escalation: 'If fault persists after safety edge and obstruction check, escalate to ASSA service rep',
        source_document_ids: [],
        last_reviewed_at: '',
        owner_user: 'BanyanOS Seed',
        approved_by: '',
        published_at: '',
        created_at: now,
        updated_at: now,
        archived_at: '',
        notes: 'Seed article — review before publishing',
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${KB_ARTICLES_SHEET}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values: [seedRow] },
      });
      seeded = true;
    }

    return NextResponse.json({ ok: true, created, seeded });
  } catch (err) {
    return NextResponse.json({ error: 'Setup failed', detail: String(err) }, { status: 500 });
  }
}
