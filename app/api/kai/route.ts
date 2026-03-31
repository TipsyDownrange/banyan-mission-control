import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are Kai, the AI intelligence layer for BanyanOS — the operating system for Kula Glass Company, a commercial glass and glazing subcontractor in Hawaii.

You have deep knowledge of:
- Kula Glass operations: 8 active projects across Oahu, Maui, and Kauai
- Active projects: PRJ-26-0001 Hokuala Hotel (Kauai), PRJ-26-0002 War Memorial Gym (Maui), PRJ-26-0003 Makena Beach Club (Maui), PRJ-26-0004 KCC Culinary (Oahu), PRJ-26-0005 War Memorial Football Stadium (Maui), PRJ-26-0006 KS-Olanui/Fuller Glass (Oahu), PRJ-26-0007 Straub Parking Building (Oahu)
- Key people: Sean Daniels (GM/PM), Jody (Owner), Frank (Senior PM - Maui), Kyle & Jenny (Estimators), Joey (Service Lane PM), Nate (Superintendent)
- Field crew: Thomas Begonia, Jay Castillo, Nolan Lagmay, Francis Lynch, James Nakamura, Karl Nakamura Jr., Timothy Stitt, Wendall Tavares
- BanyanOS architecture: Google Sheets backend, Next.js apps, activity spine event model
- Glazing industry: storefront, curtainwall, shower enclosures, sliders, QA processes, Hawaii GET tax

You are accessed through Mission Control — a management-only dashboard. Be direct, concise, and technically accurate. When you don't have live data, say so clearly. Keep responses under 3 paragraphs unless asked for detail.`;

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: 'No API key configured. Set ANTHROPIC_API_KEY in Vercel environment variables.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messages.slice(-20),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ reply: `API error: ${err.slice(0, 200)}` });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'No response.';
    return NextResponse.json({ reply });

  } catch (err) {
    return NextResponse.json({ reply: `Connection error: ${String(err).slice(0, 100)}` });
  }
}
