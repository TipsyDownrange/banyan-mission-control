import { NextResponse } from 'next/server';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SESSIONS_DIR = '/Users/kulaglassopenclaw/.openclaw/agents/main/sessions';

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-4-6': { input: 3.0,  output: 15.0,  cacheRead: 0.30,  cacheWrite: 3.75 },
  'claude-opus-4-6':   { input: 15.0, output: 75.0,  cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-haiku-4-5':  { input: 0.80, output: 4.0,   cacheRead: 0.08,  cacheWrite: 1.00 },
  'claude-haiku-3-5':  { input: 0.80, output: 4.0,   cacheRead: 0.08,  cacheWrite: 1.00 },
};

function getPrice(model: string, inp: number, out: number, cr: number, cw: number): number {
  const key = Object.keys(PRICING).find(k => model.includes(k)) || 'claude-sonnet-4-6';
  const p = PRICING[key];
  return (inp/1e6)*p.input + (out/1e6)*p.output + (cr/1e6)*p.cacheRead + (cw/1e6)*p.cacheWrite;
}

export async function GET() {
  try {
    const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl') && !f.includes('.reset'));

    const byDate: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; calls: number }> = {};
    const byModel: Record<string, { input: number; output: number; cost: number; calls: number }> = {};
    let totalCost = 0;
    let totalCalls = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;

    for (const file of files) {
      const content = readFileSync(join(SESSIONS_DIR, file), 'utf8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const d = JSON.parse(line);
          if (d.type !== 'message') continue;
          const msg = d.message || {};
          const usage = msg.usage || {};
          if (!usage.input && !usage.output) continue;

          const model: string = msg.model || 'claude-sonnet-4-6';
          const date: string = (d.timestamp || '').slice(0, 10);
          const inp: number = usage.input || 0;
          const out: number = usage.output || 0;
          const cr: number = usage.cacheRead || 0;
          const cw: number = usage.cacheWrite || 0;

          // Use embedded cost if available, otherwise calculate
          let cost = 0;
          const costData = usage.cost;
          if (costData && typeof costData === 'object') {
            cost = Object.values(costData).filter(v => typeof v === 'number').reduce((a: number, b) => a + (b as number), 0) as number;
          } else {
            cost = getPrice(model, inp, out, cr, cw);
          }

          if (!byDate[date]) byDate[date] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, calls: 0 };
          byDate[date].input += inp;
          byDate[date].output += out;
          byDate[date].cacheRead += cr;
          byDate[date].cacheWrite += cw;
          byDate[date].cost += cost;
          byDate[date].calls += 1;

          const modelKey = Object.keys(PRICING).find(k => model.includes(k)) || model;
          if (!byModel[modelKey]) byModel[modelKey] = { input: 0, output: 0, cost: 0, calls: 0 };
          byModel[modelKey].input += inp;
          byModel[modelKey].output += out;
          byModel[modelKey].cost += cost;
          byModel[modelKey].calls += 1;

          totalCost += cost;
          totalCalls += 1;
          totalInput += inp;
          totalOutput += out;
          totalCacheRead += cr;
          totalCacheWrite += cw;
        } catch { /* skip malformed */ }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayCost = byDate[today]?.cost || 0;
    const todayTokens = (byDate[today]?.input || 0) + (byDate[today]?.output || 0);

    const entries = Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, d]) => ({
        date,
        model: 'claude-sonnet-4-6',
        inputTokens: d.input,
        outputTokens: d.output,
        cacheReadTokens: d.cacheRead,
        cacheWriteTokens: d.cacheWrite,
        costUsd: d.cost,
        calls: d.calls,
        session: `${d.calls} API calls`,
      }));

    return NextResponse.json({
      entries,
      totalCost,
      todayCost,
      totalCalls,
      totalInput,
      totalOutput,
      totalCacheRead,
      totalCacheWrite,
      todayTokens,
      byModel,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, entries: [], totalCost: 0 });
  }
}
