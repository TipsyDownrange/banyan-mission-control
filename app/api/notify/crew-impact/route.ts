/**
 * POST /api/notify/crew-impact
 *
 * Sends email notifications for crew impact events after a field issue.
 * Recipients: superintendent (by island) + PM (from WO) always.
 * sean@ added for DEMOBILIZED and GC_AUTHORIZED.
 * No auth required — called cross-origin from Field App (fire-and-forget).
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';

const SA_KEY = process.env.GOOGLE_SA_KEY_BASE64 || '';
const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const SENDER = 'joey@kulaglass.com';

function rfc2047Encode(text: string): string {
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf-8').toString('base64')}?=`;
}

const HAWAII_ISLAND_MAP: Array<{ patterns: string[]; island: string }> = [
  { patterns: ['kahului','wailuku','lahaina','napili','kapalua','kaanapali','kihei','wailea','makena','maalaea','kula','makawao','pukalani','paia','haiku','hana','upcountry','maui'], island: 'Maui' },
  { patterns: ['honolulu','waikiki','kailua','kaneohe','aiea','pearl','ewa','mililani','kapolei','waipahu','haleiwa','oahu'], island: 'Oahu' },
  { patterns: ['lihue','kapaa','poipu','koloa','princeville','hanalei','waimea','kauai'], island: 'Kauai' },
  { patterns: ['hilo','kona','kohala','waikoloa','pahoa','keaau','volcano','big island'], island: 'Hawaii' },
];

function resolveIsland(text: string): string {
  const lower = (text || '').toLowerCase();
  for (const entry of HAWAII_ISLAND_MAP) {
    if (entry.patterns.some(p => lower.includes(p))) return entry.island;
  }
  return '';
}

function getSheetsAuth() {
  const keyJson = JSON.parse(Buffer.from(SA_KEY, 'base64').toString('utf-8'));
  return new google.auth.GoogleAuth({ credentials: keyJson, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
}
function getGmailAuth(subject: string) {
  const keyJson = JSON.parse(Buffer.from(SA_KEY, 'base64').toString('utf-8'));
  return new google.auth.JWT({
    email: keyJson.client_email, key: keyJson.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'], subject,
  });
}

async function lookupWO(kID: string) {
  const auth = getSheetsAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:O2000' });
  return (res.data.values || []).find(r => r[0] === kID || r[0]?.includes(kID.replace('WO-', '')));
}
async function lookupUsers() {
  const auth = getSheetsAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Users_Roles!A2:F100' });
  return (res.data.values || []).map(r => ({ name: r[1] || '', role: r[2] || '', email: r[3] || '', island: r[5] || '' }));
}

const IMPACT_LABELS: Record<string, string> = {
  REDIRECTED: '🔄 Crew Redirected',
  DEMOBILIZED: '🚛 CREW DEMOBILIZED',
  STANDBY: '⏸️ Crew Standing By',
  GC_AUTHORIZED: '✍️ T&M AUTHORIZED ON SITE',
};

export async function POST(req: Request) {
  if (!SA_KEY) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  let body: {
    event_id: string; issue_event_id: string; kID: string; project_name: string;
    impact_type: 'REDIRECTED' | 'DEMOBILIZED' | 'STANDBY' | 'GC_AUTHORIZED';
    crew_count: number; hours_on_site: number; description: string;
    directed_by: string; going_to: string;
    gc_signer_name: string; gc_signer_title: string; timestamp: string;
    waiting_for?: string; est_wait?: string; redirect_to?: string;
  };
  try { body = await req.json(); }
  catch (e) { console.error('[notify/crew-impact] bad body:', e); return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { kID, project_name, impact_type, crew_count, hours_on_site, description,
    directed_by, going_to, gc_signer_name, gc_signer_title, timestamp,
    waiting_for, est_wait, redirect_to } = body;

  try {
    const [woRow, users] = await Promise.all([lookupWO(kID), lookupUsers()]);
    const woIsland = resolveIsland(woRow?.[5] || '') || woRow?.[5] || 'Maui';
    const assignedToName = woRow?.[9] || '';
    let pmEmail = 'joey@kulaglass.com';
    if (assignedToName) {
      const pmUser = users.find(u => u.name.toLowerCase() === assignedToName.toLowerCase() && u.email);
      if (pmUser?.email) pmEmail = pmUser.email;
    }
    const superUser = users.find(u => u.island.toLowerCase() === woIsland.toLowerCase() && u.role.toLowerCase().includes('superintendent') && u.email);
    const superEmail = superUser?.email || '';

    const recipients = [pmEmail];
    if (superEmail && superEmail !== pmEmail) recipients.push(superEmail);
    // sean@ always for demob + GC authorized
    if (['DEMOBILIZED', 'GC_AUTHORIZED'].includes(impact_type) && !recipients.includes('sean@kulaglass.com')) {
      recipients.push('sean@kulaglass.com');
    }

    const dt = new Date(timestamp);
    const timeStr = dt.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) +
      ' at ' + dt.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZone:'Pacific/Honolulu' }) + ' HST';

    const label = IMPACT_LABELS[impact_type] || impact_type;
    let subjectText = '';
    let bodyText = '';

    if (impact_type === 'REDIRECTED') {
      subjectText = `🔄 Crew redirected — ${project_name}`;
      bodyText = `CREW REDIRECTED\n\nProject: ${project_name}\nMoving to: ${redirect_to || 'not specified'}\nDirected by: ${directed_by}\n\nOriginal issue:\n${description}\n\nTime: ${timeStr}`;
    } else if (impact_type === 'DEMOBILIZED') {
      subjectText = `🚛 CREW DEMOBILIZED — ${project_name} — ${crew_count} crew leaving site`;
      bodyText = `CREW DEMOBILIZED\n\nProject: ${project_name}\nCrew leaving: ${crew_count} workers\nHours on site before demob: ${hours_on_site}h\nGoing to: ${going_to || 'home'}\nDirected by: ${directed_by}\n\nT&M draft created automatically.\n\nOriginal issue:\n${description}\n\nTime: ${timeStr}`;
    } else if (impact_type === 'STANDBY') {
      subjectText = `⏸️ Crew standing by — ${project_name} — waiting for ${waiting_for || 'resolution'}`;
      bodyText = `CREW STANDING BY\n\nProject: ${project_name}\nWaiting for: ${waiting_for}\nEstimated wait: ${est_wait}\n\nOriginal issue:\n${description}\n\nTime: ${timeStr}`;
    } else if (impact_type === 'GC_AUTHORIZED') {
      subjectText = `✍️ T&M AUTHORIZED ON SITE — ${project_name} — Signed by ${gc_signer_name}`;
      bodyText = `T&M AUTHORIZED ON SITE — SIGNATURE CAPTURED\n\nProject: ${project_name}\nAuthorized scope:\n${description}\n\nCrew: ${crew_count} workers × ${hours_on_site}h estimated\n\nSigned by: ${gc_signer_name}${gc_signer_title ? ', ' + gc_signer_title : ''}\nT&M ticket status: AUTHORIZED\n\nTime: ${timeStr}\n\nView in Mission Control:\nhttps://banyan-mission-control.vercel.app`;
    }

    const auth = getGmailAuth(SENDER);
    const gmail = google.gmail({ version: 'v1', auth });
    const toList = recipients.join(', ');
    const headerLines = [
      `From: Kula Glass Field App <${SENDER}>`,
      `To: ${toList}`,
      `Subject: ${rfc2047Encode(subjectText)}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      bodyText,
    ].join('\r\n');

    const raw = Buffer.from(headerLines).toString('base64url');
    const result = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    console.log(`[notify/crew-impact] ${label} sent to ${toList} | msgId: ${result.data.id}`);
    return NextResponse.json({ ok: true, recipients, message_id: result.data.id });
  } catch (err) {
    console.error('[notify/crew-impact] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
