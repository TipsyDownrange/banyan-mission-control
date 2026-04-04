'use client';
import { useEffect, useState, useCallback } from 'react';

type Session = {
  key: string; model: string; inputTokens: number; outputTokens: number;
  cacheRead: number; cacheWrite: number; totalTokens: number;
  estimatedCost: number; startedAt: string; updatedAt: string;
  status: string; isSubagent: boolean; date: string;
};

type DayData = { cost: number; tokens: number; sessions: number; input: number; output: number; cache: number };
type ModelData = { cost: number; input: number; output: number; sessions: number };

type CostData = {
  sessions: Session[];
  totalCost: number;
  todayCost: number;
  todayTokens: number;
  totalInput: number;
  totalOutput: number;
  totalCache: number;
  totalTokens: number;
  byDay: Record<string, DayData>;
  byModel: Record<string, ModelData>;
  activeSession: Session | null;
  dailyBudget: number;
  overBudget: boolean;
  lastUpdated: string;
  error?: string;
};

type TimeRange = 'today' | 'week' | 'month' | 'all' | 'custom';

function fmt(n: number): string {
  if (n >= 1e9) return `${(n/1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(0)}K`;
  return n.toString();
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
}

const MODEL_COLOR: Record<string, string> = {
  'claude-sonnet-4-6': '#0369a1',
  'claude-opus-4-6':   '#6d28d9',
  'claude-haiku-4-5':  '#0f766e',
  'claude-haiku-3-5':  '#0f766e',
};

function modelColor(m: string): string {
  return MODEL_COLOR[m] || '#64748b';
}

function modelShort(m: string): string {
  return m.replace('claude-', '').replace('-4-6', ' 4.6').replace('-4-5', ' 4.5').replace('-3-5', ' 3.5');
}

export default function CostPanel() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [view, setView] = useState<'overview' | 'daily' | 'sessions' | 'models'>('overview');
  const [lastRefresh, setLastRefresh] = useState('');

  const load = useCallback(() => {
    fetch('/api/cost')
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
        setLastRefresh(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 60s
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  // Date range filtering
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo  = new Date(Date.now() - 7  * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  function inRange(date: string): boolean {
    if (!date) return false;
    if (range === 'today')  return date === today;
    if (range === 'week')   return date >= weekAgo;
    if (range === 'month')  return date >= monthAgo;
    if (range === 'all')    return true;
    if (range === 'custom') return (!customFrom || date >= customFrom) && (!customTo || date <= customTo);
    return true;
  }

  const filteredSessions = data?.sessions.filter(s => inRange(s.date)) || [];
  const filteredDays = Object.entries(data?.byDay || {}).filter(([d]) => inRange(d)).sort((a, b) => b[0].localeCompare(a[0]));

  const rangeTotal  = filteredSessions.reduce((s, x) => s + x.estimatedCost, 0);
  const rangeTokens = filteredSessions.reduce((s, x) => s + x.totalTokens, 0);

  const todayCost = data?.byDay[today]?.cost || 0;
  const budget    = data?.dailyBudget || 50;
  const budgetPct = Math.min((todayCost / budget) * 100, 100);
  const overBudget = todayCost > budget;

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading cost data…</div>
    </div>
  );

  if (!data || data.error) return (
    <div style={{ padding: 32 }}>
      <div style={{ background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: '20px 24px' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#b91c1c', marginBottom: 6 }}>Failed to load cost data</div>
        <div style={{ fontSize: 13, color: '#475569' }}>{data?.error || 'Network error'}</div>
        <button onClick={load} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 10, background: '#0f172a', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '32px', maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>AI Command</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Cost & Usage</h1>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Live from OpenClaw sessions · refreshes every 60s
              {lastRefresh && <span style={{ marginLeft: 8, color: '#cbd5e1' }}>Last: {lastRefresh}</span>}
            </div>
          </div>
          <button onClick={load} style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* LIVE TICKER — Today's spend */}
      <div style={{
        background: overBudget
          ? 'linear-gradient(135deg, #fef2f2, #fff5f5)'
          : 'linear-gradient(135deg, #071722, #0c2330)',
        borderRadius: 20, padding: '24px 28px', marginBottom: 20,
        border: overBudget ? '2px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.04)',
        boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: overBudget ? '#ef4444' : 'rgba(148,163,184,0.6)', marginBottom: 6 }}>
              {overBudget ? '⚠ OVER DAILY BUDGET' : '📍 Today\'s Spend'}
            </div>
            <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.06em', color: overBudget ? '#b91c1c' : '#f8fafc', lineHeight: 1 }}>
              ${todayCost.toFixed(2)}
            </div>
            <div style={{ fontSize: 13, color: overBudget ? '#ef4444' : 'rgba(148,163,184,0.7)', marginTop: 6 }}>
              of ${budget} daily budget · {fmt(data.byDay[today]?.tokens || 0)} tokens
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 160 }}>
            {/* Budget bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(148,163,184,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Budget used</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: overBudget ? '#ef4444' : '#14b8a6' }}>{budgetPct.toFixed(0)}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${budgetPct}%`, background: overBudget ? '#ef4444' : '#14b8a6', borderRadius: 999, transition: 'width 0.5s' }} />
              </div>
            </div>
            {/* All-time total */}
            <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(148,163,184,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>All-time total</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: overBudget ? '#0f172a' : '#f8fafc' }}>${data.totalCost.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Active session indicator */}
      {data.activeSession && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#f0fdfa', border: '1px solid rgba(15,118,110,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#14b8a6', animation: 'pulse 2s infinite' }} />
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f766e' }}>Active session: {modelShort(data.activeSession.model)}</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>· {fmt(data.activeSession.totalTokens)} tokens · ${data.activeSession.estimatedCost.toFixed(4)} so far</span>
        </div>
      )}

      {/* Time range filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {([['today','Today'],['week','7 Days'],['month','30 Days'],['all','All Time'],['custom','Custom']] as const).map(([r, label]) => (
          <button key={r} onClick={() => setRange(r)}
            style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: range === r ? '1px solid rgba(15,118,110,0.4)' : '1px solid #e2e8f0', background: range === r ? 'rgba(15,118,110,0.08)' : 'white', color: range === r ? '#0f766e' : '#64748b' }}>
            {label}
          </button>
        ))}
        {range === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none' }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none' }} />
          </>
        )}
      </div>

      {/* Range summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Spend', value: `$${rangeTotal.toFixed(2)}` },
          { label: 'Sessions', value: filteredSessions.length.toString() },
          { label: 'Tokens', value: fmt(rangeTokens) },
          { label: 'Avg/Session', value: filteredSessions.length ? `$${(rangeTotal/filteredSessions.length).toFixed(3)}` : '—' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: '#0f172a' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: 3, alignSelf: 'flex-start', width: 'fit-content' }}>
        {(['overview','daily','sessions','models'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '6px 16px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: 'none', background: view === v ? 'white' : 'transparent', color: view === v ? '#0f172a' : '#64748b', boxShadow: view === v ? '0 1px 4px rgba(15,23,42,0.08)' : 'none', textTransform: 'capitalize' }}>
            {v}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {view === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Model breakdown */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 14 }}>By Model</div>
            {Object.entries(data.byModel).sort((a,b) => b[1].cost - a[1].cost).map(([model, d]) => {
              const pct = data.totalCost > 0 ? (d.cost / data.totalCost) * 100 : 0;
              return (
                <div key={model} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: modelColor(model) }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{modelShort(model)}</span>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{d.sessions} sessions</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>${d.cost.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 5, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: modelColor(model), borderRadius: 999 }} />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Token breakdown */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 14 }}>Token Breakdown</div>
            {[
              { label: 'Input',       value: data.totalInput,  color: '#0369a1', desc: 'Messages sent to AI' },
              { label: 'Output',      value: data.totalOutput, color: '#0f766e', desc: 'AI responses generated' },
              { label: 'Cache Read',  value: data.totalCache,  color: '#6d28d9', desc: 'Reused from cache (cheap)' },
            ].map(({ label, value, color, desc }) => {
              const total = data.totalInput + data.totalOutput + data.totalCache;
              const pct = total > 0 ? (value / total) * 100 : 0;
              return (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{label}</span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>{fmt(value)}</span>
                  </div>
                  <div style={{ height: 5, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999 }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{desc}</div>
                </div>
              );
            })}
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(109,40,217,0.04)', border: '1px solid rgba(109,40,217,0.12)', borderRadius: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6d28d9', marginBottom: 2 }}>Cache savings</div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                {fmt(data.totalCache)} cached tokens saved ~${((data.totalCache / 1e6) * (3.00 - 0.30)).toFixed(2)} vs uncached
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DAILY ── */}
      {view === 'daily' && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>Daily Breakdown</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{filteredDays.length} days</div>
          </div>
          {filteredDays.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>No data for this range</div>}
          {filteredDays.map(([date, d]) => {
            const isToday = date === today;
            const pct = Math.min((d.cost / budget) * 100, 100);
            return (
              <div key={date} style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc', background: isToday ? 'rgba(15,118,110,0.02)' : 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ minWidth: 90 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      {isToday ? 'Today' : fmtDate(date + 'T12:00:00')}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{d.sessions} sessions · {fmt(d.tokens)} tokens</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: d.cost > budget ? '#ef4444' : d.cost > budget * 0.7 ? '#f59e0b' : '#14b8a6', borderRadius: 999 }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 70 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.03em', color: d.cost > budget ? '#b91c1c' : '#0f172a' }}>
                      ${d.cost.toFixed(2)}
                    </div>
                    {d.cost > budget && <div style={{ fontSize: 9, color: '#ef4444', fontWeight: 700 }}>OVER BUDGET</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SESSIONS ── */}
      {view === 'sessions' && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>Session Log</div>
          </div>
          {filteredSessions.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>No sessions in this range</div>}
          {filteredSessions.map(s => (
            <div key={s.key} style={{ padding: '12px 20px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.status === 'ended' ? '#cbd5e1' : '#14b8a6', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: modelColor(s.model), background: `${modelColor(s.model)}12`, padding: '1px 7px', borderRadius: 999 }}>
                    {modelShort(s.model)}
                  </span>
                  {s.isSubagent && <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', padding: '1px 6px', borderRadius: 999 }}>subagent</span>}
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{fmtTime(s.startedAt)}</span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {fmt(s.inputTokens)} in · {fmt(s.outputTokens)} out
                  {s.cacheRead > 0 && ` · ${fmt(s.cacheRead)} cached`}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', flexShrink: 0 }}>
                ${s.estimatedCost.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MODELS ── */}
      {view === 'models' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(data.byModel).sort((a,b) => b[1].cost - a[1].cost).map(([model, d]) => (
            <div key={model} style={{ background: 'white', borderRadius: 16, border: `1px solid ${modelColor(model)}22`, padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: modelColor(model) }} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{model}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{d.sessions} sessions</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: '#0f172a' }}>${d.cost.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{((d.cost / data.totalCost) * 100).toFixed(0)}% of total</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Input', value: fmt(d.input) },
                  { label: 'Output', value: fmt(d.output) },
                  { label: 'Avg/session', value: `$${(d.cost / d.sessions).toFixed(3)}` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
