/**
 * Server-side proxy for Google Places Autocomplete API (New).
 * Key stays server-side — no browser restrictions apply.
 * GET /api/places/autocomplete?input=100+wailea
 */
import { NextResponse } from 'next/server';

const API_KEY = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const input = searchParams.get('input')?.trim() || '';
  if (!input || input.length < 3) return NextResponse.json({ suggestions: [] });
  if (!API_KEY) return NextResponse.json({ error: 'Maps API key not configured' }, { status: 500 });

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
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

    if (!res.ok) {
      const err = await res.text();
      console.error('[Places proxy] API error:', res.status, err);
      return NextResponse.json({ suggestions: [] }, { status: 200 }); // graceful — don't break UI
    }

    const data = await res.json();
    // Shape: { suggestions: [{ placePrediction: { placeId, text, mainText, secondaryText } }] }
    return NextResponse.json({ suggestions: data.suggestions || [] });
  } catch (e) {
    console.error('[Places proxy] fetch error:', e);
    return NextResponse.json({ suggestions: [] });
  }
}
