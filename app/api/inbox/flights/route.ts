/**
 * GET /api/inbox/flights
 * Scans Sean's inbox for flight confirmation emails (including forwards from Tia).
 * Extracts passenger names, flight numbers, dates, routes.
 * Returns structured flight data for the "Personnel in the Air" calendar overlay.
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const USER = 'sean@kulaglass.com';

// Known crew — for matching names in itineraries
const CREW_NAMES = [
  'Thomas Begonia','Jay Castillo','Nolan Lagmay','Francis Lynch','James Nakamura',
  'Timothy Stitt','Wendall Tavares','Deric Valoroso','Sonny Ah Kui','Lewis Roman',
  'Christian Altman','Ninja Thang','Malu Cleveland','Layton Domingo','Wena Hun',
  'Santia-Jacob Pascual','Chachleigh Clarabal','Elijah-David Meheula-Lando',
  'Karl Nakamura','Nathan Nakamura','Mark Villados','Tyler Niemeyer','Tyson Omura',
  'Owen Nakamura','Holden Ioanis','Quintin Castro-Perry',
  'Silas Macon','Mien-Quoc Ly','Lonnie McKenzie','Joshua Moore','Troy Sliter',
  'Nate Nakamura','Frank Redondo','Kyle Shimizu','Jenny Shimabukuro','Joey Ritthaler',
  'Sean Daniels','Tia Omura','Jody Boeringa',
];

const HAWAII_AIRPORTS: Record<string, string> = {
  HNL: 'Honolulu (Oahu)', OGG: 'Kahului (Maui)', KOA: 'Kona (Hawaii)',
  ITO: 'Hilo (Hawaii)', LIH: 'Lihue (Kauai)', MKK: 'Molokai',
  LNY: 'Lanai', JHM: 'Kapalua (Maui)', HNM: 'Hana (Maui)',
};

function extractPassengers(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const name of CREW_NAMES) {
    const parts = name.split(' ');
    // Match first+last or just last name (last names are more distinctive)
    if (lower.includes(parts[parts.length - 1].toLowerCase())) {
      // Verify it's a real match (not substring false positive)
      if (lower.includes(name.toLowerCase()) || text.includes(parts[0]) || text.includes(parts[parts.length - 1])) {
        if (!found.includes(name)) found.push(name);
      }
    }
  }
  return found;
}

function extractFlightDate(text: string): string | null {
  // Look for patterns like "Apr 7, 2026" or "April 7" or "04/07/2026"
  const patterns = [
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{1,2},?\s+\d{4}/gi,
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{1,2}/gi,
    /\d{1,2}\/\d{1,2}\/\d{4}/g,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      try {
        const d = new Date(m[0]);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2026) {
          return d.toISOString().slice(0, 10);
        }
      } catch { /* try next */ }
    }
  }
  return null;
}

function extractRoute(text: string): { from: string; to: string; fromCode: string; toCode: string } | null {
  // Match airport codes like OGG→HNL or OGG-HNL or "OGG to HNL"
  const m = text.match(/\b([A-Z]{3})\s*(?:→|->|-|to)\s*([A-Z]{3})\b/);
  if (m) {
    return {
      fromCode: m[1], toCode: m[2],
      from: HAWAII_AIRPORTS[m[1]] || m[1],
      to: HAWAII_AIRPORTS[m[2]] || m[2],
    };
  }
  // Look for Hawaii airport names
  const found: string[] = [];
  for (const [code, name] of Object.entries(HAWAII_AIRPORTS)) {
    if (text.includes(code) || text.toLowerCase().includes(name.split(' ')[0].toLowerCase())) {
      found.push(code);
    }
  }
  if (found.length >= 2) {
    return {
      fromCode: found[0], toCode: found[1],
      from: HAWAII_AIRPORTS[found[0]] || found[0],
      to: HAWAII_AIRPORTS[found[1]] || found[1],
    };
  }
  return null;
}

function extractFlightNumber(text: string): string | null {
  const m = text.match(/\b(?:Hawaiian|Alaska|Southwest|United|American|Delta)\s*(?:Airlines?)?\s*(?:flight\s*)?#?\s*(\d{3,4})\b/i)
    || text.match(/\b(?:HA|AS|WN|UA|AA|DL)\s*(\d{3,4})\b/);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/gmail.readonly'], USER);
    const gmail = google.gmail({ version: 'v1', auth });

    // Search for flight confirmation emails — including forwards from Tia
    const QUERY = [
      'subject:(flight OR itinerary OR "booking confirmation" OR "e-ticket" OR "travel confirmation")',
      'OR from:(tia@kulaglass.com)',
      'OR subject:(OGG OR HNL OR OGG OR LIH OR KOA OR ITO)',
      'newer_than:60d',
    ].join(' ');

    const listResult = await gmail.users.messages.list({ userId: 'me', q: QUERY, maxResults: 30 });
    const messages = listResult.data.messages || [];

    const flights: {
      id: string;
      subject: string;
      date: string;
      flightDate: string | null;
      flightNumber: string | null;
      passengers: string[];
      route: { from: string; to: string; fromCode: string; toCode: string } | null;
      snippet: string;
      isForwardFromTia: boolean;
    }[] = [];

    await Promise.all(messages.slice(0, 20).map(async m => {
      try {
        const msg = await gmail.users.messages.get({
          userId: 'me', id: m.id!,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });
        const headers = Object.fromEntries((msg.data.payload?.headers || []).map(h => [h.name!, h.value!]));
        const subject = headers['Subject'] || '';
        const from = headers['From'] || '';
        const snippet = msg.data.snippet || '';
        const fullText = subject + ' ' + snippet;

        const passengers = extractPassengers(fullText);
        const route = extractRoute(fullText);
        const flightDate = extractFlightDate(fullText);
        const flightNumber = extractFlightNumber(fullText);
        const isForwardFromTia = from.toLowerCase().includes('tia@kulaglass.com');

        // Only include if it looks like a real flight (has route or passengers or flight number)
        if (route || flightNumber || isForwardFromTia) {
          flights.push({
            id: m.id!,
            subject: subject.substring(0, 100),
            date: (headers['Date'] || '').substring(0, 25),
            flightDate,
            flightNumber,
            passengers,
            route,
            snippet: snippet.substring(0, 200),
            isForwardFromTia,
          });
        }
      } catch { /* skip */ }
    }));

    // Sort by flight date
    flights.sort((a, b) => (a.flightDate || '').localeCompare(b.flightDate || ''));

    // Build "in the air" — flights happening today or in next 7 days
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const upcoming = flights.filter(f => f.flightDate && f.flightDate >= today && f.flightDate <= nextWeek);

    return NextResponse.json({
      flights,
      upcoming,
      inTheAir: upcoming.filter(f => f.flightDate === today),
      total: flights.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, flights: [], upcoming: [], inTheAir: [] }, { status: 500 });
  }
}
