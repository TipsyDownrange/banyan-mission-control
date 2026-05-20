'use client';
/**
 * BAN-343 PM-V1.0-D — Create Meeting wizard (manual entry, v1.0).
 *
 * Auto-population from Read.ai / Otter.ai / Fireflies.ai is deferred to the
 * Connector Framework (ADR-042); this wizard always posts source_platform =
 * MANUAL.
 */

import { useEffect, useState } from 'react';

const MEETING_TYPES = [
  ['PROJECT_KICKOFF', 'Project kickoff'],
  ['OAC', 'OAC'],
  ['DESIGN_REVIEW', 'Design review'],
  ['CONSTRUCTION_PROGRESS', 'Construction progress'],
  ['PRECON', 'Precon'],
  ['PRE_INSTALL', 'Pre-install'],
  ['PUNCHWALK', 'Punchwalk'],
  ['PROJECT_CLOSEOUT', 'Project closeout'],
  ['OTHER', 'Other'],
] as const;

const TITLE_MAX = 200;

type KulaUser = { user_id: string; email: string; name: string | null };

type AttendeeDraft = {
  key: string;
  name: string;
  email: string;
  organization: string;
  role: string;
  is_kula_user: boolean;
  kula_user_id: string | null;
  attended: boolean;
};

let nextKey = 0;
function newAttendee(partial: Partial<AttendeeDraft> = {}): AttendeeDraft {
  nextKey += 1;
  return {
    key: `att-${nextKey}`,
    name: '',
    email: '',
    organization: '',
    role: '',
    is_kula_user: false,
    kula_user_id: null,
    attended: true,
    ...partial,
  };
}

export default function MeetingCreateWizard({ kID, onClose, onCreated }: {
  kID: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingType, setMeetingType] = useState('OAC');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [summary, setSummary] = useState('');
  const [keyTopicsText, setKeyTopicsText] = useState('');
  const [decisionsText, setDecisionsText] = useState('');
  const [transcriptDriveId, setTranscriptDriveId] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [attendees, setAttendees] = useState<AttendeeDraft[]>([]);
  const [kulaUsers, setKulaUsers] = useState<KulaUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : Promise.resolve([])))
      .then((data) => {
        const list = Array.isArray(data) ? data : Array.isArray(data?.users) ? data.users : [];
        setKulaUsers(list.map((u: Record<string, unknown>) => ({
          user_id: String(u.user_id ?? ''),
          email: String(u.email ?? ''),
          name: (u.name as string | null) ?? (u.display_name as string | null) ?? null,
        })).filter((u: KulaUser) => u.user_id));
      })
      .catch(() => setKulaUsers([]));
  }, []);

  const titleInvalid = title.length > TITLE_MAX;
  const canSubmit = title.trim().length > 0
    && !titleInvalid
    && meetingDate.length > 0
    && meetingType.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!canSubmit) {
      setErr('Title, meeting date, and meeting type are required.');
      return;
    }
    const attendeePayload = attendees
      .filter((a) => a.name.trim().length > 0)
      .map((a) => ({
        name: a.name.trim(),
        email: a.email.trim() || null,
        organization: a.organization.trim() || null,
        role: a.role.trim() || null,
        is_kula_user: a.is_kula_user,
        // kula_user_id intentionally omitted: /api/users is sourced from the
        // backend Sheet and its user_id values do not yet round-trip to
        // public.users.user_id.  The Connector Framework will populate this
        // link when it lands.  See migration 0023 comment.
        kula_user_id: null,
        attended: a.attended,
      }));
    for (const a of attendeePayload) {
      if (a.is_kula_user && !a.name) {
        setErr('Each Kula attendee must have a name.');
        return;
      }
    }

    setBusy(true);
    try {
      const r = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagement_kid: kID,
          title: title.trim(),
          meeting_date: new Date(meetingDate).toISOString(),
          meeting_type: meetingType,
          duration_minutes: durationMinutes ? Number(durationMinutes) : null,
          summary: summary.trim() || null,
          key_topics: keyTopicsText.split('\n').map((s) => s.trim()).filter(Boolean),
          decisions_made: decisionsText.split('\n').map((s) => s.trim()).filter(Boolean),
          transcript_drive_file_id: transcriptDriveId.trim() || null,
          source_recording_url: recordingUrl.trim() || null,
          source_platform: 'MANUAL',
          attendees: attendeePayload,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const updateAttendee = (key: string, patch: Partial<AttendeeDraft>) => {
    setAttendees((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto' }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 14, padding: 24, maxWidth: 760, width: '94%', margin: '40px 0', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--bos-color-brand-primary-deep)', textTransform: 'uppercase' }}>{kID}</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-ink-primary)', margin: '4px 0 0' }}>Log Meeting</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--bos-color-ink-tertiary)', cursor: 'pointer' }}>x</button>
        </div>

        <label style={fieldStyle}>
          <span style={labelStyle}>Title <span style={{ color: titleInvalid ? 'var(--color-red-700)' : 'var(--bos-color-ink-tertiary)', marginLeft: 6 }}>{title.length}/{TITLE_MAX}</span></span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX + 20} style={{ ...inputStyle, borderColor: titleInvalid ? '#fecaca' : 'var(--color-surface-border)' }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Date & Time</span>
            <input type="datetime-local" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Type</span>
            <select value={meetingType} onChange={(e) => setMeetingType(e.target.value)} style={inputStyle}>
              {MEETING_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Duration (min)</span>
            <input value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
          </label>
        </div>

        <label style={fieldStyle}>
          <span style={labelStyle}>Summary</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Key Topics (one per line)</span>
            <textarea value={keyTopicsText} onChange={(e) => setKeyTopicsText(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Decisions Made (one per line)</span>
            <textarea value={decisionsText} onChange={(e) => setDecisionsText(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Transcript Drive File ID</span>
            <input value={transcriptDriveId} onChange={(e) => setTranscriptDriveId(e.target.value)} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Source Recording URL</span>
            <input value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} style={inputStyle} placeholder="https://..." />
          </label>
        </div>

        <div style={{ border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: 12, marginBottom: 12, background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Attendees ({attendees.length})</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => setAttendees((p) => [...p, newAttendee({ is_kula_user: true })])} style={smallButtonStyle}>+ Kula user</button>
              <button type="button" onClick={() => setAttendees((p) => [...p, newAttendee({ is_kula_user: false })])} style={smallButtonStyle}>+ External</button>
            </div>
          </div>
          {attendees.length === 0 && <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>No attendees added yet.</div>}
          {attendees.map((a) => (
            <div key={a.key} style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 10, padding: 10, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: a.is_kula_user ? '#dbeafe' : '#f1f5f9', color: a.is_kula_user ? '#1d4ed8' : '#475569' }}>
                  {a.is_kula_user ? 'KULA' : 'EXTERNAL'}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ fontSize: 11, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input type="checkbox" checked={a.attended} onChange={(e) => updateAttendee(a.key, { attended: e.target.checked })} /> Attended
                  </label>
                  <button type="button" onClick={() => setAttendees((p) => p.filter((x) => x.key !== a.key))} style={{ ...smallButtonStyle, background: '#fef2f2', color: 'var(--color-red-700)', borderColor: '#fecaca' }}>Remove</button>
                </div>
              </div>
              {a.is_kula_user ? (
                <select
                  value={a.kula_user_id ?? ''}
                  onChange={(e) => {
                    const userId = e.target.value || null;
                    const u = kulaUsers.find((x) => x.user_id === userId);
                    updateAttendee(a.key, {
                      kula_user_id: userId,
                      name: u?.name || u?.email || a.name,
                      email: u?.email || a.email,
                      organization: 'Kula Glass',
                    });
                  }}
                  style={inputStyle}
                >
                  <option value="">Select team member...</option>
                  {kulaUsers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name || u.email}</option>)}
                </select>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input placeholder="Name" value={a.name} onChange={(e) => updateAttendee(a.key, { name: e.target.value })} style={inputStyle} />
                  <input placeholder="Email" value={a.email} onChange={(e) => updateAttendee(a.key, { email: e.target.value })} style={inputStyle} />
                  <input placeholder="Organization" value={a.organization} onChange={(e) => updateAttendee(a.key, { organization: e.target.value })} style={inputStyle} />
                  <input placeholder="Role (e.g., Architect)" value={a.role} onChange={(e) => updateAttendee(a.key, { role: e.target.value })} style={inputStyle} />
                </div>
              )}
            </div>
          ))}
        </div>

        {err && <div style={{ color: 'var(--color-red-700)', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy} style={secondaryButtonStyle}>Cancel</button>
          <button type="submit" disabled={busy || !canSubmit} style={{ ...primaryButtonStyle, background: (busy || !canSubmit) ? 'var(--bos-color-ink-tertiary)' : 'var(--bos-color-brand-primary-deep)' }}>
            {busy ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-surface-border)', fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit' };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' };
const smallButtonStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 8, border: '1px solid var(--color-surface-border)', background: 'white', color: '#475569', fontWeight: 700, fontSize: 11, cursor: 'pointer' };
const secondaryButtonStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 10, border: '1px solid var(--color-surface-border)', background: 'white', color: '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const primaryButtonStyle: React.CSSProperties = { padding: '8px 18px', borderRadius: 10, border: 'none', color: 'white', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
