import { NextRequest } from 'next/server';

const SYSTEM_PROMPT = `You are Kai, the AI intelligence layer for BanyanOS — the operating system for Kula Glass Company, a commercial glass and glazing subcontractor in Hawaii.

You have deep knowledge of:
- Kula Glass operations: 8 active projects across Oahu, Maui, and Kauai
- Active projects: PRJ-26-0001 Hokuala Hotel (Kauai), PRJ-26-0002 War Memorial Gym (Maui), PRJ-26-0003 Makena Beach Club (Maui), PRJ-26-0004 KCC Culinary (Oahu), PRJ-26-0005 War Memorial Football Stadium (Maui), PRJ-26-0006 KS-Olanui/Fuller Glass (Oahu), PRJ-26-0007 Straub Parking Building (Oahu)
- Key people: Sean Daniels (GM/PM), Jody (Owner), Frank (Senior PM - Maui), Kyle & Jenny (Estimators), Joey (Service Lane PM), Nate (Superintendent)
- Field crew: Thomas Begonia, Jay Castillo, Nolan Lagmay, Francis Lynch, James Nakamura, Karl Nakamura Jr., Timothy Stitt, Wendall Tavares
- BanyanOS architecture: Google Sheets backend, Next.js apps, activity spine event model
- Glazing industry: storefront, curtainwall, shower enclosures, sliders, QA processes, Hawaii GET tax

You are accessed through Mission Control — a management-only dashboard. The user is a PM, estimator, superintendent, or executive at Kula Glass.

Be direct, concise, and technically accurate. When you don't have live data yet, say so clearly and tell them what you'd need to answer precisely. You can be tasked with actions (checking job status, flagging issues, drafting reports) — acknowledge these and execute or explain what's needed.`;

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      'data: {"choices":[{"delta":{"content":"No API key configured. Set ANTHROPIC_API_KEY in Vercel environment variables."}}]}\ndata: [DONE]\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'messages-2023-12-15',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages.slice(-20),
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return new Response(
      `data: {"choices":[{"delta":{"content":"API error: ${err.slice(0, 200)}"}}]}\ndata: [DONE]\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  // Transform Anthropic SSE to OpenAI-compatible SSE for the client
  const reader = response.body!.getReader();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                const out = JSON.stringify({ choices: [{ delta: { content: parsed.delta.text } }] });
                controller.enqueue(encoder.encode(`data: ${out}\n\n`));
              }
            } catch {}
          }
        }
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
