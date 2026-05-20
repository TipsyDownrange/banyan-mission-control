'use client';
import { useEffect, useState, useCallback } from 'react';
import EngagementCreationForm from '@/components/engagements/EngagementCreationForm';
import { EmptyState } from '@/components/design-system';

type Tab = 'overview' | 'rfi' | 'submittals' | 'co' | 'sov';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',   label: 'Overview' },
  { key: 'rfi',        label: 'RFIs' },
  { key: 'submittals', label: 'Submittals' },
  { key: 'co',         label: 'Change Orders' },
  { key: 'sov',        label: 'SOV' },
];

const ISLAND_COLOR: Record<string, string> = {
  Oahu: 'var(--bos-color-accent-data)', Maui: 'var(--bos-color-brand-primary-deep)', Kauai: '#6d28d9', Hawaii: 'var(--color-amber-800)',
};

type Project = { kID: string; name: string; island: string };
type RFI = Record<string, string>;
type Submittal = Record<string, string>;
type CO = Record<string, string>;
type SOVLine = Record<string, string>;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  APPROVED:     { bg: 'var(--color-teal-50)', color: 'var(--bos-color-brand-primary-deep)' },
  SUBMITTED:    { bg: 'var(--color-blue-50)', color: 'var(--bos-color-accent-data-bright)' },
  PENDING:      { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)' },
  DRAFT:        { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)' },
  IDENTIFIED:   { bg: 'var(--color-amber-50)', color: 'var(--color-amber-800)' },
  REJECTED:     { bg: 'var(--color-red-50)', color: 'var(--color-red-700)' },
  DISPUTED:     { bg: 'var(--color-red-50)', color: 'var(--color-red-700)' },
  IN_NEGOTIATION: { bg: 'var(--color-amber-50)', color: 'var(--color-amber-800)' },
  UNDER_REVIEW: { bg: 'var(--color-blue-50)', color: 'var(--bos-color-accent-data-bright)' },
  REVISE_RESUBMIT: { bg: 'var(--color-amber-50)', color: 'var(--color-amber-800)' },
  CLEAR_DIRECTIVE: { bg: 'var(--color-teal-50)', color: 'var(--bos-color-brand-primary-deep)' },
  AMBIGUOUS:    { bg: 'var(--color-amber-50)', color: 'var(--color-amber-800)' },
  PUNTED:       { bg: 'var(--color-red-50)', color: 'var(--color-red-700)' },
  CLOSED:       { bg: 'var(--color-teal-50)', color: 'var(--bos-color-brand-primary-deep)' },
  RESPONDED:    { bg: 'var(--color-teal-50)', color: 'var(--bos-color-brand-primary-deep)' },
};

const TAG = ({ status, label }: { status: string; label?: string }) => {
  const s = STATUS_COLORS[status] || { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.color}33` }}>
      {label || status.replace(/_/g, ' ')}
    </span>
  );
};

const BALL = ({ court }: { court: string }) => (
  <span style={{ fontSize: 10, fontWeight: 700, color: court === 'KULA_GLASS' ? 'var(--bos-color-brand-primary-deep)' : court === 'GC' ? 'var(--bos-color-accent-data-bright)' : 'var(--color-amber-800)' }}>
    ⚡ {court === 'KULA_GLASS' ? 'Our court' : court === 'GC' ? 'GC court' : court}
  </span>
);

function fmtDate(iso: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return iso; }
}

function fmtMoney(val: string) {
  const n = parseFloat(val || '0');
  if (isNaN(n)) return '$0';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function PMPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedKID, setSelectedKID] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [rfiSummary, setRfiSummary] = useState<Record<string,number>>({});
  const [submittals, setSubmittals] = useState<Submittal[]>([]);
  const [subSummary, setSubSummary] = useState<Record<string,number>>({});
  const [cos, setCos] = useState<CO[]>([]);
  const [coExposure, setCoExposure] = useState<Record<string,number>>({});
  const [sovLines, setSovLines] = useState<SOVLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewRFI, setShowNewRFI] = useState(false);
  const [showNewCO, setShowNewCO] = useState(false);
  const [showNewSub, setShowNewSub] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [toast, setToast] = useState('');
  // New RFI form
  const [newRFISubject, setNewRFISubject] = useState('');
  const [newRFISpec, setNewRFISpec] = useState('');
  const [newRFIDesc, setNewRFIDesc] = useState('');
  const [newRFIType, setNewRFIType] = useState('OUTBOUND');
  // New CO form
  const [newCOTitle, setNewCOTitle] = useState('');
  const [newCODesc, setNewCODesc] = useState('');
  const [newCOBasis, setNewCOBasis] = useState('OWNER_DIRECTED');
  const [newCOAmount, setNewCOAmount] = useState('');
  // New Submittal form
  const [newSubSpec, setNewSubSpec] = useState('');
  const [newSubDesc, setNewSubDesc] = useState('');

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(d => { setProjects(d.projects || []); setProjectsLoading(false); }).catch(() => setProjectsLoading(false));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  useEffect(() => {
    if (!selectedKID) return;
    setLoading(true);
    const fetches = [
      fetch(`/api/pm/rfi?kID=${selectedKID}`).then(r => r.json()).then(d => { setRfis(d.rfis || []); setRfiSummary(d.summary || {}); }),
      fetch(`/api/pm/submittals?kID=${selectedKID}`).then(r => r.json()).then(d => { setSubmittals(d.submittals || []); setSubSummary(d.summary || {}); }),
      fetch(`/api/pm/change-orders?kID=${selectedKID}`).then(r => r.json()).then(d => { setCos(d.cos || []); setCoExposure(d.exposure || {}); }),
      fetch(`/api/pm/sov?kID=${selectedKID}`).then(r => r.json()).then(d => setSovLines(d.sov || [])),
    ];
    Promise.all(fetches).catch(() => {}).finally(() => setLoading(false));
  }, [selectedKID]);

  const proj = projects.find(p => p.kID === selectedKID);

  async function submitRFI() {
    if (!newRFISubject || !selectedKID) return;
    setSaving(true);
    await fetch('/api/pm/rfi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kID: selectedKID, rfi_type: newRFIType, subject: newRFISubject, spec_section: newRFISpec, description: newRFIDesc }) });
    setShowNewRFI(false); setNewRFISubject(''); setNewRFISpec(''); setNewRFIDesc('');
    const d = await fetch(`/api/pm/rfi?kID=${selectedKID}`).then(r => r.json());
    setRfis(d.rfis || []); setRfiSummary(d.summary || {});
    setSaving(false);
    showToast('RFI created successfully');
  }

  async function submitCO() {
    if (!newCOTitle || !selectedKID) return;
    setSaving(true);
    await fetch('/api/pm/change-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kID: selectedKID, title: newCOTitle, description: newCODesc, basis: newCOBasis, amount_requested: newCOAmount }) });
    setShowNewCO(false); setNewCOTitle(''); setNewCODesc(''); setNewCOAmount('');
    const d = await fetch(`/api/pm/change-orders?kID=${selectedKID}`).then(r => r.json());
    setCos(d.cos || []); setCoExposure(d.exposure || {});
    setSaving(false);
    showToast('Change order created successfully');
  }

  async function submitSub() {
    if (!newSubSpec || !selectedKID) return;
    setSaving(true);
    await fetch('/api/pm/submittals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kID: selectedKID, spec_section: newSubSpec, description: newSubDesc }) });
    setShowNewSub(false); setNewSubSpec(''); setNewSubDesc('');
    const d = await fetch(`/api/pm/submittals?kID=${selectedKID}`).then(r => r.json());
    setSubmittals(d.submittals || []); setSubSummary(d.summary || {});
    setSaving(false);
    showToast('Submittal added successfully');
  }

  async function updateRFIStatus(rfi_id: string, status: string) {
    await fetch('/api/pm/rfi', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rfi_id, status, submitted_at: status === 'SUBMITTED' ? new Date().toISOString() : undefined, ball_in_court: status === 'SUBMITTED' ? 'GC' : undefined }) });
    const d = await fetch(`/api/pm/rfi?kID=${selectedKID}`).then(r => r.json());
    setRfis(d.rfis || []); setRfiSummary(d.summary || {});
  }

  async function updateSubStatus(sub_id: string, status: string) {
    const updates: Record<string,string> = { sub_id, status };
    const now = new Date().toISOString();
    if (status === 'SUBMITTED') updates.submitted_to_gc_date = now;
    if (status === 'APPROVED' || status === 'REVISE_RESUBMIT') updates.we_received_date = now;
    await fetch('/api/pm/submittals', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    const d = await fetch(`/api/pm/submittals?kID=${selectedKID}`).then(r => r.json());
    setSubmittals(d.submittals || []); setSubSummary(d.summary || {});
  }

  async function updateCOStatus(co_id: string, status: string) {
    await fetch('/api/pm/change-orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ co_id, status, submitted_at: status === 'SUBMITTED' ? new Date().toISOString() : undefined, approved_at: status === 'APPROVED' ? new Date().toISOString() : undefined }) });
    const d = await fetch(`/api/pm/change-orders?kID=${selectedKID}`).then(r => r.json());
    setCos(d.cos || []); setCoExposure(d.exposure || {});
  }

  const INP: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid var(--color-surface-border)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bos-color-ink-disabled)', display: 'block', marginBottom: 4 };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <EngagementCreationForm />
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--bos-color-ink-tertiary)', marginBottom: 6 }}>Project Management</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--color-ink-primary)', margin: 0 }}>PM Command</h1>
          {projectsLoading ? (
            <div style={{ padding: '8px 14px', borderRadius: 12, border: '1px solid var(--color-surface-border)', background: 'linear-gradient(90deg,#f1f5f9 25%,var(--color-surface-border) 50%,#f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', minWidth: 260, height: 38 }} />
          ) : (
            <select value={selectedKID} onChange={e => setSelectedKID(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 12, border: '1px solid var(--color-surface-border)', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'white', minWidth: 260, outline: 'none' }}>
              <option value="">Select a project...</option>
              {projects.map(p => <option key={p.kID} value={p.kID}>{p.name} ({p.island})</option>)}
            </select>
          )}
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          {proj && <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: `${ISLAND_COLOR[proj.island] || 'var(--bos-color-ink-disabled)'}18`, color: ISLAND_COLOR[proj.island] || 'var(--bos-color-ink-disabled)', border: `1px solid ${ISLAND_COLOR[proj.island] || 'var(--bos-color-ink-disabled)'}33` }}>{proj.island}</span>}
        </div>
      </div>

      {!selectedKID && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid var(--color-surface-border)' }}>
          <EmptyState
            icon={<span style={{ fontSize: 32 }}>📋</span>}
            heading="Select a project above to get started"
            body="View and manage RFIs, Submittals, Change Orders, and Schedule of Values — all in one place."
          />
        </div>
      )}

      {selectedKID && (
        <>
          {/* Tab nav */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 14, padding: 4 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, transition: 'all 0.15s', background: activeTab === t.key ? 'white' : 'transparent', color: activeTab === t.key ? 'var(--color-ink-primary)' : 'var(--bos-color-ink-disabled)', boxShadow: activeTab === t.key ? '0 1px 4px rgba(15,23,42,0.08)' : 'none' }}>
                {t.label}
              </button>
            ))}
          </div>

          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--bos-color-ink-tertiary)' }}>Loading...</div>}

          {/* OVERVIEW */}
          {!loading && activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {/* RFI summary */}
              <div style={{ background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)', padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bos-color-ink-tertiary)', marginBottom: 12 }}>RFIs</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--color-ink-primary)', marginBottom: 4 }}>{rfiSummary.total || 0}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(rfiSummary.overdue || 0) > 0 && <div style={{ fontSize: 12, color: 'var(--color-red-700)', fontWeight: 700 }}>⚠️ {rfiSummary.overdue} overdue response{(rfiSummary.overdue || 0) !== 1 ? 's' : ''}</div>}
                  {(rfiSummary.ballInCourtGC || 0) > 0 && <div style={{ fontSize: 12, color: 'var(--bos-color-accent-data-bright)' }}>⚡ {rfiSummary.ballInCourtGC} in GC court</div>}
                  {(rfiSummary.ballInCourtUs || 0) > 0 && <div style={{ fontSize: 12, color: 'var(--bos-color-brand-primary-deep)' }}>⚡ {rfiSummary.ballInCourtUs} in our court</div>}
                </div>
                <button onClick={() => setActiveTab('rfi')} style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: 'var(--bos-color-brand-primary-deep)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all RFIs →</button>
              </div>
              {/* Submittals summary */}
              <div style={{ background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)', padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bos-color-ink-tertiary)', marginBottom: 12 }}>Submittals</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--color-ink-primary)', marginBottom: 4 }}>{subSummary.total || 0}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, color: 'var(--bos-color-brand-primary-deep)', fontWeight: 700 }}>✓ {subSummary.approved || 0} approved</div>
                  {(subSummary.pending || 0) > 0 && <div style={{ fontSize: 12, color: 'var(--bos-color-accent-data-bright)' }}>⏳ {subSummary.pending} pending</div>}
                  {(subSummary.overdue || 0) > 0 && <div style={{ fontSize: 12, color: 'var(--color-red-700)', fontWeight: 700 }}>⚠️ {subSummary.overdue} overdue</div>}
                </div>
                <button onClick={() => setActiveTab('submittals')} style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: 'var(--bos-color-brand-primary-deep)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all →</button>
              </div>
              {/* CO summary */}
              <div style={{ background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)', padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bos-color-ink-tertiary)', marginBottom: 12 }}>Change Orders</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--color-ink-primary)', marginBottom: 4 }}>{cos.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, color: 'var(--bos-color-brand-primary-deep)', fontWeight: 700 }}>✓ {fmtMoney(String(coExposure.approved || 0))} approved</div>
                  {(coExposure.pending || 0) > 0 && <div style={{ fontSize: 12, color: 'var(--color-amber-800)' }}>⏳ {fmtMoney(String(coExposure.pending))} pending</div>}
                  {(coExposure.identified || 0) > 0 && <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)' }}>💡 {fmtMoney(String(coExposure.identified))} identified</div>}
                </div>
                <button onClick={() => setActiveTab('co')} style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: 'var(--bos-color-brand-primary-deep)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all →</button>
              </div>
            </div>
          )}

          {/* RFI TAB */}
          {!loading && activeTab === 'rfi' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)' }}>RFI Log</div>
                  {(rfiSummary.overdue || 0) > 0 && <div style={{ fontSize: 12, color: 'var(--color-red-700)', fontWeight: 700, marginTop: 2 }}>⚠️ {rfiSummary.overdue} overdue response{(rfiSummary.overdue||0)!==1?'s':''}</div>}
                </div>
                <button onClick={() => setShowNewRFI(true)} style={{ padding: '8px 16px', borderRadius: 999, background: 'linear-gradient(135deg,var(--bos-color-brand-primary-deep),var(--bos-color-brand-primary))', color: 'white', border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>+ New RFI</button>
              </div>
              {rfis.length === 0 && <div style={{ padding: '40px 24px', textAlign: 'center', background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)', color: 'var(--bos-color-ink-tertiary)' }}>No RFIs logged yet</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rfis.map(rfi => (
                  <div key={rfi.rfi_id} style={{ background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)', padding: '14px 18px', display: 'grid', gridTemplateColumns: '80px 1fr auto auto', gap: 12, alignItems: 'center', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bos-color-brand-primary-deep)' }}>{rfi.rfi_number}</div>
                      <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>{rfi.rfi_type === 'INBOUND' ? '← Inbound' : '→ Outbound'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink-primary)', marginBottom: 4 }}>{rfi.subject}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TAG status={rfi.status} />
                        {rfi.ball_in_court && <BALL court={rfi.ball_in_court} />}
                        {rfi.spec_section && <span style={{ fontSize: 10, color: 'var(--bos-color-ink-disabled)' }}>{rfi.spec_section}</span>}
                        {rfi.days_open && rfi.status !== 'CLOSED' && parseInt(rfi.days_open) > 0 && (
                          parseInt(rfi.days_open) > 10
                            ? <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'var(--color-red-50)', color: 'var(--color-red-700)', border: '1px solid rgba(239,68,68,0.2)' }}>⚠️ {rfi.days_open}d open</span>
                            : <span style={{ fontSize: 10, color: 'var(--bos-color-ink-disabled)' }}>{rfi.days_open}d open</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', textAlign: 'right' }}>
                      {rfi.submitted_at ? fmtDate(rfi.submitted_at) : fmtDate(rfi.created_at)}
                    </div>
                    <div>
                      {rfi.status === 'DRAFT' && <button onClick={() => updateRFIStatus(rfi.rfi_id, 'SUBMITTED')} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--color-blue-50)', border: '1px solid rgba(29,78,216,0.2)', color: 'var(--bos-color-accent-data-bright)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Submit →</button>}
                      {rfi.status === 'SUBMITTED' && <button onClick={() => updateRFIStatus(rfi.rfi_id, 'RESPONDED')} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--color-teal-50)', border: '1px solid rgba(15,118,110,0.2)', color: 'var(--bos-color-brand-primary-deep)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Got Response</button>}
                      {rfi.status === 'RESPONDED' && <button onClick={() => updateRFIStatus(rfi.rfi_id, 'CLOSED')} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', color: 'var(--bos-color-ink-disabled)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Close</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUBMITTALS TAB */}
          {!loading && activeTab === 'submittals' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)' }}>Submittal Log</div>
                <button onClick={() => setShowNewSub(true)} style={{ padding: '8px 16px', borderRadius: 999, background: 'linear-gradient(135deg,var(--bos-color-accent-data),#0ea5e9)', color: 'white', border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>+ Add Submittal</button>
              </div>
              {submittals.length === 0 && <div style={{ padding: '40px 24px', textAlign: 'center', background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)', color: 'var(--bos-color-ink-tertiary)' }}>No submittals logged yet</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {submittals.map(sub => (
                  <div key={sub.sub_id} style={{ background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)', padding: '14px 18px', display: 'grid', gridTemplateColumns: '60px 1fr auto auto', gap: 12, alignItems: 'center', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bos-color-accent-data)' }}>#{sub.sub_number}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink-primary)', marginBottom: 4 }}>{sub.description || sub.spec_section}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TAG status={sub.status} />
                        {sub.ball_in_court && <BALL court={sub.ball_in_court} />}
                        <span style={{ fontSize: 10, color: 'var(--bos-color-ink-disabled)' }}>{sub.spec_section}</span>
                        {sub.submitted_to_gc_date && <span style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)' }}>Submitted {fmtDate(sub.submitted_to_gc_date)}</span>}
                        {sub.we_received_date && <span style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)' }}>Received {fmtDate(sub.we_received_date)}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>Rev {sub.revision_number || '1'}</div>
                    <div>
                      {sub.status === 'PENDING' && <button onClick={() => updateSubStatus(sub.sub_id, 'SUBMITTED')} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--color-blue-50)', border: '1px solid rgba(29,78,216,0.2)', color: 'var(--bos-color-accent-data-bright)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Submit →</button>}
                      {sub.status === 'SUBMITTED' && <button onClick={() => updateSubStatus(sub.sub_id, 'UNDER_REVIEW')} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', color: 'var(--bos-color-ink-disabled)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Under Review</button>}
                      {sub.status === 'UNDER_REVIEW' && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => updateSubStatus(sub.sub_id, 'APPROVED')} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--color-teal-50)', border: '1px solid rgba(15,118,110,0.2)', color: 'var(--bos-color-brand-primary-deep)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Approved</button>
                          <button onClick={() => updateSubStatus(sub.sub_id, 'REVISE_RESUBMIT')} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--color-amber-50)', border: '1px solid rgba(146,64,14,0.2)', color: 'var(--color-amber-800)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>R&R</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CHANGE ORDERS TAB */}
          {!loading && activeTab === 'co' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)' }}>Change Orders</div>
                <button onClick={() => setShowNewCO(true)} style={{ padding: '8px 16px', borderRadius: 999, background: 'linear-gradient(135deg,var(--color-amber-800),var(--color-amber-500))', color: 'white', border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>+ New CO</button>
              </div>
              {/* Total exposure banner */}
              {((coExposure.approved || 0) > 0 || (coExposure.pending || 0) > 0) && (
                <div style={{
                  display: 'flex', gap: 16, alignItems: 'center', padding: '14px 20px', borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(15,118,110,0.06), rgba(3,105,161,0.06))',
                  border: '1px solid rgba(15,118,110,0.15)', marginBottom: 12,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bos-color-ink-disabled)' }}>Total Exposure</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--bos-color-brand-primary-deep)' }}>{fmtMoney(String((coExposure.approved || 0) + (coExposure.pending || 0) + (coExposure.identified || 0)))}</div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                    <span style={{ fontSize: 12, color: 'var(--bos-color-brand-primary-deep)', fontWeight: 700 }}>✓ {fmtMoney(String(coExposure.approved || 0))} approved</span>
                    <span style={{ fontSize: 12, color: 'var(--bos-color-accent-data-bright)', fontWeight: 700 }}>⏳ {fmtMoney(String(coExposure.pending || 0))} pending</span>
                  </div>
                </div>
              )}

              {/* Exposure breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 16 }}>
                {[['Approved', coExposure.approved||0, 'var(--bos-color-brand-primary-deep)'],['Pending', coExposure.pending||0,'var(--bos-color-accent-data-bright)'],['Drafted', coExposure.drafted||0,'var(--bos-color-ink-disabled)'],['Identified', coExposure.identified||0,'var(--color-amber-800)'],['Rejected (reserve)', coExposure.rejected||0,'var(--bos-color-ink-tertiary)']].map(([label, val, color]) => (
                  <div key={String(label)} style={{ background:'white',borderRadius:12,border:'1px solid var(--color-surface-border)',padding:'12px 14px' }}>
                    <div style={{ fontSize:10,fontWeight:800,color:'var(--bos-color-ink-tertiary)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:16,fontWeight:900,color:String(color) }}>{fmtMoney(String(val))}</div>
                  </div>
                ))}
              </div>
              {cos.length === 0 && <div style={{ padding: '40px 24px', textAlign: 'center', background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)', color: 'var(--bos-color-ink-tertiary)' }}>No change orders yet</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cos.map(co => (
                  <div key={co.co_id} style={{ background:'white',borderRadius:16,border:'1px solid var(--color-surface-border)',padding:'14px 18px',display:'grid',gridTemplateColumns:'80px 1fr auto auto',gap:12,alignItems:'center',boxShadow:'0 1px 3px rgba(15,23,42,0.04)' }}>
                    <div>
                      <div style={{ fontSize:11,fontWeight:800,color:'var(--color-amber-800)' }}>{co.co_number}</div>
                      <div style={{ fontSize:10,color:'var(--bos-color-ink-tertiary)',marginTop:2 }}>{co.basis?.replace(/_/g,' ') || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:14,fontWeight:700,color:'var(--color-ink-primary)',marginBottom:4 }}>{co.title}</div>
                      <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
                        <TAG status={co.status} />
                        {co.amount_requested && <span style={{ fontSize:11,fontWeight:700,color:'var(--color-ink-secondary)' }}>Req: {fmtMoney(co.amount_requested)}</span>}
                        {co.amount_approved && co.status === 'APPROVED' && <span style={{ fontSize:11,fontWeight:700,color:'var(--bos-color-brand-primary-deep)' }}>Approved: {fmtMoney(co.amount_approved)}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize:11,color:'var(--bos-color-ink-tertiary)' }}>{fmtDate(co.created_at)}</div>
                    <div>
                      {co.status === 'IDENTIFIED' && <button onClick={() => updateCOStatus(co.co_id, 'DRAFTED')} style={{ padding:'6px 12px',borderRadius:8,background:'var(--color-surface)',border:'1px solid var(--color-surface-border)',color:'var(--bos-color-ink-disabled)',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap' }}>Draft →</button>}
                      {co.status === 'DRAFTED' && <button onClick={() => updateCOStatus(co.co_id, 'SUBMITTED')} style={{ padding:'6px 12px',borderRadius:8,background:'var(--color-blue-50)',border:'1px solid rgba(29,78,216,0.2)',color:'var(--bos-color-accent-data-bright)',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap' }}>Submit →</button>}
                      {co.status === 'SUBMITTED' && <button onClick={() => updateCOStatus(co.co_id, 'APPROVED')} style={{ padding:'6px 12px',borderRadius:8,background:'var(--color-teal-50)',border:'1px solid rgba(15,118,110,0.2)',color:'var(--bos-color-brand-primary-deep)',fontSize:11,fontWeight:700,cursor:'pointer' }}>Approve</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SOV TAB */}
          {!loading && activeTab === 'sov' && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)', marginBottom: 16 }}>Schedule of Values</div>
              {sovLines.length === 0 ? (
                <div style={{ padding:'40px 24px',textAlign:'center',background:'white',borderRadius:16,border:'1px solid var(--color-surface-border)' }}>
                  <div style={{ fontSize:14,fontWeight:700,color:'var(--color-ink-primary)',marginBottom:8 }}>No SOV set up yet</div>
                  <div style={{ fontSize:13,color:'var(--bos-color-ink-tertiary)' }}>SOV is created automatically from the winning estimate during handoff, or can be entered manually.</div>
                </div>
              ) : (
                <div style={{ background:'white',borderRadius:16,border:'1px solid var(--color-surface-border)',overflow:'hidden' }}>
                  <table style={{ width:'100%',borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ background:'var(--color-surface)' }}>
                        {['#','Description','Contract Value','Prev Periods','This Period','% Complete','Balance'].map(h => (
                          <th key={h} style={{ padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:800,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--bos-color-ink-tertiary)',borderBottom:'1px solid #f1f5f9' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sovLines.map((line, i) => (
                        <tr key={line.sov_id} style={{ borderBottom:'1px solid var(--color-surface)' }}>
                          <td style={{ padding:'10px 14px',fontSize:12,color:'var(--bos-color-ink-disabled)',fontWeight:700 }}>{line.line_number}</td>
                          <td style={{ padding:'10px 14px',fontSize:13,fontWeight:700,color:'var(--color-ink-primary)' }}>{line.description}</td>
                          <td style={{ padding:'10px 14px',fontSize:13,color:'var(--color-ink-secondary)' }}>{fmtMoney(line.scheduled_value)}</td>
                          <td style={{ padding:'10px 14px',fontSize:13,color:'var(--color-ink-secondary)' }}>{fmtMoney(line.previous_periods)}</td>
                          <td style={{ padding:'10px 14px',fontSize:13,color:'var(--color-ink-secondary)' }}>{fmtMoney(line.this_period)}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                              <div style={{ flex:1,height:6,borderRadius:999,background:'#f1f5f9',overflow:'hidden' }}>
                                <div style={{ width:`${Math.min(100,parseFloat(line.total_pct||'0'))}%`,height:'100%',background:'var(--bos-color-brand-primary)',borderRadius:999 }} />
                              </div>
                              <span style={{ fontSize:11,fontWeight:700,color:'var(--color-ink-secondary)',whiteSpace:'nowrap' }}>{parseFloat(line.total_pct||'0').toFixed(0)}%</span>
                            </div>
                          </td>
                          <td style={{ padding:'10px 14px',fontSize:13,fontWeight:700,color: parseFloat(line.balance_to_finish||'0') > 0 ? 'var(--color-ink-primary)' : 'var(--bos-color-brand-primary)' }}>{fmtMoney(line.balance_to_finish)}</td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr style={{ background:'var(--color-surface)' }}>
                        <td colSpan={2} style={{ padding:'12px 14px',fontSize:12,fontWeight:800,color:'var(--color-ink-primary)' }}>TOTALS</td>
                        <td style={{ padding:'12px 14px',fontSize:13,fontWeight:800,color:'var(--color-ink-primary)' }}>{fmtMoney(String(sovLines.reduce((s,l) => s+parseFloat(l.scheduled_value||'0'),0)))}</td>
                        <td style={{ padding:'12px 14px',fontSize:13,fontWeight:800,color:'var(--color-ink-primary)' }}>{fmtMoney(String(sovLines.reduce((s,l) => s+parseFloat(l.previous_periods||'0'),0)))}</td>
                        <td style={{ padding:'12px 14px',fontSize:13,fontWeight:800,color:'var(--color-ink-primary)' }}>{fmtMoney(String(sovLines.reduce((s,l) => s+parseFloat(l.this_period||'0'),0)))}</td>
                        <td />
                        <td style={{ padding:'12px 14px',fontSize:13,fontWeight:800,color:'var(--color-ink-primary)' }}>{fmtMoney(String(sovLines.reduce((s,l) => s+parseFloat(l.balance_to_finish||'0'),0)))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* NEW RFI MODAL */}
      {showNewRFI && (
        <div style={{ position:'fixed',inset:0,background:'rgba(15,23,42,0.5)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
          <div style={{ background:'white',borderRadius:24,width:'100%',maxWidth:480,padding:28,boxShadow:'0 24px 64px rgba(15,23,42,0.15)' }}>
            <div style={{ fontSize:17,fontWeight:800,color:'var(--color-ink-primary)',marginBottom:18 }}>New RFI — {proj?.name}</div>
            <div style={{ display:'grid',gap:14 }}>
              <div>
                <label style={LBL}>Type</label>
                <select value={newRFIType} onChange={e => setNewRFIType(e.target.value)} style={INP}>
                  <option value="OUTBOUND">Outbound — We're asking</option>
                  <option value="INBOUND">Inbound — GC/Architect asked us</option>
                </select>
              </div>
              <div><label style={LBL}>Subject *</label><input style={INP} placeholder="e.g. Sill anchor condition at Level 3" value={newRFISubject} onChange={e => setNewRFISubject(e.target.value)} /></div>
              <div><label style={LBL}>Spec Section</label><input style={INP} placeholder="e.g. 08 44 13" value={newRFISpec} onChange={e => setNewRFISpec(e.target.value)} /></div>
              <div><label style={LBL}>Description</label><textarea style={{...INP,resize:'none'}} rows={3} placeholder="Full question or description" value={newRFIDesc} onChange={e => setNewRFIDesc(e.target.value)} /></div>
            </div>
            <div style={{ display:'flex',gap:10,marginTop:20 }}>
              <button onClick={() => setShowNewRFI(false)} style={{ flex:1,padding:11,borderRadius:12,border:'1px solid var(--color-surface-border)',background:'white',color:'var(--bos-color-ink-disabled)',fontSize:13,fontWeight:700,cursor:'pointer' }}>Cancel</button>
              <button onClick={submitRFI} disabled={!newRFISubject||saving} style={{ flex:2,padding:11,borderRadius:12,background:'linear-gradient(135deg,var(--bos-color-brand-primary-deep),var(--bos-color-brand-primary))',color:'white',border:'none',fontSize:13,fontWeight:700,cursor:'pointer' }}>{saving?'Saving...':'Create RFI'}</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW CO MODAL */}
      {showNewCO && (
        <div style={{ position:'fixed',inset:0,background:'rgba(15,23,42,0.5)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
          <div style={{ background:'white',borderRadius:24,width:'100%',maxWidth:480,padding:28,boxShadow:'0 24px 64px rgba(15,23,42,0.15)' }}>
            <div style={{ fontSize:17,fontWeight:800,color:'var(--color-ink-primary)',marginBottom:18 }}>New Change Order — {proj?.name}</div>
            <div style={{ display:'grid',gap:14 }}>
              <div><label style={LBL}>Title *</label><input style={INP} placeholder="Brief description of the change" value={newCOTitle} onChange={e => setNewCOTitle(e.target.value)} /></div>
              <div><label style={LBL}>Basis</label>
                <select style={INP} value={newCOBasis} onChange={e => setNewCOBasis(e.target.value)}>
                  {['OWNER_DIRECTED','GC_DIRECTED','UNFORESEEN_CONDITION','DESIGN_CHANGE','SPECIFICATION_CONFLICT','WEATHER','ACCELERATION','DELAY_IMPACT'].map(b => <option key={b} value={b}>{b.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div><label style={LBL}>Amount Requested ($)</label><input style={INP} type="number" placeholder="0" value={newCOAmount} onChange={e => setNewCOAmount(e.target.value)} /></div>
              <div><label style={LBL}>Description</label><textarea style={{...INP,resize:'none'}} rows={3} value={newCODesc} onChange={e => setNewCODesc(e.target.value)} /></div>
            </div>
            <div style={{ display:'flex',gap:10,marginTop:20 }}>
              <button onClick={() => setShowNewCO(false)} style={{ flex:1,padding:11,borderRadius:12,border:'1px solid var(--color-surface-border)',background:'white',color:'var(--bos-color-ink-disabled)',fontSize:13,fontWeight:700,cursor:'pointer' }}>Cancel</button>
              <button onClick={submitCO} disabled={!newCOTitle||saving} style={{ flex:2,padding:11,borderRadius:12,background:'linear-gradient(135deg,var(--color-amber-800),var(--color-amber-500))',color:'white',border:'none',fontSize:13,fontWeight:700,cursor:'pointer' }}>{saving?'Saving...':'Create CO'}</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW SUBMITTAL MODAL */}
      {showNewSub && (
        <div style={{ position:'fixed',inset:0,background:'rgba(15,23,42,0.5)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
          <div style={{ background:'white',borderRadius:24,width:'100%',maxWidth:480,padding:28,boxShadow:'0 24px 64px rgba(15,23,42,0.15)' }}>
            <div style={{ fontSize:17,fontWeight:800,color:'var(--color-ink-primary)',marginBottom:18 }}>Add Submittal — {proj?.name}</div>
            <div style={{ display:'grid',gap:14 }}>
              <div><label style={LBL}>Spec Section *</label><input style={INP} placeholder="e.g. 08 44 13" value={newSubSpec} onChange={e => setNewSubSpec(e.target.value)} /></div>
              <div><label style={LBL}>Description</label><input style={INP} placeholder="e.g. Curtain Wall Shop Drawings" value={newSubDesc} onChange={e => setNewSubDesc(e.target.value)} /></div>
            </div>
            <div style={{ display:'flex',gap:10,marginTop:20 }}>
              <button onClick={() => setShowNewSub(false)} style={{ flex:1,padding:11,borderRadius:12,border:'1px solid var(--color-surface-border)',background:'white',color:'var(--bos-color-ink-disabled)',fontSize:13,fontWeight:700,cursor:'pointer' }}>Cancel</button>
              <button onClick={submitSub} disabled={!newSubSpec||saving} style={{ flex:2,padding:11,borderRadius:12,background:'linear-gradient(135deg,var(--bos-color-accent-data),#0ea5e9)',color:'white',border:'none',fontSize:13,fontWeight:700,cursor:'pointer' }}>{saving?'Saving...':'Add Submittal'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: 12,
          background: '#f0fdf4', border: '1px solid rgba(34,197,94,0.3)',
          color: '#15803d', fontSize: 13, fontWeight: 700, zIndex: 500,
          boxShadow: '0 4px 16px rgba(15,23,42,0.1)',
          transition: 'opacity 0.3s',
        }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
