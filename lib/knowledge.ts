import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

export const KB_ARTICLES_SHEET = 'KB_Articles';
export const KB_FEEDBACK_SHEET = 'KB_Feedback';
export const KB_PRODUCT_LINES_SHEET = 'KB_Product_Lines';
export const KB_SOURCE_DOCUMENTS_SHEET = 'KB_Source_Documents';
export const KB_PARTS_SHEET = 'KB_Parts';
export const KB_SEARCH_TERMS_SHEET = 'KB_Search_Terms';
export const KB_ARTICLE_VIEWS_SHEET = 'KB_Article_Views';

export interface KBArticle {
  article_id: string;
  title: string;
  product_line_id: string;
  article_type: string;           // troubleshooting | install | reference | service_bulletin | sop
  status: string;                 // draft | in_review | approved | published | archived
  field_visible: string;          // 'TRUE' | 'FALSE'
  revision: string;
  symptom_terms: string;          // comma-sep search terms describing symptoms
  safety_level: string;           // low | medium | high
  stop_conditions: string;        // freetext
  quick_checks: string;           // freetext
  likely_causes: string;          // freetext
  parts_tools: string;            // freetext
  escalation: string;             // freetext
  source_document_ids: string[];  // split from comma-sep string
  last_reviewed_at: string;
  owner_user: string;
  approved_by: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  archived_at: string;
  notes: string;
}

export interface KBFeedback {
  feedback_id: string;
  article_id: string;
  submitted_at: string;
  submitted_by: string;
  user_email: string;
  source_app: string;
  kID: string;
  slot_id: string;
  feedback_type: string;   // helpful | not_helpful | correction | question
  feedback_text: string;
  status: string;          // open | triaged | resolved
  triaged_by: string;
  triaged_at: string;
  resolution_notes: string;
  created_task_id: string;
}

export interface KBProductLine {
  product_line_id: string;
  manufacturer: string;
  product_family: string;
  display_name: string;
  description: string;
  status: string;
  field_visible: string;
  sort_order: string;
  created_at: string;
  updated_at: string;
  last_reviewed_at: string;
  owner_notes: string;
  article_count?: number;
}

export function getSheets() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  return google.sheets({ version: 'v4', auth });
}

export async function getArticles(publishedOnly?: boolean): Promise<KBArticle[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getBackendSheetId(),
    range: `${KB_ARTICLES_SHEET}!A2:W2000`,
  });
  const rows = res.data.values || [];
  const articles: KBArticle[] = rows
    .filter((r: string[]) => r[0])
    .map((r: string[]) => ({
      article_id: r[0] || '',
      title: r[1] || '',
      product_line_id: r[2] || '',
      article_type: r[3] || '',
      status: r[4] || '',
      field_visible: r[5] || 'FALSE',
      revision: r[6] || '',
      symptom_terms: r[7] || '',
      safety_level: r[8] || '',
      stop_conditions: r[9] || '',
      quick_checks: r[10] || '',
      likely_causes: r[11] || '',
      parts_tools: r[12] || '',
      escalation: r[13] || '',
      source_document_ids: r[14] ? r[14].split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      last_reviewed_at: r[15] || '',
      owner_user: r[16] || '',
      approved_by: r[17] || '',
      published_at: r[18] || '',
      created_at: r[19] || '',
      updated_at: r[20] || '',
      archived_at: r[21] || '',
      notes: r[22] || '',
    }));
  if (publishedOnly) {
    return articles.filter(a => a.status === 'published' && a.field_visible === 'TRUE');
  }
  return articles;
}

export async function getArticleById(id: string): Promise<{ article: KBArticle; rowIndex: number } | null> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getBackendSheetId(),
    range: `${KB_ARTICLES_SHEET}!A2:W2000`,
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === id) {
      const article: KBArticle = {
        article_id: r[0] || '',
        title: r[1] || '',
        product_line_id: r[2] || '',
        article_type: r[3] || '',
        status: r[4] || '',
        field_visible: r[5] || 'FALSE',
        revision: r[6] || '',
        symptom_terms: r[7] || '',
        safety_level: r[8] || '',
        stop_conditions: r[9] || '',
        quick_checks: r[10] || '',
        likely_causes: r[11] || '',
        parts_tools: r[12] || '',
        escalation: r[13] || '',
        source_document_ids: r[14] ? r[14].split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        last_reviewed_at: r[15] || '',
        owner_user: r[16] || '',
        approved_by: r[17] || '',
        published_at: r[18] || '',
        created_at: r[19] || '',
        updated_at: r[20] || '',
        archived_at: r[21] || '',
        notes: r[22] || '',
      };
      // rowIndex is 1-based; row 0 is header (row 1 in sheet), data starts at row 2
      return { article, rowIndex: i + 2 };
    }
  }
  return null;
}

export async function getFeedback(articleId?: string): Promise<KBFeedback[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getBackendSheetId(),
    range: `${KB_FEEDBACK_SHEET}!A2:O2000`,
  });
  const rows = res.data.values || [];
  const feedback: KBFeedback[] = rows
    .filter((r: string[]) => r[0])
    .map((r: string[]) => ({
      feedback_id: r[0] || '',
      article_id: r[1] || '',
      submitted_at: r[2] || '',
      submitted_by: r[3] || '',
      user_email: r[4] || '',
      source_app: r[5] || '',
      kID: r[6] || '',
      slot_id: r[7] || '',
      feedback_type: r[8] || '',
      feedback_text: r[9] || '',
      status: r[10] || '',
      triaged_by: r[11] || '',
      triaged_at: r[12] || '',
      resolution_notes: r[13] || '',
      created_task_id: r[14] || '',
    }));
  if (articleId) return feedback.filter(f => f.article_id === articleId);
  return feedback;
}

export async function getProductLines(): Promise<KBProductLine[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getBackendSheetId(),
    range: `${KB_PRODUCT_LINES_SHEET}!A2:L200`,
  });
  const rows = res.data.values || [];
  return rows
    .filter((r: string[]) => r[0])
    .map((r: string[]) => ({
      product_line_id: r[0] || '',
      manufacturer: r[1] || '',
      product_family: r[2] || '',
      display_name: r[3] || '',
      description: r[4] || '',
      status: r[5] || '',
      field_visible: r[6] || 'FALSE',
      sort_order: r[7] || '',
      created_at: r[8] || '',
      updated_at: r[9] || '',
      last_reviewed_at: r[10] || '',
      owner_notes: r[11] || '',
    }));
}

export function articleToRow(a: Partial<KBArticle> & { article_id: string }): string[] {
  return [
    a.article_id,
    a.title || '',
    a.product_line_id || '',
    a.article_type || '',
    a.status || 'draft',
    a.field_visible !== undefined ? a.field_visible : 'FALSE',
    a.revision || '',
    a.symptom_terms || '',
    a.safety_level || '',
    a.stop_conditions || '',
    a.quick_checks || '',
    a.likely_causes || '',
    a.parts_tools || '',
    a.escalation || '',
    Array.isArray(a.source_document_ids) ? a.source_document_ids.join(',') : (a.source_document_ids || ''),
    a.last_reviewed_at || '',
    a.owner_user || '',
    a.approved_by || '',
    a.published_at || '',
    a.created_at || '',
    a.updated_at || '',
    a.archived_at || '',
    a.notes || '',
  ];
}
