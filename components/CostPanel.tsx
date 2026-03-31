'use client';
import { useEffect, useState } from 'react';

type CostEntry = {
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  session: string;
};

// Anthropic pricing (per 1M tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-haiku-3-5': { input: 0.80, output: 4.0 },
};

function calcCost(model: string, inputTok: number, outputTok: number): number {
  const key = Object.keys(PRICING).find(k => model.includes(k)) || 'claude-sonnet-4-6';
  const p = PRICING[key];
  return (inputTok / 1_000_000) * p.input + (outputTok / 1_000_000) * p.output;
}

export default function CostPanel() {
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/cost')
      .then(r => r.json())
      .then(d => { setEntries(d.entries || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalToday = entries.reduce((s, e) => s + e.costUsd, 0);
  const totalTokens = entries.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0);
  const byModel = entries.reduce((acc, e) => {
    acc[e.model] = (acc[e.model] || 0) + e.costUsd;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="label-upper text-ink-meta mb-1">AI Command</div>
        <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Cost &amp; Usage</h1>
        <p className="text-ink-label text-sm mt-1">Token usage and API costs — today</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-5 bg-teal-50">
          <div className="text-[34px] font-extrabold text-teal-700 leading-none mb-1">
            ${totalToday.toFixed(4)}
          </div>
          <div className="label-upper text-ink-label">Cost Today</div>
        </div>
        <div className="card p-5">
          <div className="text-[34px] font-extrabold text-ink-heading leading-none mb-1">
            {(totalTokens / 1000).toFixed(1)}k
          </div>
          <div className="label-upper text-ink-label">Tokens Today</div>
        </div>
        <div className="card p-5">
          <div className="text-[34px] font-extrabold text-ink-heading leading-none mb-1">
            {entries.length}
          </div>
          <div className="label-upper text-ink-label">Sessions</div>
        </div>
      </div>

      {/* By model */}
      {Object.keys(byModel).length > 0 && (
        <div className="card p-6 mb-6">
          <div className="label-upper text-ink-meta mb-4">By Model</div>
          <div className="flex flex-col gap-3">
            {Object.entries(byModel).sort((a, b) => b[1] - a[1]).map(([model, cost]) => {
              const pct = totalToday > 0 ? (cost / totalToday) * 100 : 0;
              return (
                <div key={model}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-bold text-ink-heading">{model}</span>
                    <span className="text-sm text-ink-meta">${cost.toFixed(4)}</span>
                  </div>
                  <div className="h-2 bg-surface-border rounded-pill overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-pill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session log */}
      {loading ? (
        <div className="card p-8 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(91,158,191,0.2)', borderTopColor: '#14b8a6' }} />
        </div>
      ) : entries.length > 0 ? (
        <div className="card divide-y divide-surface-border">
          <div className="px-5 py-3 label-upper text-ink-meta">Session Log</div>
          {entries.map((e, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-ink-heading truncate">{e.session}</div>
                <div className="text-[11px] text-ink-meta">{e.date} · {e.model}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-ink-heading">${e.costUsd.toFixed(4)}</div>
                <div className="text-[11px] text-ink-meta">{((e.inputTokens + e.outputTokens) / 1000).toFixed(1)}k tokens</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-8 flex flex-col items-center text-center">
          <div className="text-4xl mb-3">📊</div>
          <div className="font-extrabold text-ink-heading mb-1">No data yet</div>
          <p className="text-ink-label text-sm max-w-sm">
            Cost tracking pulls from OpenClaw session data. Data will appear here as sessions accumulate.
            <br /><br />
            <span className="font-bold text-ink-secondary">Current model: claude-sonnet-4-6</span><br />
            Input: $3.00 / 1M tokens · Output: $15.00 / 1M tokens
          </p>
        </div>
      )}
    </div>
  );
}
