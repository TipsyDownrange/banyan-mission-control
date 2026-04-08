import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

// Allow up to 120 seconds for GPT-5.4 complex prompts
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are Kai, the AI assistant for BanyanOS — the operating system for Kula Glass Company, a commercial glass and glazing subcontractor in Hawaii.

You have deep knowledge of:
- Kula Glass operations across Oahu, Maui, Kauai, and Hawaii Island
- Key people: Sean Daniels (GM/PM), Jody Boeringa (Owner), Frank Redondo (Senior PM), Kyle Shimizu (Estimator/PM), Jenny Shimabukuro (Admin Manager/PM), Joey Ritthaler (Service PM), Tia Omura (Admin/Asst PM), Jenna Nakama (Admin/Asst PM), Nate Nakamura (Superintendent - Maui), Karl Nakamura Sr. (Superintendent - Oahu)
- BanyanOS architecture: Google Sheets backend, Smartsheet project data, Next.js apps
- Glazing industry: storefront, curtainwall, shower enclosures, sliders, QA processes, Hawaii GET tax

Be direct, concise, and technically accurate. When you don't have live data, say so clearly. Keep responses under 3 paragraphs unless asked for detail.`;

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ reply: 'Please sign in with your Kula Glass account.' }, { status: 401 });
  }

  const { messages } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: 'No API key configured. Set OPENAI_API_KEY in Vercel environment variables.' });
  }

  // Inject live bid log + project context in parallel
  let bidContext = '';
  let projectContext = '';
  try {
    const saKeyBase64 = process.env.GOOGLE_SA_KEY_BASE64;
    const backendSheetId = process.env.GOOGLE_SHEET_ID || process.env.BACKEND_SHEET_ID;
    if (saKeyBase64) {
      const { google } = await import('googleapis');
      const keyJson = JSON.parse(Buffer.from(saKeyBase64, 'base64').toString('utf-8'));
      const auth = new google.auth.JWT({ email: keyJson.client_email, key: keyJson.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
      const sheets = google.sheets({ version: 'v4', auth });

      const [bidResult, projResult] = await Promise.allSettled([
        sheets.spreadsheets.values.get({ spreadsheetId: '18QyNI3JPuUw_nRl2EHSUrlWItOmD8PUlu3fysrwyrcA', range: 'Bids!A1:J50' }),
        backendSheetId ? sheets.spreadsheets.values.get({ spreadsheetId: backendSheetId, range: 'Core_Entities!A2:H200' }) : Promise.resolve(null),
      ]);

      if (bidResult.status === 'fulfilled' && bidResult.value) {
        const rows = bidResult.value.data.values || [];
        if (rows.length > 1) {
          const headers = rows[0];
          const bids = rows.slice(1).map(r => { const b: Record<string,string> = {}; headers.forEach((h,i) => { b[h as string] = r[i] || ''; }); return b; });
          const active = bids.filter(b => !['Won','Lost','No Bid'].includes(b['Win / Loss'] || '') && !['Won','Lost','No Bid'].includes(b['Status'] || '')).slice(0, 30);
          bidContext = `\n\nLIVE BID LOG (active bids, first 30):\n${active.map(b => `${b['kID']} | ${b['Job Name']} | ${b['Assigned To'] || 'Unassigned'} | ${b['Status']} | Due: ${b['Due Date'] || 'TBD'}`).join('\n')}`;
        }
      }

      if (projResult.status === 'fulfilled' && projResult.value) {
        const rows = projResult.value.data.values || [];
        const active = rows.filter(r => r[3] === 'Active');
        if (active.length > 0) {
          projectContext = `\n\nACTIVE PROJECTS (${active.length} total):\n${active.map(r => `${r[0]} | ${r[2]} | PM: ${r[4] || 'TBD'} | ${r[6] || ''}`).join('\n')}`;
        }
      }
    }
  } catch { /* silent */ }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        max_completion_tokens: 4096,
        messages: [
          // If caller already includes a system message (e.g. estimating GPT), use it;
          // otherwise prepend the default Kai system prompt
          ...(messages[0]?.role === 'system'
            ? [{ role: 'system', content: messages[0].content + bidContext + projectContext }, ...messages.slice(1).slice(-20)]
            : [{ role: 'system', content: SYSTEM_PROMPT + bidContext + projectContext }, ...messages.slice(-20)]
          ),
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ reply: `API error: ${err.slice(0, 200)}` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No response.';
    return NextResponse.json({ reply });

  } catch (err) {
    return NextResponse.json({ reply: `Connection error: ${String(err).slice(0, 100)}` });
  }
}
