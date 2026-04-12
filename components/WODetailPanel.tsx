'use client';
import { useState, useEffect, useRef } from 'react';
import WorkBreakdown from '@/components/shared/WorkBreakdown';
import ActivityTimeline from '@/components/ActivityTimeline';
import { normalizePhone, normalizeEmail, normalizeName } from '@/lib/normalize';
import PlacesAutocomplete from '@/components/PlacesAutocomplete';
import type { ParsedPlace } from '@/components/PlacesAutocomplete';
import AutocompleteInput from '@/components/shared/AutocompleteInput';
import type { CustomerRecord } from '@/app/api/service/customers/route';

type WorkOrder = {
  id: string; name: string; description: string;
  status: string; rawStatus: string; island: string; area_of_island?: string;
  assignedTo: string; dateReceived: string; dueDate: string;
  scheduledDate: string; startDate: string;
  hoursEstimated: string; hoursActual: string; hoursToMeasure: string;
  men: string; done: boolean;
  comments: string; contact: string; address: string; lane: string;
  // Separate contact + customer fields
  contact_person?: string; contact_phone?: string; contact_email?: string;
  customer_name?: string;
  folderUrl?: string;
  systemType?: string;
  // QBO invoice fields (columns AA–AE)
  qbo_invoice_id?: string;
  invoice_number?: string;
  invoice_total?: string;
  invoice_balance?: string;
  invoice_date?: string;
};

type CrewMember = { user_id: string; name: string; role: string; island: string };

const STAGES = [
  { key: 'lead',          label: 'New Lead',          color: '#64748b' },
  { key: 'quoted',        label: 'Quoted',             color: '#7c3aed' },
  { key: 'approved',      label: 'Needs to Schedule', color: '#92400e' },
  { key: 'scheduled',     label: 'Scheduled',          color: '#4338ca' },
  { key: 'in_progress',   label: 'In Progress',        color: '#0f766e' },
  { key: 'work_complete', label: '✅ Work Complete',    color: '#059669' },
  { key: 'closed',        label: 'Close WO',           color: '#15803d' },
];

const STAGE_BG: Record<string, string> = {
  lead: '#f8fafc', quoted: '#f5f3ff',
  approved: '#fffbeb', scheduled: '#eef2ff', in_progress: '#f0fdfa',
  work_complete: '#ecfdf5', closed: '#f0fdf4',
};

function toTitleCase(str: string): string {
  if (!str) return str;
  const letters = str.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 2 && letters === letters.toUpperCase()) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return str;
}

const INP: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid #e2e8f0', background: 'white',
  fontSize: 13, color: '#0f172a', outline: 'none',
  boxSizing: 'border-box',
};

const LBL: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#94a3b8',
  marginBottom: 4, display: 'block',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: '#64748b',
  borderBottom: '1px solid #f1f5f9', paddingBottom: 8,
  marginBottom: 14, marginTop: 4,
};

interface WODetailPanelProps {
  wo: WorkOrder | null;
  allCrew: CrewMember[];
  readOnly?: boolean;
  onClose: () => void;
  onSave: (woId: string, fields: Partial<WorkOrder> & { hoursEstimated?: string; hoursActual?: string; _woName?: string; _island?: string }) => Promise<void>;
  onStageChange: (woId: string, stage: string) => Promise<void>;
  onQuote: (woId: string) => void;
  onEstimate: (wo: WorkOrder) => void;
  onFolderLinked?: (woId: string, folderUrl: string) => void;
}

export default function WODetailPanel({ wo, allCrew, readOnly = false, onClose, onSave, onStageChange, onQuote, onEstimate, onFolderLinked }: WODetailPanelProps) {
  const [draft, setDraft] = useState<Partial<WorkOrder> & { hoursEstimated?: string; hoursActual?: string }>({});
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [stageSaving, setStageSaving] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeActualHours, setCloseActualHours] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [stageError, setStageError] = useState('');
  const [linkingFolder, setLinkingFolder] = useState(false);
  const [linkFolderInput, setLinkFolderInput] = useState('');
  const [linkFolderSaving, setLinkFolderSaving] = useState(false);
  const [linkedFolderUrl, setLinkedFolderUrl] = useState<string | undefined>(undefined);
  const [jobFiles, setJobFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync linkedFolderUrl from wo prop
  useEffect(() => { setLinkedFolderUrl(wo?.folderUrl); }, [wo?.folderUrl]);

  // Load customers for autocomplete (once on mount)
  useEffect(() => {
    fetch('/api/service/customers')
      .then(r => r.json())
      .then(data => setCustomers(data.customers || data || []))
      .catch(err => console.error('[WODetailPanel] Failed to load customers:', err));
  }, []);

  async function handleLinkFolder() {
    if (!linkFolderInput || !wo) return;
    setLinkFolderSaving(true);
    try {
      await fetch('/api/service/folder-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ woName: wo.name, folderUrl: linkFolderInput }),
      });
      setLinkedFolderUrl(linkFolderInput);
      onFolderLinked?.(wo.id, linkFolderInput);
      setLinkingFolder(false);
      setLinkFolderInput('');
    } catch {
      // swallow — not critical
    } finally {
      setLinkFolderSaving(false);
    }
  }

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!wo) return;
    // Only initialize draft on first mount — don't wipe user edits on re-render
    if (initializedRef.current) return;
    initializedRef.current = true;
    setDraft({
      name: wo.name,
      description: wo.description,
      contact: wo.contact,
      address: wo.address,
      island: wo.island,
      scheduledDate: wo.scheduledDate,
      dueDate: wo.dueDate,
      hoursEstimated: wo.hoursEstimated,
      hoursActual: wo.hoursActual,
      men: wo.men,
      comments: wo.comments,
      lane: wo.lane,
      // Separate contact + customer fields
      contact_person: wo.contact_person,
      contact_phone:  wo.contact_phone,
      contact_email:  wo.contact_email,
      customer_name:  wo.customer_name,
    } as Partial<WorkOrder>);
    setSelectedCrew(wo.assignedTo ? wo.assignedTo.split(',').map(s => s.trim()).filter(Boolean) : []);
    setDirty(false);
  }, [wo]);

  if (!wo) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 400, backdropFilter: 'blur(2px)' }} />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
          height: '40vh', background: '#f8fafc', borderRadius: '20px 20px 0 0',
          boxShadow: '0 -24px 80px rgba(15,23,42,0.18)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 32,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Work order not found</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, textAlign: 'center' }}>The work order you selected could not be loaded. It may have been removed or the data is unavailable.</div>
          <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 12, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Close</button>
        </div>
      </>
    );
  }
  const safeWo = wo;

  const stage = STAGES.find(s => s.key === safeWo.status) || STAGES[0];

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft; // always up to date

  function update(field: string, value: string) {
    setDraft(prev => ({ ...prev, [field]: value }));
    setDirty(true);
    // Auto-save after 2s of inactivity — reads latest draft via ref
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const latest = { ...draftRef.current, [field]: value };
      setSaving(true);
      try {
        await onSave(safeWo.id, {
          ...latest,
          assignedTo: selectedCrew.join(', '),
          _woName: latest.name || safeWo.name,
          _island: latest.island || safeWo.island,
        });
        setDirty(false);
      } catch (err) { console.error('[WODetailPanel] auto-save failed:', err); } finally { setSaving(false); }
    }, 2000);
  }

  function toggleCrew(name: string) {
    setSelectedCrew(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(safeWo.id, {
        ...draft,
        assignedTo: selectedCrew.join(', '),
        _woName: draft.name || safeWo.name,
        _island: draft.island || safeWo.island,
      });
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStageChange(stageKey: string) {
    // 'closed' requires confirmation modal — intercept here
    if (stageKey === 'closed') {
      setShowCloseModal(true);
      return;
    }
    setStageSaving(stageKey);
    setStageError('');
    try {
      await onStageChange(safeWo.id, stageKey);
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'Failed to update stage.');
    } finally {
      setStageSaving('');
    }
  }

  async function handleConfirmClose() {
    setCloseSubmitting(true);
    try {
      // 1. Change stage to closed
      await onStageChange(safeWo.id, 'closed');
      // 2. Write actual hours to WO if provided
      if (closeActualHours) {
        await onSave(safeWo.id, { hoursActual: closeActualHours } as Parameters<typeof onSave>[1]);
      }
      // 3. Write NOTE event to Field_Events_V1
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'NOTE',
          target_kID: safeWo.id,
          performed_by: 'joey@kulaglass.com',
          recorded_by: 'joey@kulaglass.com',
          notes: `WO closed by ${safeWo.assignedTo || 'PM'}.${closeActualHours ? ` Actual hours: ${closeActualHours}.` : ''}${closeNotes ? ` Notes: ${closeNotes}` : ''}`,
        }),
      }).catch(e => console.error('[WO close event]', e));
      setShowCloseModal(false);
      setCloseActualHours('');
      setCloseNotes('');
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'Failed to close WO.');
    } finally {
      setCloseSubmitting(false);
    }
  }

  // Island-filtered field crew
  function areaToIsland(area: string): string {
    const a = (area || '').toLowerCase();
    if (['oahu','honolulu','kapolei','kailua','kaneohe','pearl city','aiea','ewa','hawaii kai'].some(c => a.includes(c))) return 'Oahu';
    if (['kauai','lihue','kapaa','poipu','princeville','koloa'].some(c => a.includes(c))) return 'Kauai';
    if (['hilo','kona','waimea','kohala','puna'].some(c => a.includes(c))) return 'Hawaii';
    if (a) return 'Maui';
    return '';
  }
  const woIsland = ['Oahu','Maui','Kauai','Hawaii'].includes(wo.island) ? wo.island : areaToIsland(wo.island);
  const islandCrew = allCrew.filter(c => {
    const isField = ['Superintendent','Journeyman','Apprentice'].some(r => c.role.includes(r));
    return isField && (!woIsland || c.island === woIsland);
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 400, backdropFilter: 'blur(2px)' }}
      />

      {/* Slide-up panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        height: '92vh',
        background: '#f8fafc',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -24px 80px rgba(15,23,42,0.18)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Header strip */}
        <div style={{
          padding: '14px 20px 12px',
          background: 'white',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          {/* Drag handle */}
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 36, height: 4, borderRadius: 2, background: '#e2e8f0' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <div style={{ width: 4, height: 36, borderRadius: 2, background: stage.color }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {toTitleCase(wo.name)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                {wo.id && <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>{wo.id}</span>}
                <span style={{ fontSize: 10, fontWeight: 800, color: stage.color, background: STAGE_BG[wo.status] || '#f8fafc', padding: '2px 8px', borderRadius: 999, border: `1px solid ${stage.color}33` }}>{stage.label}</span>
                {wo.island && <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{wo.island}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(linkedFolderUrl || wo.folderUrl) ? (
              <a
                href={linkedFolderUrl || wo.folderUrl}
                target="_blank"
                rel="noreferrer"
                title="Open project files in Drive"
                onClick={e => e.stopPropagation()}
                style={{ padding: '7px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid rgba(3,105,161,0.2)', color: '#0369a1', fontSize: 12, fontWeight: 800, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                📁 Files
              </a>
            ) : (
              <button
                onClick={() => setLinkingFolder(p => !p)}
                title="Link Drive folder"
                style={{ padding: '7px 14px', borderRadius: 10, background: linkingFolder ? 'rgba(239,246,255,0.96)' : '#f8fafc', border: linkingFolder ? '1px solid rgba(3,105,161,0.4)' : '1px solid #e2e8f0', color: linkingFolder ? '#0369a1' : '#64748b', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                🔗 Link Folder
              </button>
            )}
            <button
              onClick={() => onEstimate(wo)}
              title="Open Simple Estimate"
              style={{ padding: '7px 14px', borderRadius: 10, background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.2)', color: '#0f766e', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              📊 Estimate
            </button>
            <button
              onClick={() => onQuote(wo.id)}
              title="Build quote (skip estimate)"
              style={{ padding: '7px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid rgba(3,105,161,0.2)', color: '#0369a1', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              $ Quote
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/service/dispatch-pdf?wo=${encodeURIComponent(wo.id)}`);
                  if (!res.ok) { alert('Failed to generate work order PDF'); return; }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `${wo.id.startsWith('WO-') ? wo.id : 'WO-' + wo.id}.pdf`; a.click();
                  URL.revokeObjectURL(url);
                } catch { alert('Failed to generate work order PDF'); }
              }}
              title="Print work order for field crew"
              style={{ padding: '7px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid rgba(21,128,61,0.2)', color: '#15803d', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              Print WO
            </button>
            {dirty && !readOnly && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '7px 16px', borderRadius: 10, background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: saving ? '#94a3b8' : 'white', border: 'none', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 2px 8px rgba(15,118,110,0.3)' }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            )}
            {readOnly && <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, padding: '4px 10px', background: 'rgba(245,158,11,0.08)', borderRadius: 8 }}>👁 View only</div>}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Error banners */}
        {saveError && (
          <div style={{ margin: '0 20px', padding: '10px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {saveError}</span>
            <button onClick={() => setSaveError('')} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        )}
        {stageError && (
          <div style={{ margin: '0 20px', padding: '10px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {stageError}</span>
            <button onClick={() => setStageError('')} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        )}

        {/* Link Folder input bar */}
        {linkingFolder && (
          <div style={{ padding: '10px 20px 12px', background: 'rgba(239,246,255,0.8)', borderBottom: '1px solid rgba(59,130,246,0.15)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', flexShrink: 0 }}>Folder URL:</span>
            <input
              type="url"
              value={linkFolderInput}
              onChange={e => setLinkFolderInput(e.target.value)}
              placeholder="Paste Google Drive folder URL..."
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleLinkFolder(); if (e.key === 'Escape') { setLinkingFolder(false); setLinkFolderInput(''); } }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(3,105,161,0.3)', fontSize: 12, outline: 'none', background: 'white', color: '#0f172a' }}
            />
            <button
              onClick={handleLinkFolder}
              disabled={!linkFolderInput || linkFolderSaving}
              style={{ padding: '8px 16px', borderRadius: 8, background: linkFolderInput && !linkFolderSaving ? '#0369a1' : '#e2e8f0', color: linkFolderInput && !linkFolderSaving ? 'white' : '#94a3b8', border: 'none', fontSize: 12, fontWeight: 700, cursor: linkFolderInput && !linkFolderSaving ? 'pointer' : 'default', flexShrink: 0 }}>
              {linkFolderSaving ? 'Saving...' : 'Save Link'}
            </button>
            <button
              onClick={() => { setLinkingFolder(false); setLinkFolderInput(''); }}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: 14, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>
              ✕
            </button>
          </div>
        )}

        {/* Scrollable body — two-column layout */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 1100, margin: '0 auto' }}>

            {/* ── LEFT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Pipeline Stage — first thing Joey sees */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Pipeline Stage</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
                  {STAGES.map(s => {
                    const isActive = wo.status === s.key;
                    const isSaving = stageSaving === s.key;
                    return (
                      <button key={s.key}
                        onClick={() => !isActive && !stageSaving && handleStageChange(s.key)}
                        disabled={isActive || !!stageSaving}
                        style={{
                          padding: '9px 6px', borderRadius: 10, fontSize: 10, fontWeight: 800,
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          cursor: isActive || stageSaving ? 'default' : 'pointer',
                          border: isActive ? `1.5px solid ${s.color}` : '1px solid #e2e8f0',
                          background: isSaving ? '#f1f5f9' : isActive ? STAGE_BG[s.key] || '#f8fafc' : 'white',
                          color: isActive ? s.color : '#94a3b8',
                          opacity: stageSaving && !isActive ? 0.5 : 1,
                          transition: 'all 0.1s',
                        }}>
                        {isSaving ? '…' : s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Job Details */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Job Details</div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div>
                    <label style={LBL}>Job Name</label>
                    <input style={INP} value={draft.name || ''} onChange={e => update('name', e.target.value)} placeholder="Customer / job name" />
                  </div>
                  <div>
                    <label style={LBL}>Description / Scope</label>
                    <textarea
                      rows={3}
                      style={{ ...INP, resize: 'none' }}
                      value={draft.description || ''}
                      onChange={e => update('description', e.target.value)}
                      placeholder="What needs to be done…"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={LBL}>Island</label>
                      <select style={INP} value={draft.island || ''} onChange={e => update('island', e.target.value)}>
                        <option value="">Select…</option>
                        {['Maui','Oahu','Kauai','Hawaii','Molokai','Lanai'].map(isl => <option key={isl}>{isl}</option>)}
                      </select>
                    </div>
                    <div>
                      {/* Lane field removed — was a derived status, not real data */}
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer & Site */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Customer &amp; Site</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <label style={{ ...LBL, marginBottom: 0 }}>Customer / Account Name</label>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.2)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Auto</span>
                    </div>
                    <AutocompleteInput
                      value={(draft as WorkOrder & { customer_name?: string }).customer_name ?? wo.customer_name ?? ''}
                      onChange={v => update('customer_name', v)}
                      onSelect={c => {
                        update('customer_name', c.company || c.name || '');
                        if (c.contactPerson) update('contact_person', c.contactPerson);
                        if (c.phone || c.contactPhone) update('contact_phone', c.phone || c.contactPhone || '');
                        if (c.email) update('contact_email', c.email);
                        if (c.address) update('address', c.address);
                      }}
                      placeholder="Billing account name"
                      style={INP}
                      customers={customers}
                      matchField="company"
                      subField="address"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <label style={{ ...LBL, marginBottom: 0 }}>Contact Person</label>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.2)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Auto</span>
                      </div>
                      <AutocompleteInput
                        value={(draft as WorkOrder & { contact_person?: string }).contact_person ?? wo.contact_person ?? ''}
                        onChange={v => update('contact_person', v)}
                        onSelect={c => {
                          update('contact_person', c.contactPerson || '');
                          if (c.company) update('customer_name', c.company);
                          if (c.phone || c.contactPhone) update('contact_phone', c.phone || c.contactPhone || '');
                          if (c.email) update('contact_email', c.email);
                        }}
                        placeholder="Person on site"
                        style={INP}
                        customers={customers}
                        matchField="contactPerson"
                        subField="company"
                      />
                    </div>
                    <div>
                      <label style={LBL}>Contact Phone</label>
                      <input type="tel" style={INP} value={(draft as WorkOrder & { contact_phone?: string }).contact_phone ?? wo.contact_phone ?? ''} onChange={e => update('contact_phone', e.target.value)} onBlur={e => update('contact_phone', normalizePhone(e.target.value))} placeholder="(808) 555-0199" />
                    </div>
                  </div>
                  <div>
                    <label style={LBL}>Contact Email</label>
                    <input type="email" style={INP} value={(draft as WorkOrder & { contact_email?: string }).contact_email ?? wo.contact_email ?? ''} onChange={e => update('contact_email', e.target.value)} onBlur={e => update('contact_email', normalizeEmail(e.target.value))} placeholder="email@example.com" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <label style={{ ...LBL, marginBottom: 0 }}>Address</label>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'rgba(66,133,244,0.1)', color: '#1a56db', border: '1px solid rgba(66,133,244,0.25)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Places</span>
                    </div>
                    <PlacesAutocomplete
                      value={draft.address || ''}
                      onChange={v => update('address', v)}
                      onSelect={(place: ParsedPlace) => {
                        update('address', place.formatted_address);
                        if (place.island) update('island', place.island);
                      }}
                      placeholder="Start typing an address…"
                      style={INP}
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Notes & Comments</div>
                <textarea
                  rows={4}
                  style={{ ...INP, resize: 'none' }}
                  value={draft.comments || ''}
                  onChange={e => update('comments', e.target.value)}
                  placeholder="Internal notes, follow-ups, customer requests…"
                />
              </div>

              {/* QBO Invoice */}
              {wo.qbo_invoice_id && (
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={SECTION_TITLE}>Invoice</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>#{wo.invoice_number || wo.qbo_invoice_id}</div>
                    {(() => {
                      const balance = parseFloat(wo.invoice_balance || '0');
                      const isPaid = balance === 0;
                      return (
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
                          background: isPaid ? 'rgba(21,128,61,0.1)' : 'rgba(234,179,8,0.1)',
                          color: isPaid ? '#15803d' : '#a16207',
                          border: isPaid ? '1px solid rgba(21,128,61,0.3)' : '1px solid rgba(234,179,8,0.3)',
                        }}>
                          {isPaid ? '✓ Paid' : '⚠ Outstanding'}
                        </span>
                      );
                    })()}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                      <div style={{ ...LBL, marginBottom: 2 }}>Invoice Total</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        ${parseFloat(wo.invoice_total || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                      <div style={{ ...LBL, marginBottom: 2 }}>Balance Due</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: parseFloat(wo.invoice_balance || '0') > 0 ? '#a16207' : '#15803d' }}>
                        ${parseFloat(wo.invoice_balance || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                      <div style={{ ...LBL, marginBottom: 2 }}>Invoice Date</div>
                      <div style={{ fontSize: 12, color: '#475569' }}>{wo.invoice_date || '—'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Job Files — Work Breakdown moved to top of layout */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    setJobFiles(prev => [...prev, ...files]);
                    e.target.value = '';
                  }}
                />
                <div style={{ ...SECTION_TITLE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span>Job Files</span>
                  {jobFiles.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', background: 'rgba(15,118,110,0.08)', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(15,118,110,0.15)' }}>
                      {jobFiles.length}
                    </span>
                  )}
                </div>
                <div
                  onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
                  onDragLeave={() => setIsDraggingOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                    const files = Array.from(e.dataTransfer.files);
                    setJobFiles(prev => [...prev, ...files]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDraggingOver ? '#14b8a6' : '#e2e8f0'}`,
                    borderRadius: 10,
                    padding: '14px 16px',
                    textAlign: 'center' as const,
                    cursor: 'pointer',
                    background: isDraggingOver ? 'rgba(240,253,250,0.8)' : '#f8fafc',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>📎</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isDraggingOver ? '#0f766e' : '#64748b' }}>
                    Drop files here or click to browse
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Images, PDFs, documents</div>
                </div>
                {jobFiles.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {jobFiles.map((file, i) => {
                      const isPDF = file.type === 'application/pdf';
                      const isImage = file.type.startsWith('image/');
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                          <span style={{ fontSize: 14 }}>{isPDF ? '📄' : isImage ? '🖼' : '📎'}</span>
                          <span style={{ flex: 1, fontSize: 12, color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                          <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{(file.size / 1024).toFixed(0)} KB</span>
                          <button
                            onClick={e => { e.stopPropagation(); setJobFiles(prev => prev.filter((_, j) => j !== i)); }}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                          >×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Work Breakdown — first thing in right column */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Work Breakdown</div>
                <WorkBreakdown
                  jobId={wo.id}
                  jobType="wo"
                  quotedHours={parseFloat(wo.hoursEstimated) || undefined}
                  readOnly={readOnly}
                  systemTypes={wo.systemType}
                />
              </div>

              {/* Activity Timeline — below Work Breakdown */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Activity Timeline</div>
                <ActivityTimeline kID={wo.id} />
              </div>

              {/* Crew Assignment */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Crew Assignment — {woIsland || 'All Islands'}</div>
                {islandCrew.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No field crew found for {wo.island || 'this island'}.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {islandCrew.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i).map(c => {
                      const sel = selectedCrew.includes(c.name);
                      return (
                        <button key={c.user_id} onClick={() => toggleCrew(c.name)} style={{
                          padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          border: sel ? '1px solid rgba(99,102,241,0.5)' : '1px solid #e2e8f0',
                          background: sel ? 'rgba(99,102,241,0.1)' : 'white',
                          color: sel ? '#4338ca' : '#64748b',
                          transition: 'all 0.1s',
                        }}>
                          {sel ? '✓ ' : ''}{c.name}
                          <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>{c.role.split('/')[0].trim()}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedCrew.length > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', fontSize: 12, color: '#4338ca', fontWeight: 600 }}>
                    {selectedCrew.join(', ')}
                    {draft.scheduledDate ? ` → ${draft.scheduledDate}` : ''}
                  </div>
                )}
              </div>


            </div>
          </div>
        </div>

        {/* Bottom save bar — always visible */}
        {dirty && !readOnly && (
          <div style={{
            flexShrink: 0, padding: '12px 20px',
            background: 'white', borderTop: '1px solid #e2e8f0',
            display: 'flex', justifyContent: 'flex-end', gap: 10,
          }}>
            <button onClick={() => { setDraft({}); setDirty(false); onClose(); }}
              style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Discard
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '10px 24px', borderRadius: 10, background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: saving ? '#94a3b8' : 'white', border: 'none', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 3px 10px rgba(15,118,110,0.3)' }}>
              {saving ? 'Saving…' : '✓ Save All Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Close WO Modal */}
      {showCloseModal && (
        <>
          <div onClick={() => setShowCloseModal(false)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', zIndex:600, backdropFilter:'blur(2px)' }} />
          <div style={{
            position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            zIndex:601, background:'white', borderRadius:20, padding:28, width:420, maxWidth:'90vw',
            boxShadow:'0 24px 80px rgba(15,23,42,0.2)',
          }}>
            <div style={{ fontSize:18, fontWeight:800, color:'#0f172a', marginBottom:6 }}>Close Work Order</div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>Enter final details before closing {safeWo.name}.</div>

            <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#64748b', display:'block', marginBottom:6 }}>Actual Hours Worked</label>
            <input type="number" step="0.5" min="0"
              value={closeActualHours}
              onChange={e => setCloseActualHours(e.target.value)}
              placeholder="e.g. 12.5"
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e8f0', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:16 }}
            />

            <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#64748b', display:'block', marginBottom:6 }}>Completion Notes (optional)</label>
            <textarea
              value={closeNotes}
              onChange={e => setCloseNotes(e.target.value)}
              placeholder="Any final notes for the record…"
              rows={3}
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e8f0', fontSize:13, outline:'none', resize:'none', boxSizing:'border-box', marginBottom:20 }}
            />

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowCloseModal(false)}
                style={{ flex:1, padding:'12px', borderRadius:12, border:'1px solid #e2e8f0', background:'white', color:'#64748b', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleConfirmClose} disabled={closeSubmitting}
                style={{ flex:2, padding:'12px', borderRadius:12, border:'none',
                  background: closeSubmitting ? '#e2e8f0' : 'linear-gradient(135deg,#15803d,#16a34a)',
                  color: closeSubmitting ? '#94a3b8' : 'white', fontSize:13, fontWeight:800,
                  cursor: closeSubmitting ? 'default' : 'pointer',
                  boxShadow: closeSubmitting ? 'none' : '0 3px 12px rgba(21,128,61,0.3)' }}>
                {closeSubmitting ? 'Closing…' : '✓ Close Work Order'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
