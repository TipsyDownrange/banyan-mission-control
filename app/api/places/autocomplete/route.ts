/**
 * Server-side proxy for Google Places Autocomplete API (New).
 * Key stays server-side — no browser restrictions apply.
 * GET /api/places/autocomplete?input=100+wailea
 */
import { NextResponse } from 'next/server';

// GOOGLE_MAPS_SERVER_KEY is unrestricted (server-only, no NEXT_PUBLIC_)
// Falls back to the public key if the server key isn't set yet
const API_KEY = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const input = searchParams.get('input')?.trim() || '';
  if (!input || input.length < 3) return NextResponse.json({ suggestions: [] });

  // Log which key source is active (first 14 chars only — safe to log)
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY || '';
  const publicKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const activeKey = serverKey || publicKey;
  console.log('[Places proxy] key source:', serverKey ? 'GOOGLE_MAPS_SERVER_KEY' : publicKey ? 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' : 'NONE');
  console.log('[Places proxy] key prefix:', activeKey.slice(0, 14) + '…');

  if (!activeKey) {
    console.error('[Places proxy] No API key configured');
    return NextResponse.json({ error: 'Maps API key not configured' }, { status: 500 });
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': activeKey,
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ['us'],
        locationBias: {
          circle: {
            center: { latitude: 20.8, longitude: -156.3 },
            radius: 400000.0,
          },
        },
      }),
    });

    const rawBody = await res.text();
    if (!res.ok) {
      console.error('[Places proxy] API error:', res.status, rawBody);
      return NextResponse.json({ error: rawBody, suggestions: [] }, { status: 200 });
    }

    const data = JSON.parse(rawBody);
    console.log('[Places proxy] suggestions returned:', data.suggestions?.length ?? 0);
    return NextResponse.json({ suggestions: data.suggestions || [] });
  } catch (e) {
    console.error('[Places proxy] fetch error:', e);
    return NextResponse.json({ suggestions: [] });
  }
}
