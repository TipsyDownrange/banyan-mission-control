import { NextResponse } from 'next/server';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const USER = 'sean@kulaglass.com';
const KEY_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json';
const SS_TOKEN_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/smartsheet-token.txt';
const BID_LOG_SHEET = '6073963369156484';

function classifyEmail(subject: string, sender: string, snippet: string) {
  const s = (subject + ' ' + snippet + ' ' + sender).toLowerCase();

  if (s.includes('invitation to bid') || s.includes('bid invite') || s.includes('request for proposal') ||
      s.includes('rfp') || s.includes('pricing request') || s.includes('request for pricing') ||
      s.includes('bid package') || (s.includes('bid') && s.includes('due'))) {
    const urgent = s.includes('due') || s.includes('deadline') || s.includes('asap');
    return { category: 'bid_invite', priority: urgent ? 'high' : 'medium', kaiNote: 'New bid opportunity — review scope and assign to estimator.' };
  }
  if (s.includes('pcd') || s.includes('change order') || s.includes('change notice') ||
      s.includes('pci') || s.includes('cop ') || s.includes('bulletin')) {
    return { category: 'change_order', priority: 'high', kaiNote: 'Change order or design change — pricing response likely required.' };
  }
  if (s.includes('payment') || s.includes('pay app') || s.includes('invoice') ||
      s.includes('disbursed') || s.includes('approval is needed') || s.includes('bill.com')) {
    return { category: 'payment', priority: 'medium', kaiNote: 'Payment or billing action item.' };
  }
  if (s.includes('quote') || s.includes('lead time') ||
      (s.includes('re:') && (s.includes('glass') || s.includes('storefront')))) {
    return { category: 'vendor_quote', priority: 'low', kaiNote: 'Vendor quote or material pricing — file or forward to relevant PM.' };
  }
  if (sender.includes('kulaglass.com')) {
    return { category: 'internal', priority: 'medium', kaiNote: 'Internal forward — review and action or delegate.' };
  }
  return { category: 'other', priority: 'low', kaiNote: 'Review and categorize manually.' };
}

function extractDueDate(subject: string, snippet: string): string | null {
  const combined = subject + ' ' + snippet;
  const m = combined.match(/(?:due|deadline)[:\s]+([A-Za-z]+\.?\s+\d{1,2}(?:,?\s+\d{4})?)/i)
    || combined.match(/(?:Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar)\w*\s+\d{1,2}(?:,?\s+\d{4})?/i);
  return m ? m[0].replace(/^(due|deadline)[:\s]+/i, '').trim() : null;
}

function extractProject(subject: string): string {
  return subject.replace(/^(re:|fwd?:|fw:)\s*/gi, '')
    .replace(/^(invitation to bid[:\s]*|bid invite[:\s]*|bid[:\s]*)/gi, '')
    .substring(0, 70).trim();
}

function senderName(from: string): string {
  const m = from.match(/^([^<]+)</);
  return m ? m[1].trim() : from.split('@')[0];
}

async function getBidLogEntries(): Promise<{ name: string; assignedTo: string; status: string; gc: string; due: string }[]> {
  try {
    const { readFileSync } = await import('fs');
    const token = readFileSync(SS_TOKEN_FILE, 'utf8').trim();
    const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${BID_LOG_SHEET}?pageSize=500`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const cols: Record<number, string> = {};
    for (const c of data.columns || []) cols[c.id] = c.title;
    const entries = [];
    for (const row of data.rows || []) {
      const r: Record<string, string> = {};
      for (const cell of row.cells || []) {
        const k = cols[cell.columnId] || '';
        if (k) r[k] = cell.displayValue || cell.value || '';
      }
      if (r['Job Name']) entries.push({
        name: r['Job Name'] || '',
        assignedTo: r['Assigned To'] || '',
        status: r['Status'] || '',
        gc: r['General Contractor'] || '',
        due: r['Due Date'] ? r['Due Date'].substring(0, 10) : '',
      });
    }
    return entries;
  } catch { return []; }
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function matchBidLog(project: string, entries: { name: string; assignedTo: string; status: string; gc: string; due: string }[]) {
  const proj = normalize(project);
  if (!proj || proj.length < 6) return null;
  const words = proj.split(' ').filter(w => w.length > 3);
  for (const e of entries) {
    const entry = normalize(e.name);
    const matchCount = words.filter(w => entry.includes(w)).length;
    if (matchCount >= 2 || (words.length === 1 && entry.includes(words[0]))) {
      return e;
    }
  }
  return null;
}

export async function GET() {
  try {
    const { execSync } = await import('child_process');

    const script = `
import json, sys
from google.oauth2 import service_account
from googleapiclient.discovery import build

creds = service_account.Credentials.from_service_account_file(
    '${KEY_FILE}',
    scopes=['${SCOPES[0]}']
).with_subject('${USER}')

svc = build('gmail', 'v1', credentials=creds)
QUERY = '(subject:(RFP OR "invitation to bid" OR "bid invite" OR "bid package" OR "pricing request" OR "request for proposal" OR "pcd" OR "change order" OR "change notice" OR "bulletin") OR from:(jody@kulaglass.com OR tia@kulaglass.com OR markolson@kulaglass.com)) in:inbox newer_than:14d'

list_result = svc.users().messages().list(userId='me', q=QUERY, maxResults=25).execute()
messages = list_result.get('messages', [])

items = []
for m in messages[:20]:
    msg = svc.users().messages().get(userId='me', id=m['id'], format='metadata',
        metadataHeaders=['Subject','From','Date']).execute()
    headers = {h['name']: h['value'] for h in msg['payload']['headers']}
    items.append({
        'id': m['id'],
        'subject': headers.get('Subject','')[:120],
        'from': headers.get('From','')[:80],
        'date': headers.get('Date','')[:25],
        'snippet': msg.get('snippet','')[:250],
        'unread': 'UNREAD' in msg.get('labelIds', []),
    })

print(json.dumps({'items': items, 'total': list_result.get('resultSizeEstimate', len(messages))}))
`;

    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`, {
      timeout: 15000,
      encoding: 'utf8',
    });

    const raw = JSON.parse(result.trim());

    // Load bid log for cross-reference
    const bidLog = await getBidLogEntries();

    const items = raw.items.map((item: {
      id: string; subject: string; from: string;
      date: string; snippet: string; unread: boolean;
    }) => {
      const { category, priority, kaiNote } = classifyEmail(item.subject, item.from, item.snippet);
      const project = extractProject(item.subject);
      const bidMatch = matchBidLog(project, bidLog);
      const bidStatus = bidMatch
        ? `In bid log — ${bidMatch.assignedTo}${bidMatch.status ? ' · ' + bidMatch.status : ''}${bidMatch.due ? ' · Due ' + bidMatch.due : ''}`
        : category === 'bid_invite' ? 'Not in bid log — needs to be logged' : null;

      return {
        ...item,
        from: senderName(item.from),
        fromEmail: item.from,
        category,
        priority,
        kaiNote: bidMatch ? `Already tracked: ${bidMatch.name} assigned to ${bidMatch.assignedTo}. ${kaiNote}` : kaiNote,
        dueDate: extractDueDate(item.subject, item.snippet),
        project,
        bidStatus,
        bidMatch: bidMatch ? { name: bidMatch.name, assignedTo: bidMatch.assignedTo, status: bidMatch.status } : null,
      };
    });

    items.sort((a: {unread: boolean; priority: string}, b: {unread: boolean; priority: string}) => {
      if (a.unread && !b.unread) return -1;
      if (!a.unread && b.unread) return 1;
      const p: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    });

    return NextResponse.json({ items, total: raw.total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), items: [] }, { status: 500 });
  }
}
