import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

export const KB_ARTICLES_SHEET = 'KB_Articles';
export const KB_FEEDBACK_SHEET = 'KB_Feedback';
export const KB_PRODUCT_LINES_SHEET = 'KB_Product_Lines';

export interface KBArticle {
  article_id: string;
  title: string;
  body: string;
  product_line: string;
  tags: string[];
  status: 'draft' | 'published';
  author: string;
  created_at: string;
  updated_at: string;
  helpful_count: number;
  not_helpful_count: number;
  parts_refs: string[];
  sources: string[];
}

export interface KBFeedback {
  feedback_id: string;
  article_id: string;
  helpful: boolean;
  comment: string;
  submitted_by: string;
  submitted_at: string;
}

export interface KBProductLine {
  product_line_id: string;
  name: string;
  description: string;
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
    range: `${KB_ARTICLES_SHEET}!A2:M2000`,
  });
  const rows = res.data.values || [];
  const articles: KBArticle[] = rows
    .filter(r => r[0])
    .map(r => ({
      article_id: r[0] || '',
      title: r[1] || '',
      body: r[2] || '',
      product_line: r[3] || '',
      tags: r[4] ? r[4].split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      status: (r[5] === 'published' ? 'published' : 'draft') as 'draft' | 'published',
      author: r[6] || '',
      created_at: r[7] || '',
      updated_at: r[8] || '',
      helpful_count: parseInt(r[9]) || 0,
      not_helpful_count: parseInt(r[10]) || 0,
      parts_refs: r[11] ? r[11].split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      sources: r[12] ? r[12].split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    }));
  if (publishedOnly) return articles.filter(a => a.status === 'published');
  return articles;
}

export async function getArticleById(id: string): Promise<{ article: KBArticle; rowIndex: number } | null> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getBackendSheetId(),
    range: `${KB_ARTICLES_SHEET}!A2:M2000`,
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === id) {
      const article: KBArticle = {
        article_id: r[0] || '',
        title: r[1] || '',
        body: r[2] || '',
        product_line: r[3] || '',
        tags: r[4] ? r[4].split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        status: (r[5] === 'published' ? 'published' : 'draft') as 'draft' | 'published',
        author: r[6] || '',
        created_at: r[7] || '',
        updated_at: r[8] || '',
        helpful_count: parseInt(r[9]) || 0,
        not_helpful_count: parseInt(r[10]) || 0,
        parts_refs: r[11] ? r[11].split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        sources: r[12] ? r[12].split(',').map((s: string) => s.trim()).filter(Boolean) : [],
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
    range: `${KB_FEEDBACK_SHEET}!A2:F2000`,
  });
  const rows = res.data.values || [];
  const feedback: KBFeedback[] = rows
    .filter(r => r[0])
    .map(r => ({
      feedback_id: r[0] || '',
      article_id: r[1] || '',
      helpful: r[2] === 'true',
      comment: r[3] || '',
      submitted_by: r[4] || '',
      submitted_at: r[5] || '',
    }));
  if (articleId) return feedback.filter(f => f.article_id === articleId);
  return feedback;
}

export async function getProductLines(): Promise<KBProductLine[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getBackendSheetId(),
    range: `${KB_PRODUCT_LINES_SHEET}!A2:C200`,
  });
  const rows = res.data.values || [];
  return rows
    .filter(r => r[0])
    .map(r => ({
      product_line_id: r[0] || '',
      name: r[1] || '',
      description: r[2] || '',
    }));
}

export function articleToRow(a: Partial<KBArticle> & { article_id: string }): string[] {
  return [
    a.article_id,
    a.title || '',
    a.body || '',
    a.product_line || '',
    Array.isArray(a.tags) ? a.tags.join(',') : (a.tags || ''),
    a.status || 'draft',
    a.author || '',
    a.created_at || '',
    a.updated_at || '',
    String(a.helpful_count ?? 0),
    String(a.not_helpful_count ?? 0),
    Array.isArray(a.parts_refs) ? a.parts_refs.join(',') : (a.parts_refs || ''),
    Array.isArray(a.sources) ? a.sources.join(',') : (a.sources || ''),
  ];
}
