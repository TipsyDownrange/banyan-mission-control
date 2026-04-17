/**
 * POST /api/notify/field-issue
 *
 * Called by the Field App after a FIELD_ISSUE event is written to the sheet.
 * Sends email to the WO's PM + island superintendent. CCs sean@ on BLOCKING issues.
 * Uses domain-wide delegation via kai-drive-access SA (same as proposal emails).
 * No auth required — called cross-origin from Field App (fire-and-forget pattern).
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const SENDER = 'joey@kulaglass.com';

// Hawaii city/area → island resolver (mirrors HAWAII_CITY_MAP in ServiceIntake)
const HAWAII_ISLAND_MAP: Array<{ patterns: string[]; island: string }> = [
  { patterns: ['kahului','wailuku','lahaina','napili','kapalua','kaanapali','kihei','wailea','makena','maalaea','kula','makawao','pukalani','paia','haiku','hana','upcountry','maui'], island: 'Maui' },
  { patterns: ['honolulu','waikiki','kailua','kaneohe','aiea','pearl','ewa','mililani','kapolei','waipahu','haleiwa','oahu'], island: 'Oahu' },
  { patterns: ['lihue','kapaa','poipu','koloa','princeville','hanalei','waimea','kauai'], island: 'Kauai' },
  { patterns: ['hilo','kona','kohala','waikoloa','pahoa','keaau','volcano','big island'], island: 'Hawaii' },
  { patterns: ['molokai','kaunakakai'], island: 'Molokai' },
  { patterns: ['lanai city','lanai'], island: 'Lanai' },
];

function resolveIsland(text: string): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  for (const entry of HAWAII_ISLAND_MAP) {
    if (entry.patterns.some(p => lower.includes(p))) return entry.island;
  }
  return '';
}

/** RFC 2047 encode for non-ASCII subject characters */
function rfc2047Encode(text: string): string {
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf-8').toString('base64')}?=`;
}

function getSheetsAuth() {
  return getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
}

function getGmailAuth(subject: string) {
  return getGoogleAuth(['https://www.googleapis.com/auth/gmail.send'], subject);
}

async function lookupWO(kID: string) {
  const auth = getSheetsAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:O2000' });
  const rows = res.data.values || [];
  return rows.find(r => r[0] === kID || r[0]?.includes(kID.replace('WO-', '')));
}

async function lookupUsers() {
  const auth = getSheetsAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Users_Roles!A2:F100' });
  return (res.data.values || []).map(r => ({
    name: r[1] || '', role: r[2] || '', email: r[3] || '', island: r[5] || '',
  }));
}

export async function POST(req: Request) {
  let body: {
    event_id: string; kID: string; project_name: string;
    severity: string; blocking: boolean;
    description: string; category: string; responsible_party: string;
    reported_by: string; location: string; photo_count: number; timestamp: string;
  };
  try { body = await req.json(); }
  catch (e) { console.error('[notify/field-issue] bad body:', e); return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { kID, project_name, severity, blocking, description, category,
    responsible_party, reported_by, location, photo_count, timestamp } = body;

  try {
    // Resolve recipients
    const [woRow, users] = await Promise.all([lookupWO(kID), lookupUsers()]);
    // Resolve island — WO col F may contain city name (e.g. "Kihei") not island name ("Maui")
    const rawIsland = woRow?.[5] || '';
    const woIsland = resolveIsland(rawIsland) || rawIsland || 'Maui';
    const assignedToName = woRow?.[9] || ''; // col J = assigned_to

    // PM: match by name in assigned_to field, or fall back to joey@
    let pmEmail = 'joey@kulaglass.com';
    if (assignedToName) {
      const pmUser = users.find(u => u.name.toLowerCase() === assignedToName.toLowerCase() && u.email);
      if (pmUser?.email) pmEmail = pmUser.email;
    }

    // Superintendent: match by island + role contains Superintendent
    const superUser = users.find(u =>
      u.island.toLowerCase() === woIsland.toLowerCase() &&
      u.role.toLowerCase().includes('superintendent') &&
      u.email
    );
    const superEmail = superUser?.email || '';

    const recipients = [pmEmail];
    if (superEmail && superEmail !== pmEmail) recipients.push(superEmail);

    // Format timestamp
    const dt = new Date(timestamp);
    const timeStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Honolulu' }) + ' HST';

    const severityLabel = severity === 'CRITICAL' ? '🔴 BLOCKING' : severity === 'HIGH' ? '🟡 Problem' : '🟢 Note';
    const subjectText = blocking
      ? `🚨 [BLOCKING] Field Issue — ${project_name}`
      : `⚠️ Field Issue — ${project_name}`;

    const bodyText = [
      `FIELD ISSUE REPORTED`,
      ``,
      `Project: ${project_name}`,
      `WO: ${kID}`,
      `Severity: ${severityLabel}`,
      `Blocking: ${blocking ? 'YES — crew stopped' : 'No'}`,
      `Category: ${category}`,
      `Caused By: ${responsible_party}`,
      location ? `Location: ${location}` : null,
      ``,
      `Description:`,
      description,
      ``,
      `Reported by: ${reported_by}`,
      `Time: ${timeStr}`,
      `Photos: ${photo_count} attached to event record`,
      ``,
      `View in Mission Control:`,
      `https://banyan-mission-control.vercel.app`,
      `(Issues panel → filter by project)`,
    ].filter(l => l !== null).join('\n');

    const auth = getGmailAuth(SENDER);
    const gmail = google.gmail({ version: 'v1', auth });

    const toList = recipients.join(', ');
    const ccList = blocking ? 'sean@kulaglass.com' : '';
    const headerLines = [
      `From: Kula Glass Field App <${SENDER}>`,
      `To: ${toList}`,
      ccList ? `Cc: ${ccList}` : null,
      `Subject: ${rfc2047Encode(subjectText)}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      bodyText,
    ].filter(l => l !== null).join('\r\n');

    const raw = Buffer.from(headerLines).toString('base64url');
    const result = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });

    console.log(`[notify/field-issue] Sent to ${toList}${ccList ? ` CC ${ccList}` : ''} | msgId: ${result.data.id}`);
    return NextResponse.json({ ok: true, recipients, message_id: result.data.id });

  } catch (err) {
    console.error('[notify/field-issue] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
