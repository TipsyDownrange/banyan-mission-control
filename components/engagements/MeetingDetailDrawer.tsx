'use client';
/**
 * BAN-343 PM-V1.0-D — Meeting detail drawer with inline summary/topics/
 * decisions editing.  Saves trigger MEETING_SUMMARY_UPDATED on the server.
 */

import { useEffect, useState } from 'react';
import LinkedDocumentsPanel from './LinkedDocumentsPanel';

type AttendeeRow = {
  meeting_attendee_id: string;
  name: string;
  email: string | null;
  organization: string | null;
  role: string | null;
  is_kula_user: boolean;
  kula_user_id: string | null;
  attended: boolean;
};

type MeetingDetail = {
  meeting_id: string;
  engagement_id: string | null;
  title: string;
  meeting_date: string;
  duration_minutes: number | null;
  meeting_type: string | null;
  summary: string | null;
  key_topics: string[];
  decisions_made: string[];
  transcript_drive_file_id: string | null;
  source_recording_url: string | null;
  source_platform: string;
  external_visible: boolean;
  kid: string | null;
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function MeetingDetailDrawer({ meetingId, kID, onClose, onUpdated }: {
  meetingId: string;
  kID?: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState('');
  const [topicsText, setTopicsText] = useState('');
  const [decisionsText, setDecisionsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/meetings/${encodeURIComponent(meetingId)}`)
      .then((r) => r.json())
      .then((j) => {
        setMeeting(j.meeting);
        setAttendees(j.attendees ?? []);
        setSummary(j.meeting?.summary ?? '');
        setTopicsText((j.meeting?.key_topics ?? []).join('\n'));
        setDecisionsText((j.meeting?.decisions_made ?? []).join('\n'));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [meetingId]);

  const saveEdits = async () => {
    if (!meeting) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/meetings/${encodeURIComponent(meeting.meeting_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: summary,
          key_topics: topicsText.split('\n').map((s) => s.trim()).filter(Boolean),
          decisions_made: decisionsText.split('\n').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMeeting({ ...meeting, summary: j.meeting?.summary ?? summary, key_topics: j.meeting?.key_topics ?? [], decisions_made: j.meeting?.decisions_made ?? [] });
      setEditing(false);
      onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 210, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: '#f8fafc', height: '100%', overflowY: 'auto', boxShadow: '-12px 0 32px rgba(15,23,42,0.18)' }}>
        <div style={{ background: 'linear-gradient(135deg, #0c2330, #134e4a)', padding: '18px 22px', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#5eead4', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Meeting</div>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '4px 10px', color: 'white', cursor: 'pointer', fontSize: 12 }}>Close</button>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{loading ? 'Loading...' : meeting?.title ?? 'Not found'}</div>
          {meeting && (
            <div style={{ fontSize: 12, color: '#a7f3d0', marginTop: 4 }}>
              {formatDateTime(meeting.meeting_date)} · {meeting.meeting_type ?? '—'} · {meeting.source_platform}
              {meeting.kid && <> · {meeting.kid}</>}
            </div>
          )}
        </div>

        {loading || !meeting ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--bos-color-ink-disabled)' }}>{loading ? 'Loading meeting...' : (err ?? 'Meeting not found.')}</div>
        ) : (
          <div style={{ padding: 22 }}>
            {err && <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 14 }}>{err}</div>}

            <section style={cardStyle}>
              <div style={sectionHeaderStyle}>
                <span>Summary</span>
                {!editing ? (
                  <button type="button" onClick={() => setEditing(true)} style={smallButtonStyle}>Edit</button>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => { setEditing(false); setSummary(meeting.summary ?? ''); setTopicsText(meeting.key_topics.join('\n')); setDecisionsText(meeting.decisions_made.join('\n')); }} disabled={busy} style={smallButtonStyle}>Cancel</button>
                    <button type="button" onClick={saveEdits} disabled={busy} style={{ ...smallButtonStyle, background: 'var(--bos-color-brand-primary-deep)', color: 'white', borderColor: 'var(--bos-color-brand-primary-deep)' }}>{busy ? 'Saving…' : 'Save'}</button>
                  </div>
                )}
              </div>
              {editing ? (
                <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
              ) : (
                <p style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', margin: 0 }}>{meeting.summary || '—'}</p>
              )}
            </section>

            <section style={cardStyle}>
              <div style={sectionHeaderStyle}><span>Key topics</span></div>
              {editing ? (
                <textarea value={topicsText} onChange={(e) => setTopicsText(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} placeholder="One topic per line" />
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#334155' }}>
                  {meeting.key_topics.length === 0 ? <li style={{ color: 'var(--bos-color-ink-tertiary)', listStyle: 'none', marginLeft: -18 }}>—</li> : meeting.key_topics.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              )}
            </section>

            <section style={cardStyle}>
              <div style={sectionHeaderStyle}><span>Decisions made</span></div>
              {editing ? (
                <textarea value={decisionsText} onChange={(e) => setDecisionsText(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} placeholder="One decision per line" />
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#334155' }}>
                  {meeting.decisions_made.length === 0 ? <li style={{ color: 'var(--bos-color-ink-tertiary)', listStyle: 'none', marginLeft: -18 }}>—</li> : meeting.decisions_made.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              )}
            </section>

            <section style={cardStyle}>
              <div style={sectionHeaderStyle}><span>Attendees ({attendees.length})</span></div>
              {attendees.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>No attendees recorded.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {attendees.map((a) => (
                    <div key={a.meeting_attendee_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, background: '#f8fafc', border: '1px solid var(--color-surface-border)' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: a.is_kula_user ? '#dbeafe' : '#f1f5f9', color: a.is_kula_user ? '#1d4ed8' : '#475569' }}>{a.is_kula_user ? 'KULA' : 'EXT'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)' }}>{[a.role, a.organization].filter(Boolean).join(' · ') || a.email || '—'}</div>
                      </div>
                      {!a.attended && <span style={{ fontSize: 10, color: '#92400e', background: '#fffbeb', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>NO-SHOW</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={cardStyle}>
              <div style={sectionHeaderStyle}><span>Evidence</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                {meeting.transcript_drive_file_id ? (
                  <a href={`https://drive.google.com/file/d/${meeting.transcript_drive_file_id}/view`} target="_blank" rel="noreferrer" style={chipLinkStyle}>Transcript (Drive)</a>
                ) : (
                  <span style={{ ...chipLinkStyle, color: 'var(--bos-color-ink-tertiary)', background: '#f1f5f9' }}>No transcript</span>
                )}
                {meeting.source_recording_url ? (
                  <a href={meeting.source_recording_url} target="_blank" rel="noreferrer" style={chipLinkStyle}>Recording</a>
                ) : (
                  <span style={{ ...chipLinkStyle, color: 'var(--bos-color-ink-tertiary)', background: '#f1f5f9' }}>No recording</span>
                )}
                <span style={{ ...chipLinkStyle, color: '#475569', background: '#f8fafc' }}>Source: {meeting.source_platform}</span>
              </div>
            </section>

            <section style={cardStyle}>
              <LinkedDocumentsPanel
                linkedEntityType="MEETING"
                linkedEntityId={meeting.meeting_id}
                kID={kID ?? meeting.kid ?? null}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: 14, marginBottom: 12 };
const sectionHeaderStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11, fontWeight: 800, color: 'var(--bos-color-brand-primary-deep)', textTransform: 'uppercase', letterSpacing: '0.08em' };
const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-surface-border)', fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const smallButtonStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 8, border: '1px solid var(--color-surface-border)', background: 'white', color: '#475569', fontWeight: 700, fontSize: 11, cursor: 'pointer' };
const chipLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: '#ecfeff', color: '#0e7490', textDecoration: 'none', fontWeight: 700 };
