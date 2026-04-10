/**
 * QuickBooks Online utility library
 * - Token management with auto-refresh
 * - Rotating refresh token persisted to Google Sheet (QBO_Config tab)
 * - Authenticated fetch helper with 401 auto-retry
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const MINOR_VERSION = '73';

// ── Process-level token cache ────────────────────────────────────────────────
let _accessToken: string | null = null;
let _accessTokenExpiry: number = 0; // Unix ms

function isTokenValid(): boolean {
  return !!_accessToken && Date.now() < _accessTokenExpiry - 60_000; // 60s buffer
}

// ── Google Sheet helpers ─────────────────────────────────────────────────────
async function getRefreshTokenFromSheet(): Promise<string | null> {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: 'QBO_Config!A:B',
    });
    const rows = res.data.values || [];
    for (const row of rows) {
      if (row[0] === 'QBO_REFRESH_TOKEN') return row[1] || null;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveRefreshTokenToSheet(newToken: string): Promise<void> {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Try to find existing row
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: 'QBO_Config!A:B',
    });
    const rows = res.data.values || [];
    const rowIdx = rows.findIndex(r => r[0] === 'QBO_REFRESH_TOKEN');

    if (rowIdx >= 0) {
      // Update existing
      await sheets.spreadsheets.values.update({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `QBO_Config!B${rowIdx + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[newToken]] },
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: BACKEND_SHEET_ID,
        range: 'QBO_Config!A:B',
        valueInputOption: 'RAW',
        requestBody: { values: [['QBO_REFRESH_TOKEN', newToken]] },
      });
    }
  } catch (err) {
    console.error('[QBO] Failed to save refresh token to sheet:', err);
  }
}

// ── Token refresh ─────────────────────────────────────────────────────────────
async function refreshAccessToken(): Promise<string> {
  const clientId = process.env.QBO_CLIENT_ID?.trim();
  const clientSecret = process.env.QBO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('QBO_CLIENT_ID / QBO_CLIENT_SECRET not set');

  // Prefer sheet token (rotated), fall back to env var
  const refreshToken =
    (await getRefreshTokenFromSheet()) ||
    process.env.QBO_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('No QBO refresh token available');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`QBO token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json();

  // Cache access token
  _accessToken = data.access_token;
  _accessTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

  // Persist rotated refresh token
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await saveRefreshTokenToSheet(data.refresh_token);
  }

  return _accessToken!;
}

// ── Public: get valid access token ───────────────────────────────────────────
export async function getAccessToken(): Promise<string> {
  if (isTokenValid()) return _accessToken!;
  return refreshAccessToken();
}

// ── Public: authenticated QBO fetch with auto-retry on 401 ───────────────────
export async function qboFetch(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<Response> {
  const realmId = process.env.QBO_REALM_ID;
  if (!realmId) throw new Error('QBO_REALM_ID not set');

  const token = await getAccessToken();
  const url = `${QBO_BASE}/${realmId}/${endpoint}`;
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${sep}minorversion=${MINOR_VERSION}`;

  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  // Auto-refresh on 401 and retry once
  if (res.status === 401 && retry) {
    _accessToken = null; // force refresh
    return qboFetch(endpoint, options, false);
  }

  return res;
}

// ── Public: QBO Report fetch (different base path) ────────────────────────────
export async function qboReportFetch(
  reportName: string,
  params: Record<string, string> = {},
  retry = true
): Promise<Response> {
  const realmId = process.env.QBO_REALM_ID;
  if (!realmId) throw new Error('QBO_REALM_ID not set');

  const token = await getAccessToken();
  const qs = new URLSearchParams({ ...params, minorversion: MINOR_VERSION }).toString();
  const url = `${QBO_BASE}/${realmId}/reports/${reportName}?${qs}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 401 && retry) {
    _accessToken = null;
    return qboReportFetch(reportName, params, false);
  }

  return res;
}
