'use client';
import { useEffect, useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────
type DayData = { cost: number; anthropic?: number; openai?: number; tokens?: number; sessions?: number };
type ModelData = { cost: number; input: number; output: number; sessions: number };
type Invoice = { date: string; type: string; amount: number; status: string; notes?: string };
type OpenAIDay = { date: string; costUsd: number; org?: string };
type Sub = { id: string; provider: string; plan: string; monthlyCost: number; startDate: string; active: boolean };

type CostData = {
  allInTotal?: number; totalCost?: number; totalApiCost?: number; totalSubscriptions?: number;
  todayCost?: number; weekCost?: number; monthlyBurn?: number;
  byProvider?: {
    anthropic?: { apiCostToDate?: number; invoicesPaid?: number; creditsReceived?: number; todayCost?: number; subscription?: number; total?: number };
    openai?: { apiCostToDate?: number; todayCost?: number; subscription?: number; total?: number };
    vercel?: { totalToDate?: number; subscription?: number };
    subscriptions?: { monthly?: number; totalToDate?: number; items?: Sub[] };
  };
  byDay?: Record<string, DayData>;
  byModel?: Record<string, ModelData>;
  sessions?: { id: string; date: string; cost?: number; estimatedCost?: number; totalTokens?: number; sessions?: number }[];
  anthropicInvoices?: Invoice[];
  openaiDaily?: OpenAIDay[];
  subscriptions?: Sub[];
  totalInput?: number; totalOutput?: number; totalCache?: number; totalTokens?: number; totalSessions?: number;
  dailyBudget?: number; overBudget?: boolean; budgetPct?: number;
  dataRange?: { earliest: string; latest: string };
  lastSync?: string;
  error?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : String(n);
const fmtUsd = (n: number | undefined, d=2) => `$${(n||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})}`;
const today = new Date().toISOString().slice(0,10);
const weekAgo = new Date(Date.now()-7*86400000).toISOString().slice(0,10);
const monthAgo = new Date(Date.now()-30*86400000).toISOString().slice(0,10);

function AddInvoiceForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('invoice');
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!amount.trim()) return;
    setSaving(true);
    await fetch('/api/cost/invoice', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date, amount: parseFloat(amount), type }) })
      .catch(e => console.error('[AddInvoice]', e));
    setOpen(false); setAmount(''); setSaving(false);
    onAdded();
  }
  if (!open) return <button onClick={() => setOpen(true)} style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #0f766e', background:'transparent', color:'#0f766e', fontSize:12, fontWeight:700, cursor:'pointer' }}>+ Add Invoice</button>;
  return (
    <div style={{ background:'#f8fafc', borderRadius:12, border:'1px solid #e2e8f0', padding:14, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        <div><label style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#64748b', display:'block', marginBottom:3 }}>Date</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ width:'100%', padding:'7px 9px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:12, outline:'none', boxSizing:'border-box' as const }} /></div>
        <div><label style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#64748b', display:'block', marginBottom:3 }}>Amount ($)</label>
          <input type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="257.83" style={{ width:'100%', padding:'7px 9px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:12, outline:'none', boxSizing:'border-box' as const }} /></div>
        <div><label style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#64748b', display:'block', marginBottom:3 }}>Type</label>
          <select value={type} onChange={e=>setType(e.target.value)} style={{ width:'100%', padding:'7px 9px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:12, outline:'none', boxSizing:'border-box' as const, cursor:'pointer' }}>
            <option value="invoice">Invoice</option>
            <option value="credit_grant">Credit Grant</option>
          </select></div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={() => setOpen(false)} style={{ flex:1, padding:'8px', borderRadius:8, border:'1px solid #e2e8f0', background:'white', color:'#64748b', fontSize:12, fontWeight:700, cursor:'pointer' }}>Cancel</button>
        <button onClick={submit} disabled={!amount||saving} style={{ flex:2, padding:'8px', borderRadius:8, border:'none', background:'#0f766e', color:'white', fontSize:12, fontWeight:800, cursor:'pointer', opacity:saving?0.7:1 }}>{saving?'Saving…':'Save Invoice'}</button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function CostPanel() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview'|'anthropic'|'openai'|'subscriptions'>('overview');
  const [range, setRange] = useState<'today'|'week'|'month'|'all'>('all');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cost');
      const d = await res.json();
      setData(d);
    } catch(e) { console.error('[CostPanel]', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const inRange = (date: string) => {
    if (!date) return false;
    if (range==='today') return date===today;
    if (range==='week') return date>=weekAgo;
    if (range==='month') return date>=monthAgo;
    return true;
  };

  const allIn = data?.allInTotal || data?.totalCost || 0;
  const ant = data?.byProvider?.anthropic;
  const oai = data?.byProvider?.openai;
  const verc = data?.byProvider?.vercel;
  const subs = data?.byProvider?.subscriptions;
  const todayCost = data?.todayCost || 0;
  const budget = data?.dailyBudget || 50;
  const budgetPct = Math.min((todayCost / budget) * 100, 100);
  const overBudget = todayCost > budget;

  const filteredDays = Object.entries(data?.byDay || {})
    .filter(([d]) => inRange(d))
    .sort((a,b) => a[0].localeCompare(b[0]));

  if (loading) return (
    <div style={{ padding:48, textAlign:'center' }}>
      <div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid rgba(15,118,110,0.12)', borderTopColor:'#14b8a6', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize:13, color:'#94a3b8' }}>Loading cost data…</div>
    </div>
  );

  return (
    <div style={{ maxWidth:900, margin:'0 auto' }}>
      {/* ── Dark header ─────────────────────────────────── */}
      <div style={{ background:'linear-gradient(135deg,#071722,#0c2330)', borderRadius:'0 0 20px 20px', padding:'24px 28px', marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', color:'rgba(148,163,184,0.5)', marginBottom:4 }}>AI Command</div>
        <div style={{ fontSize:26, fontWeight:900, color:'#f8fafc', letterSpacing:'-0.03em', marginBottom:2 }}>Cost & Usage</div>

        {/* ALL-IN HERO */}
        <div style={{ fontSize:42, fontWeight:900, color:'#f8fafc', letterSpacing:'-0.04em', margin:'12px 0 4px' }}>{fmtUsd(allIn)}</div>
        <div style={{ fontSize:13, color:'rgba(148,163,184,0.7)', marginBottom:4 }}>
          Anthropic {fmtUsd(ant?.invoicesPaid)} · OpenAI {fmtUsd(oai?.apiCostToDate)} · Subscriptions {fmtUsd(subs?.totalToDate)} · Vercel {fmtUsd(verc?.totalToDate)}
        </div>
        <div style={{ fontSize:12, color:'rgba(148,163,184,0.5)' }}>Monthly burn: {fmtUsd(data?.monthlyBurn)}/mo fixed + variable API</div>

        {/* Today's ticker */}
        <div style={{ marginTop:16, background:'rgba(255,255,255,0.06)', borderRadius:14, padding:'14px 18px' }}>
          {overBudget && <div style={{ padding:'8px 12px', background:'rgba(239,68,68,0.2)', borderRadius:8, border:'1px solid rgba(239,68,68,0.4)', fontSize:12, fontWeight:700, color:'#fca5a5', marginBottom:10 }}>⚠️ OVER DAILY BUDGET</div>}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:'rgba(148,163,184,0.8)' }}>📍 Today's API Spend</span>
            <span style={{ fontSize:18, fontWeight:900, color: overBudget?'#fca5a5':'#f8fafc' }}>{fmtUsd(todayCost,4)}</span>
          </div>
          <div style={{ height:6, background:'rgba(255,255,255,0.08)', borderRadius:999, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${budgetPct}%`, background: overBudget?'#ef4444':'#14b8a6', borderRadius:999, transition:'width 0.5s' }}/>
          </div>
          <div style={{ fontSize:10, color:'rgba(148,163,184,0.4)', marginTop:4 }}>{budgetPct.toFixed(0)}% of {fmtUsd(budget)} daily budget · Last sync: {data?.lastSync ? new Date(data.lastSync).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—'}</div>
        </div>
      </div>

      {/* ── Range + Tabs ─────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, padding:'0 4px' }}>
        <div style={{ display:'flex', gap:4, background:'#f1f5f9', borderRadius:10, padding:3 }}>
          {(['today','week','month','all'] as const).map(r=>(
            <button key={r} onClick={()=>setRange(r)} style={{ padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:700, border:'none', cursor:'pointer', background:range===r?'#0f766e':'transparent', color:range===r?'white':'#64748b' }}>
              {r==='today'?'Today':r==='week'?'7 Days':r==='month'?'30 Days':'All Time'}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:4, background:'#f1f5f9', borderRadius:10, padding:3 }}>
          {(['overview','anthropic','openai','subscriptions'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:700, border:'none', cursor:'pointer', background:tab===t?'#0f766e':'transparent', color:tab===t?'white':'#64748b', textTransform:'capitalize' }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────── */}
      {tab==='overview' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Provider bars */}
          <div style={{ background:'white', borderRadius:16, border:'1px solid #e2e8f0', padding:20 }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'#94a3b8', marginBottom:14 }}>Provider Breakdown</div>
            {[
              { label:'Anthropic Invoices', value:ant?.invoicesPaid||0, color:'#4f46e5', total: allIn },
              { label:'OpenAI API',         value:oai?.apiCostToDate||0, color:'#059669', total: allIn },
              { label:'Subscriptions',      value:subs?.totalToDate||0, color:'#d97706', total: allIn },
              { label:'Vercel',             value:verc?.totalToDate||0, color:'#64748b', total: allIn },
            ].map(({label,value,color,total})=>{
              const pct = total>0 ? (value/total)*100 : 0;
              return (
                <div key={label} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{label}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:'#334155' }}>{fmtUsd(value)} <span style={{ fontSize:10, color:'#94a3b8' }}>({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ height:6, background:'#f1f5f9', borderRadius:999, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:999 }}/>
                  </div>
                </div>
              );
            })}
            {ant?.creditsReceived && <div style={{ marginTop:8, padding:'8px 12px', background:'rgba(5,150,105,0.06)', border:'1px solid rgba(5,150,105,0.2)', borderRadius:10, fontSize:12, color:'#059669', fontWeight:600 }}>
              🎁 Anthropic free credits received: {fmtUsd(ant.creditsReceived)} (not counted in total)
            </div>}
          </div>

          {/* Daily chart */}
          <div style={{ background:'white', borderRadius:16, border:'1px solid #e2e8f0', padding:20 }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'#94a3b8', marginBottom:14 }}>Daily API Costs</div>
            {filteredDays.length === 0 ? <div style={{ color:'#94a3b8', fontSize:13 }}>No data for this range.</div> : (() => {
              const maxCost = Math.max(...filteredDays.map(([,d])=>d.cost||0), 1);
              return (
                <div style={{ display:'flex', gap:4, alignItems:'flex-end', height:120, overflowX:'auto' }}>
                  {filteredDays.map(([date, d]) => {
                    const h = Math.max(4, ((d.cost||0)/maxCost)*100);
                    const antH = Math.max(0, ((d.anthropic||d.cost||0)/maxCost)*100);
                    const oaiH = Math.max(0, ((d.openai||0)/maxCost)*100);
                    return (
                      <div key={date} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:28, flex:'0 0 28px' }} title={`${date}: ${fmtUsd(d.cost||0)}`}>
                        <div style={{ width:'100%', height:100, display:'flex', flexDirection:'column', justifyContent:'flex-end', gap:0 }}>
                          {oaiH > 0 && <div style={{ height:`${oaiH}%`, background:'#059669', borderRadius:'3px 3px 0 0', minHeight:2 }}/>}
                          {antH > 0 && <div style={{ height:`${antH}%`, background:'#4f46e5', borderRadius: oaiH>0?0:'3px 3px 0 0', minHeight:2 }}/>}
                        </div>
                        <div style={{ fontSize:8, color:'#94a3b8', transform:'rotate(-45deg)', marginTop:4, whiteSpace:'nowrap' }}>{date.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div style={{ display:'flex', gap:12, marginTop:8 }}>
              <span style={{ fontSize:10, color:'#94a3b8', display:'flex', alignItems:'center', gap:4 }}><span style={{ width:10, height:10, borderRadius:2, background:'#4f46e5', display:'inline-block' }}/> Anthropic</span>
              <span style={{ fontSize:10, color:'#94a3b8', display:'flex', alignItems:'center', gap:4 }}><span style={{ width:10, height:10, borderRadius:2, background:'#059669', display:'inline-block' }}/> OpenAI</span>
            </div>
          </div>
        </div>
      )}

      {/* ── ANTHROPIC TAB ─────────────────────────────────── */}
      {tab==='anthropic' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:'white', borderRadius:16, border:'1px solid #e2e8f0', padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'#94a3b8' }}>Invoices & Credits</div>
              <AddInvoiceForm onAdded={load} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div style={{ padding:'10px 14px', background:'#fef2f2', borderRadius:10, border:'1px solid rgba(185,28,28,0.15)' }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#b91c1c', marginBottom:2 }}>Invoices Paid</div>
                <div style={{ fontSize:22, fontWeight:900, color:'#0f172a' }}>{fmtUsd(ant?.invoicesPaid)}</div>
              </div>
              <div style={{ padding:'10px 14px', background:'#f0fdf4', borderRadius:10, border:'1px solid rgba(5,150,105,0.2)' }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#059669', marginBottom:2 }}>Credits Received</div>
                <div style={{ fontSize:22, fontWeight:900, color:'#0f172a' }}>{fmtUsd(ant?.creditsReceived)}</div>
              </div>
            </div>
            {(data?.anthropicInvoices||[]).length > 0 ? (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{ borderBottom:'1px solid #f1f5f9' }}>
                  {['Date','Type','Amount','Status'].map(h=><th key={h} style={{ padding:'6px 8px', textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#94a3b8' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[...(data?.anthropicInvoices||[])].sort((a,b)=>b.date.localeCompare(a.date)).map((inv,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid #f8fafc' }}>
                      <td style={{ padding:'7px 8px', color:'#334155' }}>{inv.date}</td>
                      <td style={{ padding:'7px 8px' }}><span style={{ fontSize:10, padding:'2px 8px', borderRadius:999, background:inv.type==='invoice'?'#fef2f2':'#f0fdf4', color:inv.type==='invoice'?'#b91c1c':'#059669', fontWeight:700 }}>{inv.type==='invoice'?'Invoice':'Credit'}</span></td>
                      <td style={{ padding:'7px 8px', fontWeight:700, color:'#0f172a' }}>{fmtUsd(inv.amount)}</td>
                      <td style={{ padding:'7px 8px' }}><span style={{ fontSize:10, padding:'2px 7px', borderRadius:999, background:'#f0fdf4', color:'#059669', fontWeight:700 }}>{inv.status||'paid'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div style={{ color:'#94a3b8', fontSize:13 }}>No invoices yet.</div>}
          </div>

          <div style={{ background:'white', borderRadius:16, border:'1px solid #e2e8f0', padding:20 }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'#94a3b8', marginBottom:14 }}>Daily API Costs (Live from Admin API)</div>
            {filteredDays.filter(([,d])=>(d.anthropic||d.cost||0)>0).slice(0,20).map(([date,d])=>(
              <div key={date} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid #f8fafc' }}>
                <span style={{ fontSize:13, color:'#334155' }}>{date}</span>
                <span style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{fmtUsd(d.anthropic||d.cost||0,4)}</span>
              </div>
            ))}
            {filteredDays.filter(([,d])=>(d.anthropic||d.cost||0)>0).length===0 && <div style={{ color:'#94a3b8', fontSize:13 }}>No API data for this range.</div>}
          </div>
        </div>
      )}

      {/* ── OPENAI TAB ─────────────────────────────────── */}
      {tab==='openai' && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #e2e8f0', padding:20 }}>
          <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'#94a3b8', marginBottom:14 }}>OpenAI Daily Costs</div>
          <div style={{ padding:'10px 14px', background:'#f0fdf4', borderRadius:10, border:'1px solid rgba(5,150,105,0.2)', marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#059669' }}>Total from CSV imports: {fmtUsd(oai?.apiCostToDate)}</div>
          </div>
          {[...(data?.openaiDaily||[])].filter(e=>inRange(e.date)).sort((a,b)=>b.date.localeCompare(a.date)).map((e,i)=>(
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #f8fafc', fontSize:13 }}>
              <span style={{ color:'#334155' }}>{e.date}</span>
              <span style={{ fontWeight:700, color:'#0f172a' }}>{fmtUsd(e.costUsd,2)}</span>
            </div>
          ))}
          {(data?.openaiDaily||[]).filter(e=>inRange(e.date)).length===0 && <div style={{ color:'#94a3b8', fontSize:13 }}>No OpenAI data for this range.</div>}
          <div style={{ marginTop:16, padding:'10px 14px', background:'#fffbeb', border:'1px solid rgba(217,119,6,0.2)', borderRadius:10, fontSize:12, color:'#92400e' }}>
            💡 Export updated CSVs from <strong>platform.openai.com</strong> for latest data. API billing endpoint requires a different org — working on it.
          </div>
        </div>
      )}

      {/* ── SUBSCRIPTIONS TAB ─────────────────────────────────── */}
      {tab==='subscriptions' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:'white', borderRadius:16, border:'1px solid #e2e8f0', padding:20 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              <div style={{ padding:'10px 14px', background:'#eff6ff', borderRadius:10, border:'1px solid rgba(37,99,235,0.2)' }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#2563eb', marginBottom:2 }}>Monthly Burn</div>
                <div style={{ fontSize:22, fontWeight:900, color:'#0f172a' }}>{fmtUsd(subs?.monthly)}/mo</div>
              </div>
              <div style={{ padding:'10px 14px', background:'#f5f3ff', borderRadius:10, border:'1px solid rgba(124,58,237,0.2)' }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#7c3aed', marginBottom:2 }}>Cumulative</div>
                <div style={{ fontSize:22, fontWeight:900, color:'#0f172a' }}>{fmtUsd(subs?.totalToDate)}</div>
              </div>
            </div>
            {(subs?.items||data?.subscriptions||[]).map((sub,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0', borderBottom:'1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{sub.provider} — {sub.plan}</div>
                  <div style={{ fontSize:11, color:'#94a3b8' }}>Since {sub.startDate}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:14, fontWeight:800, color:'#0f172a' }}>{fmtUsd(sub.monthlyCost)}/mo</div>
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:999, background:'#f0fdf4', color:'#059669', fontWeight:700 }}>Active</span>
                </div>
              </div>
            ))}
            {(subs?.items||data?.subscriptions||[]).length===0 && <div style={{ color:'#94a3b8', fontSize:13 }}>No subscriptions configured.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
