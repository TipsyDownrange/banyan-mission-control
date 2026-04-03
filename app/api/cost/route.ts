import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Anthropic pricing (per 1M tokens)
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-4-6':  { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5':   { input: 0.80,  output: 4.00,  cacheRead: 0.08, cacheWrite: 1.00 },
  'claude-opus-4-6':    { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'default':            { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
};

function calcCost(model: string, usage: { input?: number; output?: number; cache_read?: number; cache_write?: number }): number {
  const p = PRICING[model] || PRICING.default;
  const inp = (usage.input || 0) / 1e6;
  const out = (usage.output || 0) / 1e6;
  const cr  = (usage.cache_read || 0) / 1e6;
  const cw  = (usage.cache_write || 0) / 1e6;
  return inp * p.input + out * p.output + cr * p.cacheRead + cw * p.cacheWrite;
}

export async function GET() {
  try {
    const sessionsDir = path.join(process.env.HOME || '/Users/kulaglassopenclaw', '.openclaw/agents/main/sessions');

    if (!fs.existsSync(sessionsDir)) {
      return NextResponse.json({ error: 'Sessions directory not found', totalCost: 0, todayCost: 0 });
    }

    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    const today = new Date().toISOString().slice(0, 10);

    type DaySummary = { date: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number; calls: number };
    const byDay: Record<string, DaySummary> = {};
    const byModel: Record<string, { input: number; output: number; cost: number; calls: number }> = {};
    let totalCost = 0;
    let totalCalls = 0;

    for (const file of files) {
      const content = fs.readFileSync(path.join(sessionsDir, file), 'utf8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type !== 'message' || !entry.message?.usage) continue;

          const usage = entry.message.usage;
          const model = entry.message.model || 'default';
          const date = (entry.timestamp || '').slice(0, 10);
          if (!date) continue;

          const inp  = usage.input || usage.input_tokens || 0;
          const out  = usage.output || usage.output_tokens || 0;
          const cr   = usage.cache_read || usage.cache_read_input_tokens || 0;
          const cw   = usage.cache_write || usage.cache_creation_input_tokens || 0;
          const cost = calcCost(model, { input: inp, output: out, cache_read: cr, cache_write: cw });

          if (!byDay[date]) byDay[date] = { date, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, calls: 0 };
          byDay[date].inputTokens += inp;
          byDay[date].outputTokens += out;
          byDay[date].cacheReadTokens += cr;
          byDay[date].cacheWriteTokens += cw;
          byDay[date].costUsd += cost;
          byDay[date].calls += 1;

          if (!byModel[model]) byModel[model] = { input: 0, output: 0, cost: 0, calls: 0 };
          byModel[model].input += inp;
          byModel[model].output += out;
          byModel[model].cost += cost;
          byModel[model].calls += 1;

          totalCost += cost;
          totalCalls += 1;
        } catch { /* skip malformed lines */ }
      }
    }

    const entries = Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
    const todayCost = byDay[today]?.costUsd || 0;

    return NextResponse.json({
      entries,
      totalCost: Math.round(totalCost * 100) / 100,
      todayCost: Math.round(todayCost * 10000) / 10000,
      totalCalls,
      totalInput:  entries.reduce((s, e) => s + e.inputTokens, 0),
      totalOutput: entries.reduce((s, e) => s + e.outputTokens, 0),
      totalCacheRead:  entries.reduce((s, e) => s + e.cacheReadTokens, 0),
      totalCacheWrite: entries.reduce((s, e) => s + e.cacheWriteTokens, 0),
      byModel,
      dailyBudget: 50,
      overBudget: todayCost > 50,
    });

  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      totalCost: 0, todayCost: 0, entries: [], byModel: {},
    }, { status: 500 });
  }
}
