'use client';
/**
 * BAN-343 PM-V1.0-D — Meeting Log surface.
 *
 * Reads /api/meetings/by-kid/[kid]; rows expose the BAN-339 Contextual
 * Document Surfacing chip strip (transcript, recording, decisions, related,
 * add).  PMs add new meetings via the manual-entry wizard.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import MeetingCreateWizard from './MeetingCreateWizard';
import MeetingDetailDrawer from './MeetingDetailDrawer';

type MeetingRow = {
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
  attendee_count_total: number;
  attendee_count_kula: number;
  attendee_count_external: number;
};

type ApiResponse = {
  kIDFound: boolean;
  items: MeetingRow[];
  summary: {
    total: number;
    by_type: Record<string, number>;
    by_platform: Record<string, number>;
    with_transcript: number;
  };
};

const MEETING_TYPE_LABELS: Record<string, string> = {
  PROJECT_KICKOFF: 'Kickoff',
  OAC: 'OAC',
  DESIGN_REVIEW: 'Design',
  CONSTRUCTION_PROGRESS: 'Progress',
  PRECON: 'Precon',
  PRE_INSTALL: 'Pre-install',
  PUNCHWALK: 'Punchwalk',
  PROJECT_CLOSEOUT: 'Closeout',
  OTHER: 'Other',
};

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function DocChip({ icon, label, active, onClick, href }: { icon: string; label: string; active: boolean; onClick?: () => void; href?: string }) {
  const color = active ? 'var(--bos-color-brand-primary-deep)' : 'var(--bos-color-ink-tertiary)';
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
    fontSize: 10, fontWeight: 700, background: active ? `${color}12` : '#f1f5f9', color,
    border: `1px solid ${color}22`, cursor: active ? 'pointer' : 'default',
    textDecoration: 'none',
  };
  if (href && active) {
    return <a href={href} target="_blank" rel="noreferrer" style={style}>{icon} {label}</a>;
  }
  return (
    <button type="button" disabled={!active} onClick={onClick} style={style}>
      {icon} {label}
    </button>
  );
}

export default function MeetingsTab({ kID }: { kID: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('ALL');
  const [platform, setPlatform] = useState('ALL');
  const [transcriptOnly, setTranscriptOnly] = useState(false);
  const [kulaOnly, setKulaOnly] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/meetings/by-kid/${encodeURIComponent(kID)}`);
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
  }, [kID]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (type !== 'ALL' && it.meeting_type !== type) return false;
      if (platform !== 'ALL' && it.source_platform !== platform) return false;
      if (transcriptOnly && !it.transcript_drive_file_id) return false;
      if (kulaOnly && it.attendee_count_kula === 0) return false;
      if (q) {
        const hay = `${it.title} ${it.summary ?? ''} ${(it.key_topics ?? []).join(' ')} ${(it.decisions_made ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, type, platform, transcriptOnly, kulaOnly]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-disabled)' }}>Loading meetings...</div>;
  }
  if (err) {
    return <div style={{ padding: 24, color: '#b91c1c', background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>Failed to load meetings: {err}</div>;
  }
  if (!data?.kIDFound) {
    return <div style={{ padding: 24, color: 'var(--bos-color-ink-disabled)', background: '#f8fafc', borderRadius: 12, border: '1px solid var(--color-surface-border)' }}>Meeting Log requires this project to be migrated to Postgres.</div>;
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          ['Total', data.summary.total],
          ['With transcript', data.summary.with_transcript],
          ['OAC', data.summary.by_type.OAC ?? 0],
          ['Design reviews', data.summary.by_type.DESIGN_REVIEW ?? 0],
        ].map(([label, value]) => (
          <div key={label} style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-ink-primary)', marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, summary, topics..." style={toolbarInputStyle} />
        <select value={type} onChange={(e) => setType(e.target.value)} style={toolbarSelectStyle}>
          <option value="ALL">All types</option>
          {Object.entries(MEETING_TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={toolbarSelectStyle}>
          <option value="ALL">All sources</option>
          {['MANUAL', 'READ_AI', 'OTTER_AI', 'FIREFLIES_AI', 'OTHER'].map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
        </select>
        <label style={toggleStyle}><input type="checkbox" checked={transcriptOnly} onChange={(e) => setTranscriptOnly(e.target.checked)} /> Has transcript</label>
        <label style={toggleStyle}><input type="checkbox" checked={kulaOnly} onChange={(e) => setKulaOnly(e.target.checked)} /> Kula attended</label>
        <button type="button" onClick={() => setShowWizard(true)} style={{ marginLeft: 'auto', padding: '8px 12px', borderRadius: 10, border: 'none', background: 'var(--bos-color-brand-primary-deep)', color: 'white', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>+ New Meeting</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12 }}>No meetings match the current filters.</div>
        ) : filtered.map((it) => (
          <div key={it.meeting_id} style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }} onClick={() => setOpenMeetingId(it.meeting_id)}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(180px, 1.6fr) 120px 130px 120px', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>{formatDate(it.meeting_date)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.summary || '—'}
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{MEETING_TYPE_LABELS[it.meeting_type ?? ''] ?? '—'}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                {it.attendee_count_total} attendees
                <div style={{ fontSize: 10, color: 'var(--bos-color-ink-disabled)' }}>
                  <span style={{ color: '#1d4ed8' }}>{it.attendee_count_kula} Kula</span> · <span>{it.attendee_count_external} ext.</span>
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', padding: '3px 8px', borderRadius: 999, background: '#f1f5f9', justifySelf: 'start' }}>{it.source_platform.replace(/_/g, ' ')}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
              <DocChip icon="Doc" label="Transcript" active={Boolean(it.transcript_drive_file_id)} href={it.transcript_drive_file_id ? `https://drive.google.com/file/d/${it.transcript_drive_file_id}/view` : undefined} />
              <DocChip icon="Mic" label="Recording" active={Boolean(it.source_recording_url)} href={it.source_recording_url ?? undefined} />
              <DocChip icon="Check" label={`Decisions (${it.decisions_made?.length ?? 0})`} active={(it.decisions_made?.length ?? 0) > 0} onClick={() => setOpenMeetingId(it.meeting_id)} />
              <DocChip icon="Link" label="Related items" active={false} />
              <DocChip icon="+" label="Add" active onClick={() => setOpenMeetingId(it.meeting_id)} />
            </div>
          </div>
        ))}
      </div>

      {showWizard && (
        <MeetingCreateWizard
          kID={kID}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); fetchList(); }}
        />
      )}
      {openMeetingId && (
        <MeetingDetailDrawer
          meetingId={openMeetingId}
          kID={kID}
          onClose={() => setOpenMeetingId(null)}
          onUpdated={fetchList}
        />
      )}
    </div>
  );
}

const toolbarInputStyle: React.CSSProperties = { flex: '1 1 260px', padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--color-surface-border)', fontSize: 13, outline: 'none', background: 'white' };
const toolbarSelectStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-surface-border)', fontSize: 12, background: 'white' };
const toggleStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 9px', borderRadius: 10, border: '1px solid var(--color-surface-border)', background: 'white', fontSize: 12, color: '#475569', fontWeight: 700 };
