'use client';
/**
 * BAN-345 PM-V1.0-F — Document Hub surface (project-scoped).
 *
 * Reads /api/documents/by-kid/[kid]; lists Document Hub entries with kind +
 * linked-entity filtering.  PMs add new documents via the upload wizard
 * (manual mode by default; Kai-enhanced classification is layered on top
 * without changing the row shape — see Charter Amendment 2).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import DocumentUploadWizard from './DocumentUploadWizard';
import DocumentDetailDrawer from './DocumentDetailDrawer';
import {
  DOCUMENT_KINDS,
  DOCUMENT_LINKED_ENTITY_TYPES,
  type DocumentKind,
  type DocumentLinkedEntityType,
} from '@/lib/pm/documents/types';

type DocumentRow = {
  document_id: string;
  engagement_id: string | null;
  kid: string | null;
  drive_file_id: string;
  filename: string;
  kind: DocumentKind;
  subkind: string | null;
  linked_entity_type: DocumentLinkedEntityType | null;
  linked_entity_id: string | null;
  external_visible: boolean;
  version: number;
  superseded_by_document_id: string | null;
  is_current: boolean;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string | null;
};

type ApiResponse = {
  kIDFound: boolean;
  items: DocumentRow[];
  summary: {
    total: number;
    current_count: number;
    linked_count: number;
    by_kind: Record<string, number>;
    by_linked_entity: Record<string, number>;
  };
};

const KIND_LABEL: Record<DocumentKind, string> = {
  CONTRACT: 'Contract',
  SHOP_DRAWING: 'Shop Drawing',
  SUBMITTAL_PACKAGE: 'Submittal',
  RFI_TRANSMITTAL: 'RFI',
  CO_DOCUMENT: 'CO',
  PAY_APP_PDF: 'Pay App',
  NOC: 'NOC',
  LIEN_WAIVER: 'Lien Waiver',
  PUNCH_LIST: 'Punch List',
  WARRANTY_LETTER: 'Warranty',
  AS_BUILT: 'As-Built',
  OM_MANUAL: 'O&M',
  SPEC_BOOK: 'Spec Book',
  PHOTO_PACKAGE: 'Photos',
  EMAIL_THREAD: 'Email',
  SCHEDULE_VERSION: 'Schedule',
  OTHER: 'Other',
};

const LINKED_LABEL: Record<DocumentLinkedEntityType, string> = {
  SUBMITTAL: 'Submittal',
  RFI: 'RFI',
  CO: 'CO',
  PAY_APP: 'Pay App',
  PUNCH_LIST_ITEM: 'Punch Item',
  VERBAL_AGREEMENT: 'Verbal Agreement',
  MEETING: 'Meeting',
  WARRANTY_CLAIM: 'Warranty',
  SCHEDULE_VERSION: 'Schedule Version',
  SCHEDULE_ACTIVITY: 'Schedule Activity',
  TM_TICKET: 'T&M Ticket',
  EXTERNAL_WAIVER: 'External Waiver',
  FIELD_EVENT: 'Field Event',
  ACTION_ITEM: 'Action Item',
  OTHER: 'Other',
};

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DocumentsTab({ kID }: { kID: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | DocumentKind>('ALL');
  const [linkedFilter, setLinkedFilter] = useState<'ALL' | 'ANY' | DocumentLinkedEntityType>('ALL');
  const [includeSuperseded, setIncludeSuperseded] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (!includeSuperseded) params.set('current_only', 'true');
      else params.set('current_only', 'false');
      const r = await fetch(`/api/documents/by-kid/${encodeURIComponent(kID)}?${params.toString()}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      setData(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kID, includeSuperseded]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (kindFilter !== 'ALL' && it.kind !== kindFilter) return false;
      if (linkedFilter === 'ANY' && !it.linked_entity_type) return false;
      if (linkedFilter !== 'ALL' && linkedFilter !== 'ANY' && it.linked_entity_type !== linkedFilter) return false;
      if (q) {
        const hay = `${it.filename} ${it.subkind ?? ''} ${it.notes ?? ''} ${it.kind} ${it.linked_entity_type ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, kindFilter, linkedFilter]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading documents...</div>;
  }
  if (err) {
    return <div style={{ padding: 24, color: '#b91c1c', background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>Failed to load documents: {err}</div>;
  }
  if (!data?.kIDFound) {
    return <div style={{ padding: 24, color: '#64748b', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>Document Hub requires this project to be migrated to Postgres.</div>;
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          ['Total', data.summary.total],
          ['Current', data.summary.current_count],
          ['Linked', data.summary.linked_count],
          ['Contracts', data.summary.by_kind.CONTRACT ?? 0],
          ['Shop Drawings', data.summary.by_kind.SHOP_DRAWING ?? 0],
          ['Submittals', data.summary.by_kind.SUBMITTAL_PACKAGE ?? 0],
        ].map(([label, value]) => (
          <div key={label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search filename, notes..." style={toolbarInputStyle} />
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as 'ALL' | DocumentKind)} style={toolbarSelectStyle}>
          <option value="ALL">All kinds</option>
          {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <select value={linkedFilter} onChange={(e) => setLinkedFilter(e.target.value as 'ALL' | 'ANY' | DocumentLinkedEntityType)} style={toolbarSelectStyle}>
          <option value="ALL">Any link state</option>
          <option value="ANY">Linked (any)</option>
          {DOCUMENT_LINKED_ENTITY_TYPES.map((t) => <option key={t} value={t}>Linked: {LINKED_LABEL[t]}</option>)}
        </select>
        <label style={toggleStyle}>
          <input type="checkbox" checked={includeSuperseded} onChange={(e) => setIncludeSuperseded(e.target.checked)} />
          Include superseded
        </label>
        <button type="button" onClick={() => setShowWizard(true)} style={{ marginLeft: 'auto', padding: '8px 12px', borderRadius: 10, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>+ Upload Document</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', background: 'white', border: '1px solid #e2e8f0', borderRadius: 12 }}>No documents match the current filters.</div>
        ) : filtered.map((it) => (
          <div key={it.document_id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', opacity: it.is_current ? 1 : 0.55 }} onClick={() => setOpenDocumentId(it.document_id)}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(180px, 1.6fr) 130px 140px 90px', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{formatDate(it.uploaded_at)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.filename}
                  {it.version > 1 && <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginLeft: 6 }}>v{it.version}</span>}
                  {!it.is_current && <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', marginLeft: 6 }}>· SUPERSEDED</span>}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.subkind || it.notes || '—'}
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#0f766e', padding: '3px 8px', borderRadius: 999, background: 'rgba(240,253,250,0.96)', border: '1px solid rgba(15,118,110,0.22)', justifySelf: 'start' }}>{KIND_LABEL[it.kind]}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                {it.linked_entity_type ? <span>→ {LINKED_LABEL[it.linked_entity_type]}</span> : <span style={{ color: '#94a3b8' }}>unlinked</span>}
              </div>
              <a href={`https://drive.google.com/file/d/${encodeURIComponent(it.drive_file_id)}/view`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(15,118,110,0.22)', background: 'white', textDecoration: 'none', justifySelf: 'end' }}>Open</a>
            </div>
          </div>
        ))}
      </div>

      {showWizard && (
        <DocumentUploadWizard
          kID={kID}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); fetchList(); }}
        />
      )}
      {openDocumentId && (
        <DocumentDetailDrawer
          documentId={openDocumentId}
          onClose={() => setOpenDocumentId(null)}
          onUpdated={fetchList}
        />
      )}
    </div>
  );
}

const toolbarInputStyle: React.CSSProperties = { flex: '1 1 260px', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', background: 'white' };
const toolbarSelectStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 12, background: 'white' };
const toggleStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 9px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, color: '#475569', fontWeight: 700 };
