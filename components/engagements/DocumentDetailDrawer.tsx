'use client';
/**
 * BAN-345 PM-V1.0-F — Document detail drawer (metadata + version history).
 *
 * Reads /api/documents/[id]; allows PATCH of allowed metadata fields and
 * surfaces the supersede action (POST /api/documents/[id]/supersede).
 * Version history is materialized client-side by following the
 * superseded_by_document_id chain; the drawer renders the chain for the
 * current document.
 */

import { useCallback, useEffect, useState } from 'react';
import {
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
  uploaded_at: string;
  notes: string | null;
};

type VersionEntry = { document_id: string; version: number; uploaded_at: string; filename: string; is_current: boolean };

export default function DocumentDetailDrawer({ documentId, onClose, onUpdated }: {
  documentId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editFilename, setEditFilename] = useState('');
  const [editSubkind, setEditSubkind] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editLinkType, setEditLinkType] = useState<'' | DocumentLinkedEntityType>('');
  const [editLinkId, setEditLinkId] = useState('');
  const [editExternal, setEditExternal] = useState(false);
  const [supersedeMode, setSupersedeMode] = useState(false);
  const [supersedeDriveId, setSupersedeDriveId] = useState('');
  const [supersedeFilename, setSupersedeFilename] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchDoc = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/documents/${encodeURIComponent(documentId)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      const document = data.document as DocumentRow;
      setDoc(document);
      setEditFilename(document.filename);
      setEditSubkind(document.subkind ?? '');
      setEditNotes(document.notes ?? '');
      setEditLinkType(document.linked_entity_type ?? '');
      setEditLinkId(document.linked_entity_id ?? '');
      setEditExternal(document.external_visible);

      // Hydrate version history by walking the chain via by-kid (current + superseded).
      if (document.kid) {
        try {
          const lr = await fetch(`/api/documents/by-kid/${encodeURIComponent(document.kid)}?current_only=false`);
          if (lr.ok) {
            const ld = await lr.json();
            const allDocs: DocumentRow[] = ld.items ?? [];
            const chain = buildVersionChain(document, allDocs);
            setVersions(chain);
          }
        } catch {
          // ignore — chain is optional context
        }
      } else {
        setVersions([{ document_id: document.document_id, version: document.version, uploaded_at: document.uploaded_at, filename: document.filename, is_current: document.is_current }]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  const handlePatch = async () => {
    if (!doc) return;
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        filename: editFilename.trim(),
        subkind: editSubkind.trim() || null,
        notes: editNotes.trim() || null,
        external_visible: editExternal,
        linked_entity_type: editLinkType || null,
        linked_entity_id: (editLinkType && editLinkId.trim()) ? editLinkId.trim() : null,
      };
      const r = await fetch(`/api/documents/${encodeURIComponent(doc.document_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      await fetchDoc();
      onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSupersede = async () => {
    if (!doc) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/documents/${encodeURIComponent(doc.document_id)}/supersede`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drive_file_id: supersedeDriveId.trim(),
          filename: supersedeFilename.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      setSupersedeMode(false);
      setSupersedeDriveId('');
      setSupersedeFilename('');
      await fetchDoc();
      onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(20,184,166,0.6)' }}>Document</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>{doc?.filename || 'Loading…'}</div>
            <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.75)', marginTop: 4 }}>
              {doc ? `${doc.kind} · v${doc.version}${doc.is_current ? '' : ' · SUPERSEDED'}` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--bos-color-ink-disabled)' }}>Loading...</div>
          ) : err ? (
            <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#b91c1c', fontSize: 12 }}>{err}</div>
          ) : doc ? (
            <>
              <a href={`https://drive.google.com/file/d/${encodeURIComponent(doc.drive_file_id)}/view`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(15,118,110,0.22)', background: 'rgba(240,253,250,0.96)', color: 'var(--bos-color-brand-primary-deep)', fontSize: 12, fontWeight: 800, textDecoration: 'none', alignSelf: 'flex-start' }}>Open in Drive →</a>

              <section style={cardStyle}>
                <div style={cardHeaderStyle}>Metadata</div>
                <Field label="Filename">
                  <input value={editFilename} onChange={(e) => setEditFilename(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Subkind">
                  <input value={editSubkind} onChange={(e) => setEditSubkind(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Notes">
                  <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} style={{ ...inputStyle, fontFamily: 'inherit' }} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Link type">
                    <select value={editLinkType} onChange={(e) => setEditLinkType(e.target.value as '' | DocumentLinkedEntityType)} style={inputStyle}>
                      <option value="">— None —</option>
                      {DOCUMENT_LINKED_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Link uuid">
                    <input value={editLinkId} onChange={(e) => setEditLinkId(e.target.value)} disabled={!editLinkType} style={{ ...inputStyle, opacity: editLinkType ? 1 : 0.5 }} />
                  </Field>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', fontWeight: 700 }}>
                  <input type="checkbox" checked={editExternal} onChange={(e) => setEditExternal(e.target.checked)} />
                  Visible to Collaboration Portal
                </label>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={handlePatch} disabled={busy} style={primaryButtonStyle}>{busy ? 'Saving…' : 'Save changes'}</button>
                </div>
              </section>

              <section style={cardStyle}>
                <div style={cardHeaderStyle}>Version history</div>
                {versions.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>No history available.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {versions.map((v) => (
                      <li key={v.document_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: v.document_id === doc.document_id ? 'rgba(240,253,250,0.96)' : '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-ink-primary)' }}>v{v.version} — {v.filename}</div>
                          <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)' }}>{new Date(v.uploaded_at).toLocaleString()}</div>
                        </div>
                        {v.is_current && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-brand-primary-deep)' }}>CURRENT</span>}
                      </li>
                    ))}
                  </ul>
                )}

                {doc.is_current && (
                  supersedeMode ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Field label="New version Drive file id">
                        <input value={supersedeDriveId} onChange={(e) => setSupersedeDriveId(e.target.value)} style={inputStyle} />
                      </Field>
                      <Field label="Filename (optional — inherits previous)">
                        <input value={supersedeFilename} onChange={(e) => setSupersedeFilename(e.target.value)} style={inputStyle} />
                      </Field>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" onClick={() => setSupersedeMode(false)} style={cancelButtonStyle}>Cancel</button>
                        <button type="button" onClick={handleSupersede} disabled={busy || !supersedeDriveId.trim()} style={primaryButtonStyle}>{busy ? 'Saving…' : 'Save new version'}</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => setSupersedeMode(true)} style={secondaryButtonStyle}>+ New version</button>
                    </div>
                  )
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function buildVersionChain(current: DocumentRow, all: DocumentRow[]): VersionEntry[] {
  const byId = new Map(all.map((d) => [d.document_id, d]));
  // Walk backwards: find ancestors (rows whose superseded_by_document_id chain
  // leads to `current` via the chain).  Each row only points to its immediate
  // successor, so we reverse-index by superseded_by.
  const ancestorOf = new Map<string, DocumentRow>();
  for (const d of all) {
    if (d.superseded_by_document_id) {
      ancestorOf.set(d.superseded_by_document_id, d);
    }
  }
  const chain: DocumentRow[] = [current];
  let cursor: DocumentRow | undefined = current;
  while (cursor && ancestorOf.has(cursor.document_id)) {
    const prev = ancestorOf.get(cursor.document_id);
    if (!prev) break;
    chain.unshift(prev);
    cursor = prev;
  }
  // Walk forwards: follow superseded_by_document_id pointers.
  cursor = current;
  while (cursor && cursor.superseded_by_document_id) {
    const next = byId.get(cursor.superseded_by_document_id);
    if (!next) break;
    chain.push(next);
    cursor = next;
  }
  return chain.map((d) => ({
    document_id: d.document_id,
    version: d.version,
    uploaded_at: d.uploaded_at,
    filename: d.filename,
    is_current: d.is_current,
  }));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' }}>{label}</span>
      {children}
    </label>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: 32 };
const panelStyle: React.CSSProperties = { width: '100%', maxWidth: 680, background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 60px rgba(15,23,42,0.4)' };
const headerStyle: React.CSSProperties = { background: 'linear-gradient(135deg, #071722, #0c2330)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' };
const closeButtonStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '4px 12px', color: 'var(--bos-color-ink-tertiary)', fontSize: 18, fontWeight: 700, cursor: 'pointer', lineHeight: 1 };
const inputStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', background: 'white' };
const cardStyle: React.CSSProperties = { background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 };
const cardHeaderStyle: React.CSSProperties = { fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' };
const primaryButtonStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--bos-color-brand-primary-deep)', color: 'white', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
const secondaryButtonStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(15,118,110,0.22)', background: 'white', color: 'var(--bos-color-brand-primary-deep)', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
const cancelButtonStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
