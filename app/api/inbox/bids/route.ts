/**
 * GET /api/inbox/bids
 * Reads Gmail inboxes for bid-related emails.
 * Classifies each as: bid_invite | rfp | addendum | bid_result | not_bid
 * Extracts: project name, GC, location, bid due date, scope description, link to plan room
 * Returns structured bid opportunities ready to add to the Bid Log.
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

// Estimators whose inboxes to scan
const SCAN_USERS = [
  'sean@kulaglass.com',
  'kyle@kulaglass.com',
  'jenny@kulaglass.com',
];

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

// Gmail search query to find bid-related emails
// Looks for bid invitations, RFPs, plan room notifications
const BID_QUERY = [
  'subject:(invitation to bid OR ITB OR RFP OR "request for proposal" OR "bid invitation" OR addendum OR "plan holder" OR "bidder" OR "bid due")',
  'newer_than:30d',
  '-label:bid-processed',
].join(' ');

type RawEmail = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
  to: string;
  inbox_owner: string;
  thread_id: string;
};

type BidOpportunity = {
  email_id: string;
  thread_id: string;
  inbox_owner: string;
  // Kai-extracted fields
  project_name: string;
  gc_name: string;
  location: string;
  island: string;
  bid_due_date: string;
  scope_summary: string;
  bid_source: string;         // email, procore, autodesk, kahua, other
  plan_room_link: string;
  has_attachments: boolean;
  attachment_names: string[];
  confidence: 'high' | 'medium' | 'low';
  email_date: string;
  from_email: string;
  raw_subject: string;
  already_in_bid_log: boolean;
};

async function fetchEmailsForUser(user: string, keyJson: object): Promise<RawEmail[]> {
  const auth = new google.auth.JWT({
    email: (keyJson as { client_email: string }).client_email,
    key: (keyJson as { private_key: string }).private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    subject: user,
  });
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: BID_QUERY,
      maxResults: 20,
    });

    const messages = list.data.messages || [];
    const results: RawEmail[] = [];

    for (const msg of messages.slice(0, 15)) {
      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });

        const headers = full.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const from    = headers.find(h => h.name === 'From')?.value || '';
        const date    = headers.find(h => h.name === 'Date')?.value || '';
        const to      = headers.find(h => h.name === 'To')?.value || '';

        // Extract text body
        let body = '';
        function extractText(part: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body += Buffer.from(part.body.data, 'base64').toString('utf8');
          }
          if (part.parts) (part.parts as typeof part[]).forEach(extractText);
        }
        if (full.data.payload) extractText(full.data.payload as Parameters<typeof extractText>[0]);

        results.push({
          id: msg.id!,
          subject,
          from,
          date,
          snippet: full.data.snippet || '',
          body: body.substring(0, 2000),
          to,
          inbox_owner: user,
          thread_id: full.data.threadId || '',
        });
      } catch { /* skip individual message errors */ }
    }

    return results;
  } catch {
    return []; // user inbox not accessible
  }
}

async function extractBidData(emails: RawEmail[]): Promise<BidOpportunity[]> {
  if (!emails.length) return [];

  const prompt = `You are analyzing emails from a Hawaii commercial glass and glazing subcontractor (Kula Glass Company) to identify bid opportunities.

For each email below, determine:
1. Is this a bid invitation, RFP, plan room notification, addendum, or NOT a bid?
2. If it IS a bid opportunity, extract the structured data.

Hawaii islands: Oahu, Maui, Kauai, Hawaii (Big Island), Molokai, Lanai
Common GCs in Hawaii: Nordic PCL, Hensel Phelps, Nan Inc, Swinerton, Gilbane, Albert C. Kobayashi (AKA), Royal Contracting, Goodfellow Bros, T. Iida Contracting, Grace Pacific, Hawaiian Dredging, WCIT Architecture, Ferraro Choi, AHL Architecture
Plan room systems: Procore, Autodesk Construction Cloud, PlanHub, ConstructConnect, Bid Clerk, iSqFt, Kahua

Return a JSON array. For each email include:
{
  "email_id": "...",
  "is_bid": true/false,
  "project_name": "...", 
  "gc_name": "...",
  "location": "city/area",
  "island": "Oahu|Maui|Kauai|Hawaii|Molokai|Lanai|Unknown",
  "bid_due_date": "YYYY-MM-DD or blank",
  "scope_summary": "1-2 sentence scope description",
  "bid_source": "email|procore|autodesk|kahua|planhub|other",
  "plan_room_link": "URL if found, else blank",
  "confidence": "high|medium|low",
  "reason_not_bid": "only if is_bid=false"
}

Emails to analyze:
${emails.map((e, i) => `
--- EMAIL ${i + 1} ---
ID: ${e.id}
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Snippet: ${e.snippet}
Body (first 800 chars): ${e.body.substring(0, 800)}
`).join('\n')}

Return ONLY the JSON array, no other text.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json() as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text || '[]';

  try {
    const extracted = JSON.parse(text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    return extracted
      .filter((e: { is_bid?: boolean }) => e.is_bid)
      .map((e: {
        email_id: string; project_name: string; gc_name: string; location: string;
        island: string; bid_due_date: string; scope_summary: string; bid_source: string;
        plan_room_link: string; confidence: string;
      }, i: number) => ({
        email_id: e.email_id || emails[i]?.id || '',
        thread_id: emails.find(em => em.id === e.email_id)?.thread_id || '',
        inbox_owner: emails.find(em => em.id === e.email_id)?.inbox_owner || '',
        project_name: e.project_name || 'Unknown Project',
        gc_name: e.gc_name || '',
        location: e.location || '',
        island: e.island || 'Unknown',
        bid_due_date: e.bid_due_date || '',
        scope_summary: e.scope_summary || '',
        bid_source: e.bid_source || 'email',
        plan_room_link: e.plan_room_link || '',
        has_attachments: false,
        attachment_names: [],
        confidence: e.confidence || 'medium',
        email_date: emails.find(em => em.id === e.email_id)?.date || '',
        from_email: emails.find(em => em.id === e.email_id)?.from || '',
        raw_subject: emails.find(em => em.id === e.email_id)?.subject || '',
        already_in_bid_log: false,
      }));
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userFilter = searchParams.get('user') || ''; // optional: scan specific user only

    const b64Key = process.env.GOOGLE_SA_KEY_B64;
    if (!b64Key) return NextResponse.json({ error: 'GOOGLE_SA_KEY_B64 not set' }, { status: 500 });
    const keyJson = JSON.parse(Buffer.from(b64Key, 'base64').toString('utf-8'));

    const usersToScan = userFilter
      ? SCAN_USERS.filter(u => u === userFilter)
      : SCAN_USERS;

    // Fetch emails from all inboxes in parallel
    const allEmails: RawEmail[] = [];
    const results = await Promise.allSettled(
      usersToScan.map(user => fetchEmailsForUser(user, keyJson))
    );
    results.forEach(r => {
      if (r.status === 'fulfilled') allEmails.push(...r.value);
    });

    if (!allEmails.length) {
      return NextResponse.json({ opportunities: [], scanned: usersToScan, total_emails: 0 });
    }

    // Use Kai to extract bid data from all emails
    const opportunities = await extractBidData(allEmails);

    return NextResponse.json({
      opportunities,
      scanned: usersToScan,
      total_emails: allEmails.length,
      bids_found: opportunities.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
