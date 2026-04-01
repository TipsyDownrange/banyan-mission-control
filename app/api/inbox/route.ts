import { NextResponse } from 'next/server';
import { execSync, execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const KEY_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json';
const SS_TOKEN_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/smartsheet-token.txt';
const USER = 'sean@kulaglass.com';
const BID_LOG_SHEET = '6073963369156484';

function classifyEmail(subject: string, sender: string, snippet: string) {
  const s = (subject + ' ' + snippet + ' ' + sender).toLowerCase();
  if (s.includes('invitation to bid') || s.includes('bid invite') || s.includes('request for proposal') || s.includes('rfp') || s.includes('pricing request') || s.includes('bid package') || (s.includes('bid') && s.includes('due'))) {
    return { category: 'bid_invite', priority: 'medium', kaiNote: 'New bid opportunity — review scope and assign to estimator.' };
  }
  if (s.includes('pcd') || s.includes('change order') || s.includes('change notice') || s.includes('pci') || s.includes('bulletin')) {
    return { category: 'change_order', priority: 'high', kaiNote: 'Change order or design change — pricing response likely required.' };
  }
  if (s.includes('payment') || s.includes('pay app') || s.includes('invoice') || s.includes('disbursed') || s.includes('bill.com')) {
    return { category: 'payment', priority: 'medium', kaiNote: 'Payment or billing action item.' };
  }
  if (s.includes('quote') || s.includes('lead time') || (s.includes('re:') && (s.includes('glass') || s.includes('storefront')))) {
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
  return subject.replace(/^(re:|fwd?:|fw:)\s*/gi, '').replace(/^(invitation to bid[:\s]*|bid invite[:\s]*)/gi, '').substring(0, 70).trim();
}

function senderName(from: string): string {
  const m = from.match(/^([^<]+)</);
  return m ? m[1].trim() : from.split('@')[0];
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function matchBidLog(project: string, entries: {name: string; assignedTo: string; status: string}[]) {
  const proj = normalize(project);
  if (!proj || proj.length < 6) return null;
  const words = proj.split(' ').filter(w => w.length > 3);
  for (const e of entries) {
    const entry = normalize(e.name);
    const matchCount = words.filter(w => entry.includes(w)).length;
    if (matchCount >= 2) return e;
  }
  return null;
}

export async function GET() {
  try {
    // Write Python script to temp file to avoid escaping issues
    const scriptPath = join(tmpdir(), 'kai_inbox.py');
    const script = `import json, sys
from google.oauth2 import service_account
from googleapiclient.discovery import build
import requests

KEY_FILE = '${KEY_FILE}'
USER = '${USER}'
SS_TOKEN_FILE = '${SS_TOKEN_FILE}'
BID_LOG = '${BID_LOG_SHEET}'

# Gmail
creds = service_account.Credentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/gmail.readonly']
).with_subject(USER)
gmail = build('gmail', 'v1', credentials=creds)

QUERY = '(subject:(RFP OR "invitation to bid" OR "bid invite" OR "bid package" OR "pricing request" OR "request for proposal" OR "pcd" OR "change order" OR "change notice" OR "bulletin") OR from:(jody@kulaglass.com OR tia@kulaglass.com OR markolson@kulaglass.com)) in:inbox newer_than:14d'
list_result = gmail.users().messages().list(userId='me', q=QUERY, maxResults=25).execute()
messages = list_result.get('messages', [])

items = []
for m in messages[:20]:
    msg = gmail.users().messages().get(userId='me', id=m['id'], format='metadata', metadataHeaders=['Subject','From','Date']).execute()
    headers = {h['name']: h['value'] for h in msg['payload']['headers']}
    items.append({
        'id': m['id'],
        'subject': headers.get('Subject','')[:120],
        'from': headers.get('From','')[:80],
        'date': headers.get('Date','')[:25],
        'snippet': msg.get('snippet','')[:250],
        'unread': 'UNREAD' in msg.get('labelIds', []),
    })

# Smartsheet bid log for cross-reference
try:
    token = open(SS_TOKEN_FILE).read().strip()
    r = requests.get(f'https://api.smartsheet.com/2.0/sheets/{BID_LOG}?pageSize=500', headers={'Authorization': f'Bearer {token}'}, timeout=8)
    data = r.json()
    cols = {c['id']: c['title'] for c in data.get('columns',[])}
    bid_entries = []
    for row in data.get('rows',[]):
        rd = {cols.get(c['columnId'],''): c.get('displayValue',c.get('value','')) for c in row.get('cells',[])}
        if rd.get('Job Name'):
            bid_entries.append({'name': rd['Job Name'], 'assignedTo': rd.get('Assigned To',''), 'status': rd.get('Status','')})
except:
    bid_entries = []

print(json.dumps({'items': items, 'total': list_result.get('resultSizeEstimate', len(messages)), 'bid_entries': bid_entries}))
`;
    writeFileSync(scriptPath, script);

    const result = execFileSync('python3', [scriptPath], { timeout: 20000, encoding: 'utf8' });
    unlinkSync(scriptPath);

    const raw = JSON.parse(result.trim());
    const bidEntries = raw.bid_entries || [];

    const items = raw.items.map((item: {id: string; subject: string; from: string; date: string; snippet: string; unread: boolean}) => {
      const { category, priority, kaiNote } = classifyEmail(item.subject, item.from, item.snippet);
      const project = extractProject(item.subject);
      const bidMatch = matchBidLog(project, bidEntries);
      const bidStatus = bidMatch
        ? `In bid log — ${bidMatch.assignedTo}${bidMatch.status ? ' · ' + bidMatch.status : ''}`
        : category === 'bid_invite' ? 'Not in bid log — needs to be logged' : null;

      return {
        ...item,
        from: senderName(item.from),
        fromEmail: item.from,
        category, priority,
        kaiNote: bidMatch ? `Already tracked as "${bidMatch.name}" — assigned to ${bidMatch.assignedTo}. ${kaiNote}` : kaiNote,
        dueDate: extractDueDate(item.subject, item.snippet),
        project, bidStatus,
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
    return NextResponse.json({ error: msg.slice(0, 400), items: [] }, { status: 500 });
  }
}
