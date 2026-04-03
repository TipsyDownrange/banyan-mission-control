'use client';
import { useState, useEffect } from 'react';

type BidOpportunity = {
  email_id: string;
  inbox_owner: string;
  lead_type: 'rfp' | 'wo_inquiry' | 'addendum' | 'vendor';
  project_name: string;
  gc_name: string;
  owner_name: string;
  contact_name: string;
  contact_phone: string;
  location: string;
  island: string;
  bid_due_date: string;
  scope_summary: string;
  system_types_identified: string[];
  bid_source: string;
  plan_room_link: string;
  urgency: 'urgent' | 'normal' | 'low';
  confidence: 'high' | 'medium' | 'low';
  email_date: string;
  from_email: string;
  raw_subject: string;
  already_in_bid_log: boolean;
  rebid_keywords: string[];
};

const ISLAND_COLOR: Record<string, string> = {
  Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e',
};

const LEAD_TYPE_STYLE: Record<string, { color: string; bg: string; label: string; route: string }> = {
  rfp:        { color: '#1d4ed8', bg: 'rgba(239,246,255,0.9)', label: 'RFP',        route: 'Assign to Estimator' },
  wo_inquiry: { color: '#0f766e', bg: 'rgba(240,253,250,0.9)', label: 'WO Inquiry', route: 'Send to Joey' },
  addendum:   { color: '#92400e', bg: 'rgba(255,251,235,0.9)', label: 'Addendum',   route: 'Link to Bid' },
  vendor:     { color: '#64748b', bg: 'rgba(248,250,252,0.9)', label: 'Vendor',     route: 'File' },
};

const CONF_STYLE: Record<string, { color: string; bg: string }> = {
  high:   { color: '#15803d', bg: 'rgba(240,253,244,0.9)' },
  medium: { color: '#92400e', bg: 'rgba(255,251,235,0.9)' },
  low:    { color: '#64748b', bg: 'rgba(248,250,252,0.9)' },
};

function daysUntil(d: string) {
  if (!d) return null;
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return diff;
}

function fmtDate(d: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

export default function BidIntakePanel() {
  const [scanning, setScanning] = useState(false);
  const [opportunities, setOpportunities] = useState<BidOpportunity[]>([]);
  const [scanned, setScanned] = useState<string[]>([]);
  const [totalEmails, setTotalEmails] = useState(0);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<Record<string, string>>({});
  const ESTIMATORS = ['Kyle Shimizu', 'Jenny Shimabukuro', 'Mark Olson'];
  const [editDraft, setEditDraft] = useState<Partial<BidOpportunity>>({});
  const [lastScan, setLastScan] = useState<string | null>(null);

  const visibleOpps = opportunities.filter(o => !dismissed.has(o.email_id));

  async function scan() {
    setScanning(true);
    setError('');
    try {
      const res = await fetch('/api/inbox/bids');
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else {
        setOpportunities(data.opportunities || []);
        setScanned(data.scanned || []);
        setTotalEmails(data.total_emails || 0);
        setLastScan(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }));
      }
    } catch (e) { setError(String(e)); }
    setScanning(false);
  }

  async function addToBidQueue(opp: BidOpportunity) {
    const o = editingId === opp.email_id ? { ...opp, ...editDraft } : opp;
    setAdding(opp.email_id);
    try {
      const res = await fetch('/api/bids/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: o.project_name,
          gc_name: o.gc_name,
          location: o.location,
          island: o.island,
          bid_due_date: o.bid_due_date,
          scope_summary: o.scope_summary,
          plan_room_link: o.plan_room_link,
          bid_source: o.bid_source,
          email_id: o.email_id,
        }),
      });
      const data = await res.json();
      if (data.duplicate) {
        alert('This project is already in the Bid Log.');
      } else if (data.ok) {
        setAdded(prev => new Set([...prev, opp.email_id]));
        setEditingId(null);
      } else {
        alert('Failed to add: ' + (data.error || 'Unknown error'));
      }
    } catch (e) { alert('Error: ' + e); }
    setAdding(null);
  }

  const urgentCount = visibleOpps.filter(o => {
    const d = daysUntil(o.bid_due_date);
    return d !== null && d <= 7;
  }).length;

  return (
    <div style={{ padding: '32px', maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Estimating</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Bid Intake</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              Kai scans {scanned.length > 0 ? scanned.join(', ') : 'estimator inboxes'} for bid opportunities
              {lastScan && ` · Last scan: ${lastScan}`}
            </p>
          </div>
          <button
            onClick={scan}
            disabled={scanning}
            style={{ padding: '10px 20px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: scanning ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: scanning ? '#94a3b8' : 'white', border: 'none', cursor: scanning ? 'default' : 'pointer', boxShadow: scanning ? 'none' : '0 4px 16px rgba(15,118,110,0.3)' }}>
            {scanning ? '⟳ Scanning...' : '⟳ Scan Inboxes'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {(totalEmails > 0 || opportunities.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20, padding: 14, borderRadius: 16, background: 'linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.92))', border: '1px solid rgba(148,163,184,0.18)' }}>
          {[
            { label: 'Emails Scanned', value: totalEmails },
            { label: 'RFPs Found', value: opportunities.filter(o=>o.lead_type==='rfp').length },
            { label: 'WO Inquiries', value: opportunities.filter(o=>o.lead_type==='wo_inquiry').length },
            { label: 'Urgent', value: urgentCount },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: s.label === 'Urgent (≤7 days)' && s.value > 0 ? '#b91c1c' : '#0f172a', letterSpacing: '-0.04em' }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!scanning && visibleOpps.length === 0 && !error && (
        <div style={{ padding: 48, textAlign: 'center', borderRadius: 20, background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            {opportunities.length === 0 ? 'Scan inboxes to find bid opportunities' : 'All opportunities processed'}
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            Kai will read Kyle, Jenny, and Sean's inboxes and identify bid invitations, RFPs, and plan room notifications.
          </div>
        </div>
      )}

      {/* Opportunity cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visibleOpps.map(opp => {
          const days = daysUntil(opp.bid_due_date);
          const urgent = days !== null && days <= 7;
          const conf = CONF_STYLE[opp.confidence] || CONF_STYLE.medium;
          const isAdded = added.has(opp.email_id);
          const isEditing = editingId === opp.email_id;
          const draft = isEditing ? { ...opp, ...editDraft } : opp;

          return (
            <div key={opp.email_id} style={{ background: 'white', borderRadius: 20, border: `1px solid ${urgent ? 'rgba(185,28,28,0.25)' : '#e2e8f0'}`, boxShadow: '0 2px 12px rgba(15,23,42,0.04)', overflow: 'hidden' }}>

              {/* Card header */}
              <div style={{ padding: '14px 18px', background: urgent ? 'rgba(254,242,242,0.5)' : 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <input value={editDraft.project_name ?? opp.project_name}
                        onChange={e => setEditDraft(p => ({ ...p, project_name: e.target.value }))}
                        style={{ width: '100%', fontSize: 15, fontWeight: 800, color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
                    ) : (
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 2 }}>{opp.project_name}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                      {/* Lead type — most prominent */}
                      {(() => { const lt = LEAD_TYPE_STYLE[opp.lead_type] || LEAD_TYPE_STYLE.rfp; return (
                        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999, color: lt.color, background: lt.bg, border: `1.5px solid ${lt.color}44` }}>
                          {lt.label}
                        </span>
                      ); })()}
                      {opp.island && opp.island !== 'Unknown' && (
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, color: ISLAND_COLOR[opp.island] || '#64748b', background: 'rgba(255,255,255,0.9)', border: '1px solid currentColor' }}>
                          {opp.island}
                        </span>
                      )}
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: conf.color, background: conf.bg }}>
                        {opp.confidence.toUpperCase()}
                      </span>
                      {opp.bid_source !== 'email' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', background: 'rgba(239,246,255,0.9)', padding: '2px 8px', borderRadius: 999 }}>
                          {opp.bid_source}
                        </span>
                      )}
                      {urgent && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#b91c1c', background: '#fef2f2', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(185,28,28,0.2)' }}>
                          ⚠ Due in {days} day{days !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {!isAdded && (
                      <>
                        <button onClick={() => { if (isEditing) { setEditingId(null); setEditDraft({}); } else { setEditingId(opp.email_id); setEditDraft({}); } }}
                          style={{ padding: '6px 10px', borderRadius: 10, fontSize: 11, fontWeight: 800, border: isEditing ? '1px solid rgba(15,118,110,0.4)' : '1px solid #e2e8f0', background: isEditing ? 'rgba(240,253,250,0.96)' : 'white', color: isEditing ? '#0f766e' : '#64748b', cursor: 'pointer' }}>
                          {isEditing ? '✓' : '✎'}
                        </button>
                        <button onClick={() => setDismissed(prev => new Set([...prev, opp.email_id]))}
                          style={{ padding: '6px 10px', borderRadius: 10, fontSize: 11, fontWeight: 800, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', cursor: 'pointer' }}>
                          ✕
                        </button>
                        {/* Assignment — RFP gets estimator dropdown, WO goes to Joey */}
                        {opp.lead_type === 'rfp' ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <select value={assignedTo[opp.email_id] || ''}
                              onChange={e => setAssignedTo(prev => ({ ...prev, [opp.email_id]: e.target.value }))}
                              style={{ padding: '6px 8px', borderRadius: 10, fontSize: 11, border: '1px solid #e2e8f0', background: 'white', color: '#334155', cursor: 'pointer', outline: 'none' }}>
                              <option value="">Assign to...</option>
                              {ESTIMATORS.map(e => <option key={e}>{e}</option>)}
                            </select>
                            <button onClick={() => { if (assignedTo[opp.email_id]) addToBidQueue({...opp, gc_name: opp.gc_name}); }}
                              disabled={!assignedTo[opp.email_id] || adding === opp.email_id}
                              style={{ padding: '6px 14px', borderRadius: 10, fontSize: 11, fontWeight: 800, background: assignedTo[opp.email_id] ? 'linear-gradient(135deg,#1d4ed8,#3b82f6)' : '#e2e8f0', color: assignedTo[opp.email_id] ? 'white' : '#94a3b8', border: 'none', cursor: assignedTo[opp.email_id] ? 'pointer' : 'default', whiteSpace: 'nowrap' as const }}>
                              {adding === opp.email_id ? '...' : '→ Bid Queue'}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => addToBidQueue(opp)} disabled={adding === opp.email_id}
                            style={{ padding: '6px 14px', borderRadius: 10, fontSize: 11, fontWeight: 800, background: adding === opp.email_id ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: adding === opp.email_id ? '#94a3b8' : 'white', border: 'none', cursor: adding === opp.email_id ? 'default' : 'pointer', whiteSpace: 'nowrap' as const }}>
                            {adding === opp.email_id ? '...' : '→ Joey Queue'}
                          </button>
                        )}
                      </>
                    )}
                    {isAdded && (
                      <span style={{ padding: '6px 14px', borderRadius: 10, fontSize: 11, fontWeight: 800, background: 'rgba(240,253,244,0.9)', color: '#15803d', border: '1px solid rgba(34,197,94,0.2)' }}>
                        ✓ Added
                      </span>
                    )}
                  </div>
                </div>

                {/* Details grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8, marginTop: 10 }}>
                  {[
                    ['GC / Source', isEditing
                      ? <input value={editDraft.gc_name ?? opp.gc_name} onChange={e => setEditDraft(p => ({ ...p, gc_name: e.target.value }))} style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 6px', width: '100%', outline: 'none', boxSizing: 'border-box' as const }} />
                      : opp.gc_name || '—'],
                    ['Location', isEditing
                      ? <input value={editDraft.location ?? opp.location} onChange={e => setEditDraft(p => ({ ...p, location: e.target.value }))} style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 6px', width: '100%', outline: 'none', boxSizing: 'border-box' as const }} />
                      : opp.location || '—'],
                    ['Bid Due', isEditing
                      ? <input type="date" value={editDraft.bid_due_date ?? opp.bid_due_date} onChange={e => setEditDraft(p => ({ ...p, bid_due_date: e.target.value }))} style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 6px', outline: 'none' }} />
                      : (opp.bid_due_date ? fmtDate(opp.bid_due_date) : '—')],
                    ['Received', fmtDate(opp.email_date)],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 12, color: '#334155' }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Scope summary */}
                {(opp.scope_summary || isEditing) && (
                  <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>Scope (Kai extracted)</div>
                    {isEditing
                      ? <textarea value={editDraft.scope_summary ?? opp.scope_summary} onChange={e => setEditDraft(p => ({ ...p, scope_summary: e.target.value }))} rows={2} style={{ width: '100%', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 6px', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                      : <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>{opp.scope_summary}</div>
                    }
                  </div>
                )}

                {/* Plan room link */}
                {opp.plan_room_link && (
                  <div style={{ marginTop: 8 }}>
                    <a href={opp.plan_room_link} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: '#0369a1', textDecoration: 'none', fontWeight: 600 }}>
                      🔗 View bid documents →
                    </a>
                  </div>
                )}

                {/* Email source */}
                <div style={{ marginTop: 6, fontSize: 10, color: '#94a3b8' }}>
                  From: {opp.from_email} · {opp.inbox_owner} inbox · "{opp.raw_subject?.substring(0, 60)}"
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
