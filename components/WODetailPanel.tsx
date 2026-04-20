'use client';
import React, { useState, useEffect, useRef } from 'react';
import WorkBreakdown from '@/components/shared/WorkBreakdown';
import ActivityTimeline from '@/components/ActivityTimeline';
import { normalizePhone, normalizeEmail, normalizeName } from '@/lib/normalize';
import PlacesAutocomplete from '@/components/PlacesAutocomplete';
import type { ParsedPlace } from '@/components/PlacesAutocomplete';
import AutocompleteInput from '@/components/shared/AutocompleteInput';
import ContactAutocomplete from '@/components/shared/ContactAutocomplete';
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
  // QBO invoice fields (columns AA-AE)
  qbo_invoice_id?: string;
  invoice_number?: string;
  invoice_total?: string;
  invoice_balance?: string;
  invoice_date?: string;
  deposit_status?: string; deposit_amount?: string; deposit_invoice_num?: string;
  deposit_sent_date?: string; deposit_paid_date?: string;
  final_status?: string; final_amount?: string; final_invoice_num?: string;
  final_sent_date?: string; final_paid_date?: string;
  invoices_json?: string;
};

type CrewMember = { user_id: string; name: string; role: string; island: string };

const STAGES = [
  { key: 'lead',               label: 'Lead',         color: '#3b82f6' },
  { key: 'quoted',             label: 'Quoted',       color: '#3b82f6' },
  { key: 'accepted',           label: 'Accepted',     color: '#0f766e' },
  { key: 'deposit_received',   label: 'Deposit',      color: '#0f766e' },
  { key: 'materials_ordered',  label: 'Mat Ordered',  color: '#d97706' },
  { key: 'materials_received', label: 'Mat In',       color: '#d97706' },
  { key: 'ready_to_schedule',  label: 'Ready',        color: '#7c3aed' },
  { key: 'scheduled',          label: 'Scheduled',    color: '#7c3aed' },
  { key: 'in_progress',        label: 'In Progress',  color: '#7c3aed' },
  { key: 'work_complete',      label: 'Complete',     color: '#16a34a' },
  { key: 'invoiced',           label: 'Invoiced',     color: '#16a34a' },
  { key: 'paid',               label: 'Paid',         color: '#16a34a' },
  { key: 'closed',             label: 'Closed',       color: '#64748b' },
];

const STAGE_BG: Record<string, string> = {
  lead: '#f8fafc', quoted: '#f5f3ff',
  approved: '#fffbeb', scheduled: '#eef2ff', in_progress: '#f0fdfa',
  work_complete: '#ecfdf5', closed: '#f0fdf4',
  deposit_received: '#fffbeb', materials_ordered: '#fff7ed', materials_received: '#f0fdf4', ready_to_schedule: '#eff6ff',
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
  onStageChange: (woId: string, stage: string, reason?: string) => Promise<void>;
  onQuote: (woId: string) => void;
  onEstimate: (wo: WorkOrder) => void;
  onFolderLinked?: (woId: string, folderUrl: string) => void;
}

export default function WODetailPanel({ wo, allCrew, readOnly = false, onClose, onSave, onStageChange, onQuote, onEstimate, onFolderLinked }: WODetailPanelProps) {
  const [draft, setDraft] = useState<Partial<WorkOrder> & { hoursEstimated?: string; hoursActual?: string }>({});
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [procurementOrders, setProcurementOrders] = useState<any[]>([]);
  const [showAddQuote, setShowAddQuote] = useState(false);
  const [newQuote, setNewQuote] = useState({ vendor_org_id:'', vendor_name:'', quote_date:new Date().toISOString().slice(0,10), quote_valid_until:'', notes:'', quote_document_url:'', quote_document_name:'', line_items:[{ description:'', quantity:'1', unit:'EA', unit_cost:'' }] });
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorResults, setVendorResults] = useState<any[]>([]);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [inspectionMode, setInspectionMode] = useState<string | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);
  const [stageSaving, setStageSaving] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeActualHours, setCloseActualHours] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineSubmitting, setDeclineSubmitting] = useState(false);
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

  // Load procurement orders when WO changes
  useEffect(() => {
    if (!wo?.id) return;
    fetch(`/api/procurement?wo_id=${wo.id}`)
      .then(r => r.json())
      .then(d => setProcurementOrders(d.orders || []))
      .catch(err => console.error('[WODetailPanel] loadProcurement', err));
  }, [wo?.id]);

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
      // swallow - not critical
    } finally {
      setLinkFolderSaving(false);
    }
  }

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!wo) return;
    // Only initialize draft on first mount - don't wipe user edits on re-render
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
  const isDeclined = safeWo.status === 'lost';

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft; // always up to date

  function update(field: string, value: string) {
    setDraft(prev => ({ ...prev, [field]: value }));
    setDirty(true);
    // Auto-save after 2s of inactivity - reads latest draft via ref
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
    // 'closed' requires confirmation modal - intercept here
    if (stageKey === 'closed') {
      setShowCloseModal(true);
      return;
    }
    // 'lost' requires decline confirmation modal
    if (stageKey === 'lost') {
      setShowDeclineModal(true);
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

  async function handleConfirmDecline() {
    setDeclineSubmitting(true);
    try {
      await onStageChange(safeWo.id, 'lost', declineReason);
      setShowDeclineModal(false);
      setDeclineReason('');
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'Failed to mark as declined.');
    } finally {
      setDeclineSubmitting(false);
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
              onClick={() => {
                const el = document.getElementById('procurement-section');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              title="Jump to Materials & Procurement"
              style={{ padding: '7px 14px', borderRadius: 10, background: '#fff7ed', border: '1px solid rgba(249,115,22,0.2)', color: '#c2410c', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              📦 Materials
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
                {saving ? 'Saving...' : 'Save Changes'}
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

        {/* Scrollable body - two-column layout */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 1100, margin: '0 auto' }}>

            {/* ── LEFT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Pipeline Stage - horizontal progress stepper */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Pipeline Stage</div>
                {safeWo.status === 'lost' ? (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>❌ Declined</div>
                ) : (
                  <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 'max-content', padding: '4px 0' }}>
                      {STAGES.map((s, idx) => {
                        const currentIdx = STAGES.findIndex(x => x.key === safeWo.status);
                        const isPast = idx < currentIdx;
                        const isCurrent = idx === currentIdx;
                        const isFuture = idx > currentIdx;
                        const isSaving = stageSaving === s.key;
                        return (
                          <React.Fragment key={s.key}>
                            {idx > 0 && (
                              <div style={{ width: 20, height: 2, background: isPast ? STAGES[idx-1].color : '#e2e8f0', flexShrink: 0 }} />
                            )}
                            <div
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: readOnly ? 'default' : isCurrent ? 'default' : 'pointer', flexShrink: 0 }}
                              onClick={async () => {
                                if (readOnly || isCurrent || !!stageSaving) return;
                                if (isPast) {
                                  const reason = prompt(`Roll back to "${s.label}"? Enter reason (required):`);
                                  if (!reason?.trim()) return;
                                }
                                if (isFuture && idx > currentIdx + 1) {
                                  if (!confirm(`Skip to "${s.label}"? This skips ${idx - currentIdx - 1} stages.`)) return;
                                }
                                await handleStageChange(s.key);
                              }}
                            >
                              <style>{`@keyframes pulse-dot{0%,100%{box-shadow:0 0 0 0 ${s.color}40}50%{box-shadow:0 0 0 5px ${s.color}00}}`}</style>
                              <div style={{
                                width: isCurrent ? 14 : 10,
                                height: isCurrent ? 14 : 10,
                                borderRadius: '50%',
                                background: isPast ? s.color : isCurrent ? s.color : '#e2e8f0',
                                border: isCurrent ? `2px solid ${s.color}` : isPast ? 'none' : '1.5px solid #cbd5e1',
                                boxShadow: isCurrent ? `0 0 0 3px ${s.color}25` : 'none',
                                animation: isCurrent ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                                transition: 'all 0.2s',
                                flexShrink: 0,
                                opacity: isSaving ? 0.5 : 1,
                              }} />
                              <span style={{
                                fontSize: 9, fontWeight: isCurrent ? 800 : 600,
                                color: isCurrent ? s.color : isPast ? '#64748b' : '#94a3b8',
                                whiteSpace: 'nowrap', letterSpacing: '0.02em',
                                textTransform: 'uppercase',
                              }}>{isSaving ? '...' : s.label}</span>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!readOnly && !isDeclined && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <select
                      value={safeWo.status}
                      disabled={!!stageSaving}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === safeWo.status) return;
                        handleStageChange(val);
                      }}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#334155', background: 'white', cursor: stageSaving ? 'default' : 'pointer', width: '100%', outline: 'none' }}
                    >
                      {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <button
                      onClick={() => setShowDeclineModal(true)}
                      disabled={!!stageSaving}
                      style={{
                        padding: '6px 12px', borderRadius: 8,
                        border: '1px solid rgba(148,163,184,0.4)', background: 'white',
                        color: '#ef4444', fontSize: 11, fontWeight: 700,
                        cursor: stageSaving ? 'default' : 'pointer',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                        opacity: stageSaving ? 0.5 : 1,
                      }}
                    >
                      Mark Declined
                    </button>
                  </div>
                )}
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
                      placeholder="What needs to be done..."
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={LBL}>Island</label>
                      <select style={INP} value={draft.island || ''} onChange={e => update('island', e.target.value)}>
                        <option value="">Select...</option>
                        {['Maui','Oahu','Kauai','Hawaii','Molokai','Lanai'].map(isl => <option key={isl}>{isl}</option>)}
                      </select>
                    </div>
                    <div>
                      {/* Lane field removed - was a derived status, not real data */}
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
                      <ContactAutocomplete
                        value={(draft as WorkOrder & { contact_person?: string }).contact_person ?? wo.contact_person ?? ''}
                        onChange={v => update('contact_person', v)}
                        onSelect={c => {
                          update('contact_person', c.name);
                          if (c.phone) update('contact_phone', c.phone);
                          if (c.email) update('contact_email', c.email);
                        }}
                        placeholder="Search contacts..."
                        style={INP}
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
                      placeholder="Start typing an address..."
                      style={INP}
                    />
                  </div>
                </div>
              </div>

              {/* Procurement & Billing */}
              <div id="procurement-section" style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Procurement &amp; Billing</div>

                {/* Quote & Deposit sub-card */}
                <div style={{ background: '#fafafa', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Quote &amp; Deposit</div>
                  {(safeWo as any).quote_total ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#475569' }}>Quote Total</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>${Number((safeWo as any).quote_total).toLocaleString('en-US', {minimumFractionDigits:2})}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: '#475569' }}>Deposit (50%)</span>
                        <span style={{ fontSize: 12, color: '#475569' }}>${(Number((safeWo as any).quote_total) * 0.5).toLocaleString('en-US', {minimumFractionDigits:2})}</span>
                      </div>
                      {safeWo.status === 'deposit_received' || safeWo.status === 'materials_ordered' || safeWo.status === 'materials_received' || safeWo.status === 'ready_to_schedule' ? (
                        <div style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>✅ Deposit Received</div>
                      ) : (
                        <button onClick={async () => {
                          if (!confirm('Mark deposit as received?')) return;
                          await onStageChange(safeWo.id, 'deposit_received');
                        }} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569', fontWeight: 700 }}>
                          Mark Deposit Received
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>No quote total set. Generate a quote first.</div>
                  )}
                </div>

                {/* Vendor Quotes sub-card */}
                <div style={{ background: '#fafafa', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Vendor Quotes</div>
                    <button onClick={() => setShowAddQuote(p => !p)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: '1px solid #0f766e', background: showAddQuote ? '#0f766e' : 'white', color: showAddQuote ? 'white' : '#0f766e', cursor: 'pointer', fontWeight: 700 }}>
                      {showAddQuote ? '✕ Cancel' : '+ Add Vendor Quote'}
                    </button>
                  </div>

                  {/* Add vendor quote form */}
                  {showAddQuote && (
                    <div style={{ background: 'white', borderRadius: 9, border: '1px solid #e2e8f0', padding: '12px', marginBottom: 10 }}>
                      {/* Vendor search */}
                      <div style={{ marginBottom: 8, position: 'relative' }}>
                        <label style={LBL}>Vendor *</label>
                        <input
                          style={INP}
                          value={vendorSearch}
                          placeholder="Search vendors..."
                          onChange={e => { setVendorSearch(e.target.value); setNewQuote(p => ({...p, vendor_name: e.target.value, vendor_org_id: ''})); }}
                          onFocus={async () => {
                            setShowVendorDropdown(true);
                            if (vendorResults.length === 0) {
                              try {
                                const vRes = await fetch('/api/organizations?types=VENDOR&limit=100');
                                const vData = await vRes.json();
                                setVendorResults(vData.organizations || vData || []);
                              } catch(err) { console.error('[WODetailPanel] loadVendors', err); }
                            }
                          }}
                          onBlur={() => setTimeout(() => setShowVendorDropdown(false), 150)}
                        />
                        {showVendorDropdown && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(15,23,42,0.1)', zIndex: 500, maxHeight: 180, overflowY: 'auto' }}>
                            {vendorResults
                              .filter(v => !vendorSearch || (v.name || v.org_name || '').toLowerCase().includes(vendorSearch.toLowerCase()))
                              .map(v => (
                                <div key={v.id || v.org_id} onMouseDown={() => {
                                  const vName = v.name || v.org_name || '';
                                  setVendorSearch(vName);
                                  setNewQuote(p => ({...p, vendor_org_id: v.id || v.org_id || '', vendor_name: vName}));
                                  setShowVendorDropdown(false);
                                }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: '#0f172a', background: 'white' }}
                                  onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                                  onMouseOut={e => (e.currentTarget.style.background = 'white')}>
                                  {v.name || v.org_name}
                                </div>
                              ))
                            }
                            <div onMouseDown={() => setShowVendorDropdown(false)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: '#0f766e', fontWeight: 700, borderTop: '1px solid #f1f5f9' }}>+ Add New Vendor</div>
                          </div>
                        )}
                      </div>

                      {/* Dates */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div><label style={LBL}>Quote Date</label><input style={INP} type="date" value={newQuote.quote_date} onChange={e => setNewQuote(p => ({...p, quote_date: e.target.value}))} /></div>
                        <div><label style={LBL}>Valid Until</label><input style={INP} type="date" value={newQuote.quote_valid_until} onChange={e => setNewQuote(p => ({...p, quote_valid_until: e.target.value}))} /></div>
                      </div>

                      {/* Line items with headers + live totals */}
                      <div style={{ marginBottom: 8 }}>
                        <label style={LBL}>Line Items</label>
                        {/* Column headers */}
                        <div style={{ display:'grid', gridTemplateColumns:'3fr 1fr 1fr 1.2fr 80px 20px', gap:6, marginBottom:3, padding:'0 2px' }}>
                          {['DESCRIPTION','QTY','UOM','UNIT COST','LINE TOTAL',''].map(h=><span key={h} style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</span>)}
                        </div>
                        {newQuote.line_items.map((li, i) => {
                          const lineTotal = (Number(li.quantity)||0) * (Number(li.unit_cost)||0);
                          return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1.2fr 80px 20px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                            <input style={INP} value={li.description} onChange={e => setNewQuote(p => ({...p, line_items: p.line_items.map((x, j) => j===i ? {...x, description: e.target.value} : x)}))} placeholder="e.g. 1&quot; IGU, grey tinted" />
                            <input style={INP} type="number" min="0" value={li.quantity} onChange={e => setNewQuote(p => ({...p, line_items: p.line_items.map((x, j) => j===i ? {...x, quantity: e.target.value} : x)}))} placeholder="1" />
                            <select style={{...INP, cursor:'pointer'}} value={li.unit} onChange={e => setNewQuote(p => ({...p, line_items: p.line_items.map((x, j) => j===i ? {...x, unit: e.target.value} : x)}))}>  
                              <option value="EA">EA</option><option value="LF">LF</option><option value="SF">SF</option><option value="LOT">LOT</option>
                            </select>
                            <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                              <span style={{ position:'absolute', left:8, fontSize:12, color:'#64748b', pointerEvents:'none', fontWeight:600 }}>$</span>
                              <input style={{...INP, paddingLeft:18}} type="number" min="0" step="0.01" value={li.unit_cost} onChange={e => setNewQuote(p => ({...p, line_items: p.line_items.map((x, j) => j===i ? {...x, unit_cost: e.target.value} : x)}))} placeholder="0.00" />
                            </div>
                            <span style={{fontSize:12,fontWeight:700,color:'#0f172a',textAlign:'right',paddingRight:4}}>${lineTotal.toFixed(2)}</span>
                            {newQuote.line_items.length > 1 ? (
                              <button onClick={() => setNewQuote(p => ({...p, line_items: p.line_items.filter((_, j) => j !== i)}))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 0, lineHeight:1 }}>×</button>
                            ) : <span />}
                          </div>
                        );})}
                        {/* Quote total + add button */}
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4, padding:'6px 0 2px' }}>
                          <button onClick={() => setNewQuote(p => ({...p, line_items: [...p.line_items, {description:'', quantity:'1', unit:'EA', unit_cost:''}]}))} style={{ fontSize: 11, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>+ Add Line Item</button>
                          <div style={{fontSize:13,fontWeight:800,color:'#0f172a'}}>
                            Quote Total: ${newQuote.line_items.reduce((s,li)=>s+(Number(li.quantity)||0)*(Number(li.unit_cost)||0),0).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Notes */}
                      <div style={{ marginBottom: 8 }}>
                        <label style={LBL}>Notes</label>
                        <input style={INP} value={newQuote.notes} onChange={e => setNewQuote(p => ({...p, notes: e.target.value}))} placeholder="Optional notes" />
                      </div>

                      {/* Document attachment */}
                      <div style={{ marginBottom: 10 }}>
                        <label style={LBL}>Attach Vendor Quote (PDF)</label>
                        {newQuote.quote_document_url ? (
                          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,padding:'6px 0'}}>
                            <span>📎</span>
                            <a href={newQuote.quote_document_url} target="_blank" rel="noopener noreferrer" style={{color:'#0f766e',fontWeight:600}}>{newQuote.quote_document_name||'Document'}</a>
                            <button onClick={()=>setNewQuote(p=>({...p,quote_document_url:'',quote_document_name:''}))} style={{fontSize:10,color:'#94a3b8',background:'none',border:'none',cursor:'pointer'}}>Remove</button>
                          </div>
                        ) : (
                          <div style={{display:'flex',gap:8,alignItems:'center'}}>
                            <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#475569',fontWeight:600,cursor:'pointer',padding:'6px 10px',borderRadius:7,border:'1px dashed #cbd5e1',background:'#fafafa',whiteSpace:'nowrap'}}>
                              📎 Upload File
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:'none'}} onChange={async e=>{
                                const f=e.target.files?.[0]; if(!f) return;
                                const fd=new FormData(); fd.append('file',f); fd.append('wo_id',safeWo.id); fd.append('procurement_id','pending');
                                try{
                                  const r=await fetch('/api/procurement/upload',{method:'POST',body:fd});
                                  const d=await r.json();
                                  if(d.success) setNewQuote(p=>({...p,quote_document_url:d.file_url,quote_document_name:d.file_name}));
                                }catch(err){console.error('[WODetailPanel] uploadQuoteDoc',err);}
                              }} />
                            </label>
                            <span style={{fontSize:11,color:'#94a3b8'}}>or paste URL</span>
                            <input style={{...INP,flex:1,fontSize:11,padding:'5px 9px'}} placeholder="https://drive.google.com/..." onBlur={async e=>{
                              const url=e.target.value.trim(); if(!url) return;
                              setNewQuote(p=>({...p,quote_document_url:url,quote_document_name:url.split('/').pop()?.split('?')[0]||'Document'}));
                            }} />
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={async () => {
                          if (!newQuote.vendor_name.trim() || newQuote.line_items.every(li => !li.description.trim())) return;
                          try {
                            const qRes = await fetch('/api/procurement', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ wo_id:safeWo.id, vendor_org_id:newQuote.vendor_org_id, vendor_name:newQuote.vendor_name, quote_date:newQuote.quote_date, quote_valid_until:newQuote.quote_valid_until, notes:newQuote.notes, quote_document_url:newQuote.quote_document_url, quote_document_name:newQuote.quote_document_name, line_items:newQuote.line_items }) });
                            const qData = await qRes.json();
                            if (qData.success) {
                              const total = newQuote.line_items.reduce((s, li) => s + ((Number(li.quantity)||0) * (Number(li.unit_cost)||0)), 0);
                              setProcurementOrders(p => [...p, { procurement_id:qData.procurement_id, wo_id:safeWo.id, vendor_org_id:newQuote.vendor_org_id, vendor_name:newQuote.vendor_name, status:'VENDOR_QUOTED', quote_date:newQuote.quote_date, quote_valid_until:newQuote.quote_valid_until, notes:newQuote.notes, quote_document_url:newQuote.quote_document_url, quote_document_name:newQuote.quote_document_name, line_items:newQuote.line_items.map(li => ({...li, line_total:(Number(li.quantity)||0)*(Number(li.unit_cost)||0)})), total_cost:total }]);
                              setNewQuote({ vendor_org_id:'', vendor_name:'', quote_date:new Date().toISOString().slice(0,10), quote_valid_until:'', notes:'', quote_document_url:'', quote_document_name:'', line_items:[{description:'', quantity:'1', unit:'EA', unit_cost:''}] });
                              setVendorSearch('');
                              setShowAddQuote(false);
                            }
                          } catch(err) { console.error('[WODetailPanel] addVendorQuote', err); }
                        }} style={{ flex:2, padding:'8px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#0f766e,#14b8a6)', color:'white', fontSize:13, fontWeight:800, cursor:'pointer' }}>
                          Save Vendor Quote
                        </button>
                        <button onClick={() => { setShowAddQuote(false); setVendorSearch(''); }} style={{ flex:1, padding:'8px', borderRadius:8, border:'1px solid #e2e8f0', background:'white', color:'#64748b', fontSize:13, cursor:'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Vendor order cards */}
                  {procurementOrders.length === 0 && !showAddQuote && (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>No vendor quotes tracked yet.</div>
                  )}
                  {procurementOrders.map(order => {
                    const statusColors: Record<string,{bg:string;color:string}> = {
                      VENDOR_QUOTED: {bg:'#fffbeb',color:'#92400e'},
                      RELEASED: {bg:'#eff6ff',color:'#1d4ed8'},
                      IN_TRANSIT: {bg:'#f0f9ff',color:'#0369a1'},
                      DELIVERED: {bg:'#f0fdf4',color:'#15803d'},
                      INSPECTED_PASS: {bg:'#f0fdf4',color:'#15803d'},
                      INSPECTED_FAIL: {bg:'#fef2f2',color:'#dc2626'},
                      CANCELLED: {bg:'#f8fafc',color:'#94a3b8'},
                    };
                    const sc = statusColors[order.status] || statusColors.VENDOR_QUOTED;
                    const isInspecting = inspectionMode === order.procurement_id;
                    return (
                      <div key={order.procurement_id} style={{background:'white',borderRadius:10,border:'1px solid #e2e8f0',padding:'11px 13px',marginBottom:8}}>
                        {/* Header */}
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                          <div>
                            <div style={{fontWeight:800,fontSize:13,color:'#0f172a'}}>{order.vendor_name||'Unknown Vendor'}</div>
                            <div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>
                              {order.quote_date && `Quoted: ${order.quote_date}`}
                              {order.quote_valid_until && ` · Valid until: ${order.quote_valid_until}`}
                              {order.order_ref && ` · Ref: ${order.order_ref}`}
                            </div>
                          </div>
                          <div style={{display:'flex',gap:6,alignItems:'center'}}>
                            <span style={{fontSize:10,fontWeight:800,padding:'2px 8px',borderRadius:999,background:sc.bg,color:sc.color}}>{order.status.replace(/_/g,' ')}</span>
                            {order.status !== 'CANCELLED' && (
                              <button onClick={async () => {
                                if (!confirm('Cancel this order?')) return;
                                try {
                                  await fetch(`/api/procurement?procurement_id=${order.procurement_id}`, { method:'DELETE' });
                                  setProcurementOrders(p => p.map(o => o.procurement_id===order.procurement_id ? {...o, status:'CANCELLED'} : o));
                                } catch(err) { console.error('[WODetailPanel] cancelOrder', err); }
                              }} style={{background:'none',border:'1px solid #e2e8f0',borderRadius:6,padding:'2px 7px',cursor:'pointer',fontSize:11,color:'#64748b'}}>✕</button>
                            )}
                          </div>
                        </div>

                        {/* Line items table */}
                        <div style={{background:'#fafafa',borderRadius:8,border:'1px solid #f1f5f9',overflow:'hidden',marginBottom:8}}>
                          {order.line_items.map((item: any, i: number) => (
                            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 10px',borderBottom:i<order.line_items.length-1?'1px solid #f1f5f9':'none',fontSize:12}}>
                              <span style={{color:'#0f172a'}}>{item.quantity}{item.unit && item.unit!=='EA' ? ' '+item.unit : ''} × {item.description}</span>
                              <span style={{fontWeight:700,color:'#0f172a'}}>${Number(item.line_total||0).toFixed(2)}</span>
                            </div>
                          ))}
                          <div style={{display:'flex',justifyContent:'space-between',padding:'6px 10px',background:'#f1f5f9',fontWeight:800,fontSize:12}}>
                            <span>Total</span>
                            <span>${order.total_cost.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Document attachment */}
                        <div style={{marginBottom:8}}>
                          {order.quote_document_url ? (
                            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>
                              <span>📎</span>
                              <a href={order.quote_document_url} target="_blank" rel="noopener noreferrer" style={{color:'#0f766e',fontWeight:600,textDecoration:'none'}}>
                                {order.quote_document_name||'View Document'}
                              </a>
                              <span style={{color:'#94a3b8',fontSize:10}}>[View]</span>
                              <label style={{marginLeft:4,fontSize:10,color:'#94a3b8',cursor:'pointer',fontWeight:600}}>
                                Replace
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" style={{display:'none'}} onChange={async e=>{
                                  const f=e.target.files?.[0]; if(!f) return;
                                  const fd=new FormData(); fd.append('file',f); fd.append('procurement_id',order.procurement_id); fd.append('wo_id',safeWo.id);
                                  try{
                                    const r=await fetch('/api/procurement/upload',{method:'POST',body:fd});
                                    const d=await r.json();
                                    if(d.success) setProcurementOrders(p=>p.map(o=>o.procurement_id===order.procurement_id?{...o,quote_document_url:d.file_url,quote_document_name:d.file_name}:o));
                                  }catch(err){console.error('[WODetailPanel] uploadDoc',err);}
                                }} />
                              </label>
                            </div>
                          ) : (
                            <div style={{display:'flex',gap:8,alignItems:'center'}}>
                              <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#0f766e',fontWeight:700,cursor:'pointer',padding:'4px 10px',borderRadius:7,border:'1px dashed #0f766e',background:'white'}}>
                                📎 Attach PDF/Image
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" style={{display:'none'}} onChange={async e=>{
                                  const f=e.target.files?.[0]; if(!f) return;
                                  const fd=new FormData(); fd.append('file',f); fd.append('procurement_id',order.procurement_id); fd.append('wo_id',safeWo.id);
                                  try{
                                    const r=await fetch('/api/procurement/upload',{method:'POST',body:fd});
                                    const d=await r.json();
                                    if(d.success) setProcurementOrders(p=>p.map(o=>o.procurement_id===order.procurement_id?{...o,quote_document_url:d.file_url,quote_document_name:d.file_name}:o));
                                  }catch(err){console.error('[WODetailPanel] uploadDoc',err);}
                                }} />
                              </label>
                              <span style={{fontSize:11,color:'#94a3b8'}}>or</span>
                              <input placeholder="Paste Drive/URL link..." style={{flex:1,fontSize:11,padding:'4px 8px',borderRadius:7,border:'1px solid #e2e8f0',outline:'none'}}
                                onBlur={async e=>{
                                  const url=e.target.value.trim(); if(!url) return;
                                  const name=url.split('/').pop()?.split('?')[0]||'Document';
                                  try{
                                    await fetch('/api/procurement',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({procurement_id:order.procurement_id,quote_document_url:url,quote_document_name:name})});
                                    setProcurementOrders(p=>p.map(o=>o.procurement_id===order.procurement_id?{...o,quote_document_url:url,quote_document_name:name}:o));
                                  }catch(err){console.error('[WODetailPanel] linkDoc',err);}
                                }} />
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{display:'flex',gap:8}}>
                          {order.status==='VENDOR_QUOTED' && (
                            <button onClick={async () => {
                              const method = prompt('Order method?\n1=Online  2=Phone  3=Email  4=On Hand', '1');
                              const methods: Record<string,string> = {'1':'ONLINE','2':'PHONE','3':'EMAIL','4':'ON_HAND'};
                              const orderMethod = methods[method||'1'] || 'ONLINE';
                              const orderRef = prompt('Order confirmation # or reference (optional):') || '';
                              const isOnHand = orderMethod === 'ON_HAND';
                              try {
                                await fetch('/api/procurement', { method:'PATCH', headers:{'Content-Type':'application/json'},
                                  body:JSON.stringify({
                                    procurement_id: order.procurement_id,
                                    status: isOnHand ? 'DELIVERED' : 'RELEASED',
                                    order_method: orderMethod,
                                    order_ref: orderRef,
                                    order_date: new Date().toISOString().slice(0,10),
                                    ...(isOnHand ? {received_date: new Date().toISOString().slice(0,10)} : {}),
                                  })
                                });
                                setProcurementOrders(p => p.map(o => o.procurement_id===order.procurement_id ? {...o, status:isOnHand?'DELIVERED':'RELEASED', order_method:orderMethod, order_ref:orderRef} : o));
                                if (!isOnHand) { try { await onStageChange(safeWo.id, 'materials_ordered'); } catch(e) { console.error('[WODetailPanel] stageChange', e); } }
                              } catch(err) { console.error('[WODetailPanel] releaseOrder', err); }
                            }} style={{padding:'6px 12px',borderRadius:8,border:'1px solid #0f766e',background:'white',color:'#0f766e',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                              ▶ Release Order
                            </button>
                          )}
                          {order.status==='RELEASED' && order.eta_date && new Date(order.eta_date) <= new Date() && (
                            <button onClick={() => { setInspectionMode(order.procurement_id); setInspectionNotes(''); }}
                              style={{padding:'6px 12px',borderRadius:8,border:'1px solid #15803d',background:'white',color:'#15803d',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                              ✅ Mark Received
                            </button>
                          )}
                        </div>

                        {/* Inspection prompt */}
                        {isInspecting && (
                          <div style={{ marginTop:10, background:'#f0fdf4', borderRadius:8, border:'1px solid #bbf7d0', padding:'12px' }}>
                            <div style={{ fontSize:11, fontWeight:800, color:'#15803d', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.07em' }}>Mark as Received - Inspection</div>
                            <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                              {(['PASS','DAMAGED','WRONG_ITEM','SHORT_COUNT'] as const).map(result => (
                                <button key={result} onClick={async () => {
                                  const newStatus = result === 'PASS' ? 'INSPECTED_PASS' : 'INSPECTED_FAIL';
                                  const nowDate = new Date().toISOString().slice(0,10);
                                  try {
                                    await fetch('/api/procurement', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
                                      procurement_id: order.procurement_id,
                                      status: newStatus,
                                      inspection_status: result,
                                      inspection_notes: inspectionNotes,
                                      received_date: nowDate,
                                    })});
                                    setProcurementOrders(p => p.map(x => x.procurement_id===order.procurement_id ? {...x, status:newStatus, inspection_status:result, received_date:nowDate, inspection_notes:inspectionNotes} : x));
                                    setInspectionMode(null);
                                  } catch(err) { console.error('[WODetailPanel] markReceived', err); }
                                }} style={{ padding:'6px 12px', borderRadius:7, border:'1.5px solid', cursor:'pointer', fontSize:11, fontWeight:700,
                                  borderColor: result==='PASS'?'#15803d':result==='DAMAGED'?'#dc2626':'#92400e',
                                  color: result==='PASS'?'#15803d':result==='DAMAGED'?'#dc2626':'#92400e',
                                  background: 'white' }}>
                                  {result==='PASS'?'✅ Pass':result==='DAMAGED'?'⛔ Damaged':result==='WRONG_ITEM'?'❌ Wrong Item':'⚠️ Short Count'}
                                </button>
                              ))}
                            </div>
                            <textarea placeholder="Notes (optional)..." value={inspectionNotes} onChange={e => setInspectionNotes(e.target.value)}
                              style={{ width:'100%', borderRadius:7, border:'1px solid #e2e8f0', padding:'7px 10px', fontSize:12, resize:'none', minHeight:50, boxSizing:'border-box', marginBottom:6 }} />
                            <button onClick={() => setInspectionMode(null)} style={{ fontSize:11, color:'#64748b', background:'none', border:'none', cursor:'pointer' }}>Cancel</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Invoice placeholder */}
                <div style={{ background: '#fafafa', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Invoice</div>
                  {['completed','work_complete','invoiced','paid','closed'].includes(safeWo.status) ? (
                    <div style={{ fontSize: 12, color: '#475569' }}>Ready to invoice. Generate in QuickBooks.</div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Available after field work is complete.</div>
                  )}
                </div>
              </div>

              {/* Invoicing - Dynamic invoice list */}
              {(() => {
                type InvoiceRow = { id: string; type: string; status: string; amount: string; invoice_num: string; date_sent: string; date_paid: string; };
                // Parse invoices_json, fallback to old cols for legacy data
                const rawJson = (draft as Record<string,string>).invoices_json ?? wo.invoices_json ?? '';
                let invoices: InvoiceRow[] = [];
                try { if (rawJson) invoices = JSON.parse(rawJson); } catch {}
                if (invoices.length === 0 && (wo.deposit_status || wo.final_status)) {
                  // Migrate from old columns
                  if (wo.deposit_status) invoices.push({ id:'INV-dep', type:'Deposit', status:wo.deposit_status||'', amount:wo.deposit_amount||'', invoice_num:wo.deposit_invoice_num||'', date_sent:wo.deposit_sent_date||'', date_paid:wo.deposit_paid_date||'' });
                  if (wo.final_status) invoices.push({ id:'INV-fin', type:'Final', status:wo.final_status||'', amount:wo.final_amount||'', invoice_num:wo.final_invoice_num||'', date_sent:wo.final_sent_date||'', date_paid:wo.final_paid_date||'' });
                }

                function saveInvoices(updated: InvoiceRow[]) {
                  update('invoices_json', JSON.stringify(updated));
                }
                function updateRow(id: string, field: keyof InvoiceRow, val: string) {
                  const updated = invoices.map(inv => inv.id === id ? { ...inv, [field]: val } : inv);
                  saveInvoices(updated);
                }
                function addRow() {
                  const newInv: InvoiceRow = { id:`INV-${Date.now()}`, type:'Progress Payment', status:'Pending', amount:'', invoice_num:'', date_sent:'', date_paid:'' };
                  saveInvoices([...invoices, newInv]);
                }
                function deleteRow(id: string) {
                  saveInvoices(invoices.filter(inv => inv.id !== id));
                }

                const TYPE_ICONS: Record<string,string> = { 'Deposit':'💳', 'Progress Payment':'📈', 'Final':'📄', 'Retention Release':'🔐' };

                return (
                  <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                    <div style={{ ...SECTION_TITLE, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span>Invoicing</span>
                      {invoices.length > 0 && (
                        <span style={{ fontSize:11, color:'#64748b', fontWeight:600 }}>
                          Total: ${invoices.reduce((s,i) => s + (parseFloat(i.amount)||0), 0).toLocaleString('en-US',{minimumFractionDigits:2})}
                        </span>
                      )}
                    </div>
                    {invoices.length === 0 && <div style={{ fontSize:13, color:'#94a3b8', marginBottom:12 }}>No invoices added yet.</div>}
                    {invoices.map((inv, idx) => (
                      <div key={inv.id} style={{ marginBottom:12, padding:'12px', borderRadius:12, background:'#f8fafc', border:'1px solid #f1f5f9' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                          <span style={{ fontSize:12, fontWeight:800, color:'#334155' }}>{TYPE_ICONS[inv.type]||'💰'} {inv.type} #{idx+1}</span>
                          <button onClick={() => deleteRow(inv.id)} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:16, padding:'0 4px' }} title="Delete">🗑️</button>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                          <div>
                            <label style={LBL}>Type</label>
                            <select style={INP} value={inv.type} onChange={e=>updateRow(inv.id,'type',e.target.value)}>
                              {['Deposit','Progress Payment','Final','Retention Release'].map(t=><option key={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={LBL}>Status</label>
                            <select style={INP} value={inv.status} onChange={e=>updateRow(inv.id,'status',e.target.value)}>
                              {['Pending','Sent','Paid','Not Required'].map(s=><option key={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={LBL}>Amount ($)</label>
                            <input style={INP} type="number" step="0.01" placeholder="0.00" value={inv.amount} onChange={e=>updateRow(inv.id,'amount',e.target.value)} />
                          </div>
                          <div>
                            <label style={LBL}>Invoice #</label>
                            <input style={INP} placeholder="QBO ref" value={inv.invoice_num} onChange={e=>updateRow(inv.id,'invoice_num',e.target.value)} />
                          </div>
                          {(inv.status==='Sent'||inv.status==='Paid') && <div>
                            <label style={LBL}>Date Sent</label>
                            <input style={INP} type="date" value={inv.date_sent} onChange={e=>updateRow(inv.id,'date_sent',e.target.value)} />
                          </div>}
                          {inv.status==='Paid' && <div>
                            <label style={LBL}>Date Paid</label>
                            <input style={INP} type="date" value={inv.date_paid} onChange={e=>updateRow(inv.id,'date_paid',e.target.value)} />
                          </div>}
                        </div>
                      </div>
                    ))}
                    <button onClick={addRow} style={{ width:'100%', padding:'10px', borderRadius:10, border:'1.5px dashed #0f766e', background:'transparent', color:'#0f766e', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                      + Add Invoice
                    </button>
                  </div>
                );
              })()}

              {/* Notes */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Notes & Comments</div>
                <textarea
                  rows={4}
                  style={{ ...INP, resize: 'none' }}
                  value={draft.comments || ''}
                  onChange={e => update('comments', e.target.value)}
                  placeholder="Internal notes, follow-ups, customer requests..."
                />
              </div>

              {/* QBO Invoice */}
              {wo.qbo_invoice_id && (
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                  <div style={SECTION_TITLE}>Invoice</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{(() => { const raw = wo.invoice_number || wo.qbo_invoice_id || ''; return /^\d{4}-\d{2}-\d{2}T/.test(raw) ? `(Draft - ${new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : raw ? `#${raw}` : ''; })()}</div>
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
                        {(() => { const t = parseFloat(wo.invoice_total || ''); return isNaN(t) ? '—' : `$${t.toLocaleString('en-US', { minimumFractionDigits: 2 })}`; })()}
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
                      <div style={{ fontSize: 12, color: '#475569' }}>{wo.invoice_date || '-'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Job Files - Work Breakdown moved to top of layout */}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 'calc(92vh - 80px)' }}>

              {/* Work Breakdown - first thing in right column */}
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

              {/* Activity Timeline - below Work Breakdown */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Activity Timeline</div>
                <ActivityTimeline kID={wo.id} />
              </div>

              {/* Crew Assignment */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Crew Assignment - {woIsland || 'All Islands'}</div>
                {islandCrew.length === 0 ? (
                  <div>
                    <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: 8 }}>No crew found for {wo.island || 'this island'} — type name manually:</div>
                    <input style={{ fontSize: 13, padding: '7px 11px', borderRadius: 9, border: '1px solid #e2e8f0', outline: 'none', width: '100%', boxSizing: 'border-box' as const }}
                      defaultValue={safeWo.assignedTo || ''}
                      placeholder="e.g. Karl Nakamura, Joey Ritthaler"
                      onBlur={e => {
                        const val = e.target.value.trim();
                        setSelectedCrew(val ? val.split(',').map(s=>s.trim()).filter(Boolean) : []);
                        onSave(safeWo.id, { assignedTo: val }).catch(err => console.error('[WODetailPanel] saveAssigned', err));
                      }} />
                  </div>
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

        {/* Bottom save bar - always visible */}
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
              {saving ? 'Saving...' : '✓ Save All Changes'}
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
            <div style={{ fontSize:13, color:'#64748b', marginBottom: safeWo.final_status && safeWo.final_status !== 'Paid' ? 8 : 20 }}>Enter final details before closing {safeWo.name}.</div>
{(() => {
              let invoices: {status:string}[] = [];
              try { if (safeWo.invoices_json) invoices = JSON.parse(safeWo.invoices_json); } catch {}
              // Fallback: check old columns
              if (invoices.length === 0 && safeWo.final_status) invoices = [{ status: safeWo.final_status }];
              const unpaid = invoices.some(i => i.status === 'Pending' || i.status === 'Sent');
              return unpaid ? (
                <div style={{ padding:'10px 12px', background:'#fffbeb', borderRadius:10, border:'1px solid rgba(217,119,6,0.3)', fontSize:12, color:'#92400e', fontWeight:600, marginBottom:16 }}>
                  ⚠️ One or more invoices have not been marked as paid. Close anyway?
                </div>
              ) : null;
            })()}

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
              placeholder="Any final notes for the record..."
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
                {closeSubmitting ? 'Closing...' : '✓ Close Work Order'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Decline WO Modal */}
      {showDeclineModal && (
        <>
          <div onClick={() => setShowDeclineModal(false)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', zIndex:600, backdropFilter:'blur(2px)' }} />
          <div style={{
            position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            zIndex:601, background:'white', borderRadius:20, padding:28, width:420, maxWidth:'90vw',
            boxShadow:'0 24px 80px rgba(15,23,42,0.2)',
          }}>
            <div style={{ fontSize:18, fontWeight:800, color:'#0f172a', marginBottom:6 }}>Mark as Declined</div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>This work order will be removed from the active board. You can view it using "Show Declined."</div>
            <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#64748b', display:'block', marginBottom:6 }}>Reason (optional)</label>
            <textarea
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              placeholder="e.g. Customer went with another contractor..."
              rows={3}
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e8f0', fontSize:13, outline:'none', resize:'none', boxSizing:'border-box', marginBottom:20 }}
            />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowDeclineModal(false)}
                style={{ flex:1, padding:'12px', borderRadius:12, border:'1px solid #e2e8f0', background:'white', color:'#64748b', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleConfirmDecline} disabled={declineSubmitting}
                style={{ flex:2, padding:'12px', borderRadius:12, border:'none',
                  background: declineSubmitting ? '#e2e8f0' : '#dc2626',
                  color: declineSubmitting ? '#94a3b8' : 'white', fontSize:13, fontWeight:800,
                  cursor: declineSubmitting ? 'default' : 'pointer',
                  boxShadow: declineSubmitting ? 'none' : '0 3px 12px rgba(220,38,38,0.3)' }}>
                {declineSubmitting ? 'Declining...' : '✕ Mark Declined'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
