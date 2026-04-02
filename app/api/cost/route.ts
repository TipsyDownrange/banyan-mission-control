import { NextResponse } from 'next/server';

// Cost data is served by a local process on the Mac mini (scripts/cost-server.js)
// It runs on port 3001 and reads OpenClaw session logs directly
const LOCAL_COST_URL = 'http://localhost:3001';

export async function GET() {
  try {
    const res = await fetch(LOCAL_COST_URL, { 
      signal: AbortSignal.timeout(5000),
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`Local cost server returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ 
      error: `Cost server not running. Start it with: node scripts/cost-server.js\n\n${msg}`,
      entries: [], totalCost: 0 
    }, { status: 503 });
  }
}
