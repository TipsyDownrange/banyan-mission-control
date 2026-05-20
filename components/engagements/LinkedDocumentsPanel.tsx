'use client';
/**
 * BAN-345 PM-V1.0-F — Cross-trunk "Linked Documents" panel.
 *
 * Renders on every entity's detail drawer.  Reads
 * /api/documents/by-entity/[type]/[id] and surfaces the linked documents
 * plus an "Add document" affordance that opens the DocumentUploadWizard
 * with the link fields pre-filled.
 */

import { useCallback, useEffect, useState } from 'react';
import DocumentUploadWizard from './DocumentUploadWizard';
import type { DocumentKind, DocumentLinkedEntityType } from '@/lib/pm/documents/types';

type DocumentRow = {
  document_id: string;
  drive_file_id: string;
  filename: string;
  kind: DocumentKind;
  subkind: string | null;
  version: number;
  is_current: boolean;
  uploaded_at: string;
};

interface Props {
  linkedEntityType: DocumentLinkedEntityType;
  linkedEntityId: string;
  /**
   * The parent project's kID — required to enable the inline upload action.
   * When absent the panel renders read-only.
   */
  kID?: string | null;
  /** When provided, supplied at mount time to trim noise. */
  compact?: boolean;
}

export default function LinkedDocumentsPanel({ linkedEntityType, linkedEntityId, kID, compact = false }: Props) {
  const [items, setItems] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/documents/by-entity/${encodeURIComponent(linkedEntityType)}/${encodeURIComponent(linkedEntityId)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      setItems(data.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [linkedEntityType, linkedEntityId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' }}>
          Linked Documents ({items.length})
        </div>
        {kID && (
          <button type="button" onClick={() => setShowWizard(true)} style={addBtnStyle}>+ Add</button>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>Loading…</div>
      ) : err ? (
        <div style={{ fontSize: 12, color: 'var(--color-red-700)' }}>{err}</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>No documents linked yet.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it) => (
            <li key={it.document_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.filename}
                  {it.version > 1 && <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginLeft: 6 }}>v{it.version}</span>}
                </div>
                {!compact && (
                  <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)' }}>{it.kind}{it.subkind ? ` · ${it.subkind}` : ''} · {new Date(it.uploaded_at).toLocaleDateString()}</div>
                )}
              </div>
              <a href={`https://drive.google.com/file/d/${encodeURIComponent(it.drive_file_id)}/view`} target="_blank" rel="noreferrer" style={openLinkStyle}>Open</a>
            </li>
          ))}
        </ul>
      )}

      {showWizard && kID && (
        <DocumentUploadWizard
          kID={kID}
          presetLink={{ type: linkedEntityType, id: linkedEntityId }}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); fetchItems(); }}
        />
      )}
    </section>
  );
}

const addBtnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(15,118,110,0.22)', background: 'rgba(240,253,250,0.96)', color: 'var(--bos-color-brand-primary-deep)', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const openLinkStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--bos-color-brand-primary-deep)', textDecoration: 'none', padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(15,118,110,0.22)', background: 'white' };
