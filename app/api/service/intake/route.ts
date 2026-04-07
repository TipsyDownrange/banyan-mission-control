import { hawaiiToday, hawaiiYear2 } from '@/lib/hawaii-time';
import { NextResponse } from 'next/server';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

// Parse a natural language lead description into structured work order fields
export async function POST(req: Request) {
  const { description, mode } = await req.json();

  if (!description) return NextResponse.json({ error: 'No description provided' }, { status: 400 });

  const ISLAND_CITIES: Record<string, string> = {
    lahaina: 'Maui', kahului: 'Maui', wailuku: 'Maui', kihei: 'Maui', wailea: 'Maui',
    makena: 'Maui', kapalua: 'Maui', makawao: 'Maui', paia: 'Maui',
    lihue: 'Kauai', kapaa: 'Kauai', poipu: 'Kauai', princeville: 'Kauai',
    hilo: 'Hawaii', kona: 'Hawaii', waimea: 'Hawaii',
    honolulu: 'Oahu', kapolei: 'Oahu', kailua: 'Oahu', kaneohe: 'Oahu',
    waikiki: 'Oahu', 'hawaii kai': 'Oahu', aiea: 'Oahu',
  };

  const prompt = `Extract structured work order fields from this service lead description. Return ONLY valid JSON with these fields (leave blank if not mentioned):

{
  "customerName": "",
  "address": "",
  "city": "",
  "island": "",
  "contactPerson": "",
  "contactPhone": "",
  "contactEmail": "",
  "description": "",
  "systemType": "",
  "urgency": "normal",
  "estimatedHours": "",
  "notes": ""
}

Rules:
- systemType must be one of: Storefront, Window Wall, Curtainwall, Exterior Doors, Interior Doors, Shower Enclosure, Mirror, Skylights, Railing, Automatic Entrances, Other
- urgency: "urgent", "normal", or "low"  
- island: detect from city name if not stated
- Keep description concise but complete
- Extract phone numbers in format 808-XXX-XXXX

Description: "${description}"

Return only the JSON object, no other text.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    const parsed = JSON.parse(text.trim());

    // Auto-detect island from city if not set
    if (!parsed.island && parsed.city) {
      const city = parsed.city.toLowerCase();
      parsed.island = Object.entries(ISLAND_CITIES).find(([k]) => city.includes(k))?.[1] || '';
    }

    // Generate a WO number
    const year = hawaiiYear2();
    const seq = Math.floor(Math.random() * 9000) + 1000;
    parsed.woNumber = `${year}-${seq}`;
    parsed.dateReceived = hawaiiToday();
    parsed.status = 'REQUESTING A PROPOSAL';

    return NextResponse.json({ workOrder: parsed, confidence: 'high' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
