'use client';
/**
 * BAN-345 PM-V1.0-F — Upload Document wizard (manual mode, v1.0).
 *
 * Default Kai-optional flow: PM drags doc into Document Hub (or pastes the
 * Drive file id), selects kind from dropdown, optionally tags an entity
 * link, and posts to /api/documents.  Kai-enhanced mode pre-fills these
 * fields without changing the wizard layout (Charter Amendment 2).
 */

import { useState } from 'react';
import {
  DOCUMENT_KINDS,
  DOCUMENT_LINKED_ENTITY_TYPES,
  DOCUMENT_KIND_DEFAULT_LINK,
  type DocumentKind,
  type DocumentLinkedEntityType,
} from '@/lib/pm/documents/types';

const KIND_LABEL: Record<DocumentKind, string> = {
  CONTRACT: 'Contract',
  SHOP_DRAWING: 'Shop Drawing',
  SUBMITTAL_PACKAGE: 'Submittal Package',
  RFI_TRANSMITTAL: 'RFI Transmittal',
  CO_DOCUMENT: 'Change Order Document',
  PAY_APP_PDF: 'Pay Application PDF',
  NOC: 'Notice of Completion',
  LIEN_WAIVER: 'Lien Waiver',
  PUNCH_LIST: 'Punch List',
  WARRANTY_LETTER: 'Warranty Letter',
  AS_BUILT: 'As-Built',
  OM_MANUAL: 'O&M Manual',
  SPEC_BOOK: 'Spec Book',
  PHOTO_PACKAGE: 'Photo Package',
  EMAIL_THREAD: 'Email Thread',
  SCHEDULE_VERSION: 'Schedule Version',
  OTHER: 'Other',
};

const LINKED_LABEL: Record<DocumentLinkedEntityType, string> = {
  SUBMITTAL: 'Submittal',
  RFI: 'RFI',
  CO: 'Change Order',
  PAY_APP: 'Pay App',
  PUNCH_LIST_ITEM: 'Punch List Item',
  VERBAL_AGREEMENT: 'Verbal Agreement',
  MEETING: 'Meeting',
  WARRANTY_CLAIM: 'Warranty Claim',
  SCHEDULE_VERSION: 'Schedule Version',
  SCHEDULE_ACTIVITY: 'Schedule Activity',
  TM_TICKET: 'T&M Ticket',
  EXTERNAL_WAIVER: 'External Waiver',
  FIELD_EVENT: 'Field Event',
  ACTION_ITEM: 'Action Item',
  OTHER: 'Other',
};

export default function DocumentUploadWizard({ kID, onClose, onCreated, presetLink }: {
  kID: string;
  onClose: () => void;
  onCreated: () => void;
  presetLink?: { type: DocumentLinkedEntityType; id: string } | null;
}) {
  const [filename, setFilename] = useState('');
  const [driveFileId, setDriveFileId] = useState('');
  const [kind, setKind] = useState<DocumentKind>('OTHER');
  const [subkind, setSubkind] = useState('');
  const [linkType, setLinkType] = useState<'' | DocumentLinkedEntityType>(presetLink?.type ?? '');
  const [linkId, setLinkId] = useState(presetLink?.id ?? '');
  const [notes, setNotes] = useState('');
  const [externalVisible, setExternalVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleKindChange = (next: DocumentKind) => {
    setKind(next);
    if (!presetLink) {
      const suggested = DOCUMENT_KIND_DEFAULT_LINK[next];
      if (suggested && !linkType) setLinkType(suggested);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        engagement_kid: kID,
        drive_file_id: driveFileId.trim(),
        filename: filename.trim(),
        kind,
        external_visible: externalVisible,
      };
      if (subkind.trim()) body.subkind = subkind.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (linkType && linkId.trim()) {
        body.linked_entity_type = linkType;
        body.linked_entity_id = linkId.trim();
      }

      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <form onSubmit={handleSubmit} style={panelStyle}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(20,184,166,0.6)' }}>Document Hub</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-surface)', marginTop: 4 }}>Upload Document</div>
            <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.75)', marginTop: 4 }}>{kID}</div>
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Filename">
            <input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="e.g. A1.01 Floor Plan Rev 2.pdf" required style={inputStyle} />
          </Field>

          <Field label="Drive file id" hint="Paste the Drive file id (or the part of the share URL after /d/).">
            <input value={driveFileId} onChange={(e) => setDriveFileId(e.target.value)} placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz" required style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Kind">
              <select value={kind} onChange={(e) => handleKindChange(e.target.value as DocumentKind)} style={inputStyle}>
                {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="Subkind" hint="Free-text (e.g. A1.01 Floor Plan).">
              <input value={subkind} onChange={(e) => setSubkind(e.target.value)} style={inputStyle} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Link to entity type">
              <select value={linkType} onChange={(e) => setLinkType(e.target.value as '' | DocumentLinkedEntityType)} style={inputStyle}>
                <option value="">— None —</option>
                {DOCUMENT_LINKED_ENTITY_TYPES.map((t) => <option key={t} value={t}>{LINKED_LABEL[t]}</option>)}
              </select>
            </Field>
            <Field label="Entity uuid" hint="Required if a link type is selected.">
              <input value={linkId} onChange={(e) => setLinkId(e.target.value)} disabled={!linkType} placeholder="00000000-…" style={{ ...inputStyle, opacity: linkType ? 1 : 0.5 }} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: 'inherit' }} />
          </Field>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', fontWeight: 700 }}>
            <input type="checkbox" checked={externalVisible} onChange={(e) => setExternalVisible(e.target.checked)} />
            Visible to external Collaboration Portal users
          </label>

          {err && (
            <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#b91c1c', fontSize: 12 }}>{err}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} disabled={busy} style={cancelButtonStyle}>Cancel</button>
            <button type="submit" disabled={busy} style={primaryButtonStyle}>{busy ? 'Saving…' : 'Save Document'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>{hint}</span>}
    </label>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: 32 };
const panelStyle: React.CSSProperties = { width: '100%', maxWidth: 640, background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 60px rgba(15,23,42,0.4)' };
const headerStyle: React.CSSProperties = { background: 'linear-gradient(135deg, #071722, #0c2330)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' };
const closeButtonStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '4px 12px', color: 'var(--bos-color-ink-tertiary)', fontSize: 18, fontWeight: 700, cursor: 'pointer', lineHeight: 1 };
const inputStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--color-surface-border)', fontSize: 13, outline: 'none', background: 'white' };
const cancelButtonStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid var(--color-surface-border)', background: 'white', color: '#475569', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
const primaryButtonStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--bos-color-brand-primary-deep)', color: 'white', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
