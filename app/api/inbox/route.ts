import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth, getSSToken } from '@/lib/gauth';

const USER = 'sean@kulaglass.com';
const BID_LOG_SHEET = '6073963369156484';

function classifyEmail(subject: string, sender: string, snippet: string) {
  const s = (subject + ' ' + snippet + ' ' + sender).toLowerCase();
  if (s.includes('invitation to bid') || s.includes('bid invite') || s.includes('rfp') || s.includes('bid package') || (s.includes('bid') && s.includes('due')))
    return { category: 'bid_invite', priority: 'medium', kaiNote: 'New bid opportunity — review scope and assign to estimator.' };
  if (s.includes('pcd') || s.includes('change order') || s.includes('change notice') || s.includes('pci') || s.includes('bulletin'))
    return { category: 'change_order', priority: 'high', kaiNote: 'Change order or design change — pricing response likely required.' };
  if (s.includes('payment') || s.includes('pay app') || s.includes('invoice') || s.includes('disbursed') || s.includes('bill.com'))
    return { category: 'payment', priority: 'medium', kaiNote: 'Payment or billing action item.' };
  if (s.includes('quote') || s.includes('lead time') || (s.includes('re:') && (s.includes('glass') || s.includes('storefront'))))
    return { category: 'vendor_quote', priority: 'low', kaiNote: 'Vendor quote — file or forward to PM.' };
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


// Hawaii island detection from address, ZIP, or city name
const ISLAND_ZIPS: Record<string, string> = {};
// Maui ZIPs
['96708','96713','96732','96733','96734','96753','96761','96763','96768','96779','96790','96793'].forEach(z => ISLAND_ZIPS[z]='Maui');
// Kauai ZIPs
['96703','96705','96714','96715','96716','96720','96722','96741','96746','96747','96751','96752','96754','96756','96765','96766','96769','96796'].forEach(z => ISLAND_ZIPS[z]='Kauai');
// Big Island ZIPs
['96704','96710','96719','96725','96726','96727','96728','96737','96738','96740','96743','96745','96748','96749','96750','96755','96760','96764','96771','96772','96773','96774','96776','96777','96778','96780','96781','96783','96785'].forEach(z => ISLAND_ZIPS[z]='Hawaii');
const ISLAND_CITIES: Record<string, string> = {
  lahaina:'Maui',kahului:'Maui',wailuku:'Maui',kihei:'Maui',wailea:'Maui',makena:'Maui',
  haiku:'Maui',paia:'Maui',makawao:'Maui',pukalani:'Maui',kapalua:'Maui',napili:'Maui',
  lihue:'Kauai',kapaa:'Kauai',waimea:'Kauai',hanapepe:'Kauai',koloa:'Kauai',poipu:'Kauai',
  princeville:'Kauai',hanalei:'Kauai',kilauea:'Kauai',kekaha:'Kauai',hokuala:'Kauai',
  hilo:'Hawaii',kona:'Hawaii',volcano:'Hawaii',pahoa:'Hawaii',keaau:'Hawaii',
  'kailua-kona':'Hawaii',kohala:'Hawaii',kawaihae:'Hawaii',
  kapolei:'Oahu',waipahu:'Oahu',mililani:'Oahu',kaneohe:'Oahu',kailua:'Oahu',
  waimanalo:'Oahu',waikiki:'Oahu',honolulu:'Oahu',aiea:'Oahu','pearl city':'Oahu',
  'ewa beach':'Oahu','hawaii kai':'Oahu',kahala:'Oahu',schofield:'Oahu',
  kaunakakai:'Molokai','lanai city':'Lanai',
};

function detectIsland(text: string): string | null {
  const t = text.toLowerCase();
  // ZIP code first (most reliable)
  const zips = t.match(/\b(96\d{3})\b/g) || [];
  for (const z of zips) { if (ISLAND_ZIPS[z]) return ISLAND_ZIPS[z]; }
  // City name
  for (const [city, island] of Object.entries(ISLAND_CITIES)) {
    if (t.includes(city)) return island;
  }
  return null;
}

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/gmail.readonly'], USER);
    const gmail = google.gmail({ version: 'v1', auth });

    const QUERY = '(subject:(RFP OR "invitation to bid" OR "bid invite" OR "pcd" OR "change order" OR "bulletin") OR from:(jody@kulaglass.com OR tia@kulaglass.com OR markolson@kulaglass.com)) in:inbox newer_than:14d';
    const listResult = await gmail.users.messages.list({ userId: 'me', q: QUERY, maxResults: 25 });
    const messages = listResult.data.messages || [];

    const items = await Promise.all(
      messages.slice(0, 20).map(async m => {
        const msg = await gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] });
        const headers = Object.fromEntries((msg.data.payload?.headers || []).map(h => [h.name, h.value]));
        return {
          id: m.id!, subject: (headers['Subject'] || '').substring(0, 120),
          from: headers['From'] || '', date: (headers['Date'] || '').substring(0, 25),
          snippet: (msg.data.snippet || '').substring(0, 250),
          unread: (msg.data.labelIds || []).includes('UNREAD'),
        };
      })
    );

    // Smartsheet bid log cross-reference
    let bidEntries: {name: string; assignedTo: string; status: string}[] = [];
    try {
      const token = getSSToken();
      const ssRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${BID_LOG_SHEET}?pageSize=500`, { headers: { 'Authorization': `Bearer ${token}` } });
      const ssData = await ssRes.json() as {columns?: {id: number; title: string}[]; rows?: {cells: {columnId: number; displayValue?: string}[]}[]};
      const cols: Record<number, string> = {};
      for (const c of ssData.columns || []) cols[c.id] = c.title;
      for (const row of ssData.rows || []) {
        const rd: Record<string, string> = {};
        for (const cell of row.cells || []) { if (cols[cell.columnId]) rd[cols[cell.columnId]] = cell.displayValue || ''; }
        if (rd['Job Name']) bidEntries.push({ name: rd['Job Name'], assignedTo: rd['Assigned To'] || '', status: rd['Status'] || '' });
      }
    } catch { /* optional */ }

    const enriched = items.map(item => {
      const { category, priority, kaiNote } = classifyEmail(item.subject, item.from, item.snippet);
      const project = extractProject(item.subject);
      const bidMatch = matchBidLog(project, bidEntries);
      const island = detectIsland(item.subject + ' ' + item.snippet);
      return {
        ...item, from: senderName(item.from), fromEmail: item.from, category, priority,
        kaiNote: bidMatch ? `Already tracked as "${bidMatch.name}" — ${bidMatch.assignedTo}. ${kaiNote}` : kaiNote,
        dueDate: extractDueDate(item.subject, item.snippet), project,
        island,
        bidStatus: bidMatch ? `In bid log — ${bidMatch.assignedTo}` : category === 'bid_invite' ? 'Not in bid log' : null,
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
