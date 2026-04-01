import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';

const KEY_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json';
const USER = 'sean@kulaglass.com';
const SS_TOKEN_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/smartsheet-token.txt';
const BID_LOG_SHEET = '6073963369156484';

function classifyEmail(subject: string, sender: string, snippet: string) {
  const s = (subject + ' ' + snippet + ' ' + sender).toLowerCase();
  if (s.includes('invitation to bid') || s.includes('bid invite') || s.includes('request for proposal') || s.includes('rfp') || s.includes('bid package') || (s.includes('bid') && s.includes('due')))
    return { category: 'bid_invite', priority: 'medium', kaiNote: 'New bid opportunity — review scope and assign to estimator.' };
  if (s.includes('pcd') || s.includes('change order') || s.includes('change notice') || s.includes('pci') || s.includes('bulletin'))
    return { category: 'change_order', priority: 'high', kaiNote: 'Change order or design change — pricing response likely required.' };
  if (s.includes('payment') || s.includes('pay app') || s.includes('invoice') || s.includes('disbursed') || s.includes('bill.com'))
    return { category: 'payment', priority: 'medium', kaiNote: 'Payment or billing action item.' };
  if (s.includes('quote') || s.includes('lead time') || (s.includes('re:') && (s.includes('glass') || s.includes('storefront'))))
    return { category: 'vendor_quote', priority: 'low', kaiNote: 'Vendor quote or pricing — file or forward to relevant PM.' };
  if (sender.includes('kulaglass.com'))
    return { category: 'internal', priority: 'medium', kaiNote: 'Internal forward — review and action or delegate.' };
  return { category: 'other', priority: 'low', kaiNote: 'Review and categorize manually.' };
}

function extractDueDate(subject: string, snippet: string): string | null {
  const m = (subject + ' ' + snippet).match(/(?:due|deadline)[:\s]+([A-Za-z]+\.?\s+\d{1,2}(?:,?\s+\d{4})?)/i)
    || (subject + ' ' + snippet).match(/(?:Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar)\w*\s+\d{1,2}(?:,?\s+\d{4})?/i);
  return m ? m[0].replace(/^(due|deadline)[:\s]+/i, '').trim() : null;
}

function extractProject(subject: string) {
  return subject.replace(/^(re:|fwd?:|fw:)\s*/gi, '').replace(/^(invitation to bid[:\s]*|bid invite[:\s]*)/gi, '').substring(0, 70).trim();
}

function senderName(from: string) {
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
    if (words.filter(w => normalize(e.name).includes(w)).length >= 2) return e;
  }
  return null;
}

export async function GET() {
  try {
    const key = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
    const auth = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      subject: USER,
    });

    const gmail = google.gmail({ version: 'v1', auth });
    const QUERY = '(subject:(RFP OR "invitation to bid" OR "bid invite" OR "pcd" OR "change order" OR "bulletin") OR from:(jody@kulaglass.com OR tia@kulaglass.com OR markolson@kulaglass.com)) in:inbox newer_than:14d';

    const listResult = await gmail.users.messages.list({ userId: 'me', q: QUERY, maxResults: 25 });
    const messages = listResult.data.messages || [];

    const items = await Promise.all(
      messages.slice(0, 20).map(async m => {
        const msg = await gmail.users.messages.get({
          userId: 'me', id: m.id!, format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });
        const headers = Object.fromEntries((msg.data.payload?.headers || []).map(h => [h.name, h.value]));
        return {
          id: m.id!,
          subject: (headers['Subject'] || '').substring(0, 120),
          from: headers['From'] || '',
          date: (headers['Date'] || '').substring(0, 25),
          snippet: (msg.data.snippet || '').substring(0, 250),
          unread: (msg.data.labelIds || []).includes('UNREAD'),
        };
      })
    );

    // Load Smartsheet bid log for cross-reference
    let bidEntries: {name: string; assignedTo: string; status: string}[] = [];
    try {
      const token = readFileSync(SS_TOKEN_FILE, 'utf8').trim();
      const ssRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${BID_LOG_SHEET}?pageSize=500`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const ssData = await ssRes.json() as {columns?: {id: number; title: string}[]; rows?: {cells: {columnId: number; value?: string; displayValue?: string}[]}[]};
      const cols: Record<number, string> = {};
      for (const c of ssData.columns || []) cols[c.id] = c.title;
      for (const row of ssData.rows || []) {
        const rd: Record<string, string> = {};
        for (const cell of row.cells || []) { if (cols[cell.columnId]) rd[cols[cell.columnId]] = cell.displayValue || String(cell.value || ''); }
        if (rd['Job Name']) bidEntries.push({ name: rd['Job Name'], assignedTo: rd['Assigned To'] || '', status: rd['Status'] || '' });
      }
    } catch { /* Smartsheet optional */ }

    const enriched = items.map(item => {
      const { category, priority, kaiNote } = classifyEmail(item.subject, item.from, item.snippet);
      const project = extractProject(item.subject);
      const bidMatch = matchBidLog(project, bidEntries);
      return {
        ...item,
        from: senderName(item.from),
        fromEmail: item.from,
        category, priority,
        kaiNote: bidMatch ? `Already tracked as "${bidMatch.name}" — ${bidMatch.assignedTo}. ${kaiNote}` : kaiNote,
        dueDate: extractDueDate(item.subject, item.snippet),
        project, bidStatus: bidMatch ? `In bid log — ${bidMatch.assignedTo}` : category === 'bid_invite' ? 'Not in bid log' : null,
        bidMatch: bidMatch ? { name: bidMatch.name, assignedTo: bidMatch.assignedTo, status: bidMatch.status } : null,
      };
    });

    enriched.sort((a, b) => {
      if (a.unread && !b.unread) return -1;
      if (!a.unread && b.unread) return 1;
      const p: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    });

    return NextResponse.json({ items: enriched, total: listResult.data.resultSizeEstimate || messages.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), items: [] }, { status: 500 });
  }
}
