/**
 * Server-side proxy for Google Places Details API (New).
 * GET /api/places/details?placeId=ChIJ...
 */
import { NextResponse } from 'next/server';

const API_KEY = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get('placeId')?.trim() || '';
  if (!placeId) return NextResponse.json({ error: 'placeId required' }, { status: 400 });
  if (!API_KEY) return NextResponse.json({ error: 'Maps API key not configured' }, { status: 500 });

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=formattedAddress,addressComponents,location`,
      {
        headers: {
          'X-Goog-Api-Key': API_KEY,
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('[Places details proxy] API error:', res.status, err);
      return NextResponse.json({ error: 'Place lookup failed' }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error('[Places details proxy] fetch error:', e);
    return NextResponse.json({ error: 'Place lookup failed' });
  }
}
