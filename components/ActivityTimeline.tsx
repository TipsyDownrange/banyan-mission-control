'use client';
import React, { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────

type FieldEvent = {
  event_id: string;
  target_kID: string;
  event_type: string;
  event_occurred_at: string;
  event_recorded_at: string;
  performed_by: string;
  recorded_by: string;
  source_system: string;
  evidence_ref: string;
  evidence_type: string;
  location_group: string;
  unit_reference: string;
  qa_step_code: string;
  qa_status: string;
  issue_category: string;
  severity: string;
  blocking_flag: string;
  assigned_to: string;
  assigned_role: string;
  responsible_party: string;
  auto_flag: string;
  manpower_count: string;
  work_performed: string;
  delays_blockers: string;
  materials_received: string;
  inspections_visitors: string;
  weather_context: string;
  notes: string;
  environment: string;
  source_version: string;
  is_valid: string;
  issue_status: string;
};

// ─── Config ───────────────────────────────────────────────────

const EVENT_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  INSTALL_STEP:      { icon: '✅', color: '#1d4ed8', bg: 'rgba(29,78,216,0.08)',  label: 'Step Complete' },
  FIELD_ISSUE:       { icon: '🚨', color: '#dc2626', bg: 'rgba(220,38,38,0.08)',  label: 'Issue' },
  DAILY_LOG:         { icon: '📋', color: '#15803d', bg: 'rgba(21,128,61,0.08)',  label: 'Daily Report' },
  FIELD_MEASUREMENT: { icon: '📏', color: '#0891b2', bg: 'rgba(8,145,178,0.08)', label: 'Measurement' },
  PHOTO_ONLY:        { icon: '📸', color: '#64748b', bg: 'rgba(100,116,139,0.08)', label: 'Photo' },
  NOTE:              { icon: '📝', color: '#64748b', bg: 'rgba(100,116,139,0.08)', label: 'Note' },
  TM_CAPTURE:        { icon: '⏱️', color: '#92400e', bg: 'rgba(146,64,14,0.08)', label: 'T&M' },
  PUNCH_LIST:        { icon: '🔧', color: '#d97706', bg: 'rgba(217,119,6,0.08)', label: 'Punch List' },
  SITE_VISIT:        { icon: '👁️', color: '#0369a1', bg: 'rgba(3,105,161,0.08)', label: 'Site Visit' },
};

const ISSUE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  OPEN:     { label: 'Open',     color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
  RESOLVED: { label: 'Resolved', color: '#15803d', bg: 'rgba(21,128,61,0.1)' },
  CLOSED:   { label: 'Closed',   color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
};

type TypeFilter = 'ALL' | 'INSTALL_STEP' | 'FIELD_ISSUE' | 'DAILY_LOG' | 'FIELD_MEASUREMENT' | 'PHOTO_ONLY' | 'TM_CAPTURE' | 'PUNCH_LIST';
type DateFilter = 'today' | '7d' | '30d' | 'all';

// ─── Helpers ──────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[d.getDay()];
    const monthName = months[d.getMonth()];
    const date = d.getDate();
    let hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${dayName} ${monthName} ${date} · ${hours}:${mins} ${ampm}`;
  } catch {
    return iso;
  }
}

function getDateBoundary(filter: DateFilter): string | null {
  if (filter === 'all') return null;
  const now = new Date();
  if (filter === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  const days = filter === '7d' ? 7 : 30;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

// ─── Event Card ───────────────────────────────────────────────

function EventCard({ event, onResolved, userMap }: { event: FieldEvent; onResolved: (id: string) => void; userMap: UserMap }) {
  // Resolve user ID to display name
  const resolveUser = (raw: string) => {
    if (!raw) return '';
    return userMap[raw] || userMap[raw.toLowerCase()] || raw;
  };
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);

  const cfg = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.NOTE;

  // For FIELD_ISSUE resolved state — use orange badge
  const isIssueResolved = event.event_type === 'FIELD_ISSUE' && event.issue_status === 'RESOLVED';
  const iconColor = isIssueResolved ? '#d97706' : cfg.color;
  const iconBg = isIssueResolved ? 'rgba(217,119,6,0.1)' : cfg.bg;

  const description = event.event_type === 'DAILY_LOG'
    ? (event.work_performed || event.notes)
    : event.notes;

  const locationPill = [event.location_group, event.unit_reference].filter(Boolean).join(' · ');

  const issueStatus = ISSUE_STATUS_CONFIG[event.issue_status] || null;

  async function handleResolve() {
    if (resolving) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/events/${event.event_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_status: 'RESOLVED' }),
      });
      if (res.ok) {
        onResolved(event.event_id);
      }
    } finally {
      setResolving(false);
    }
  }

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: expanded ? '#fafafa' : 'white',
        borderRadius: 14,
        border: `1.5px solid ${expanded ? iconColor + '44' : iconColor + '22'}`,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: 'pointer',
    }}>
      {/* Top row: icon badge + meta */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Icon badge */}
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, border: `1px solid ${iconColor}22`,
        }}>
          {cfg.icon}
        </div>

        {/* Meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
              color: iconColor, background: iconBg,
              padding: '2px 8px', borderRadius: 999, border: `1px solid ${iconColor}22`,
            }}>
              {cfg.label}
            </span>

            {/* Issue status badge */}
            {event.event_type === 'FIELD_ISSUE' && issueStatus && (
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: issueStatus.color, background: issueStatus.bg,
                padding: '2px 8px', borderRadius: 999, border: `1px solid ${issueStatus.color}33`,
              }}>
                {issueStatus.label}
              </span>
            )}

            {/* Location pill */}
            {locationPill && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#64748b',
                background: '#f1f5f9', padding: '2px 8px', borderRadius: 999,
                border: '1px solid #e2e8f0',
              }}>
                📍 {locationPill}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              {formatTimestamp(event.event_occurred_at)}
            </span>
            {event.performed_by && (
              <>
                <span style={{ fontSize: 10, color: '#cbd5e1' }}>·</span>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>
                  {resolveUser(event.performed_by)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Resolve button for open issues */}
        {event.event_type === 'FIELD_ISSUE' && event.issue_status === 'OPEN' && (
          <button
            onClick={handleResolve}
            disabled={resolving}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 800,
              background: resolving ? '#f1f5f9' : 'rgba(21,128,61,0.1)',
              color: resolving ? '#94a3b8' : '#15803d',
              border: '1px solid rgba(21,128,61,0.2)',
              cursor: resolving ? 'default' : 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}>
            {resolving ? '…' : '✓ Resolve'}
          </button>
        )}
      </div>

      {/* Description */}
      {description && (
        <div>
          <div
            onClick={() => setExpanded(e => !e)}
            style={{
              fontSize: 13, color: '#334155', lineHeight: 1.5,
              cursor: description.length > 120 ? 'pointer' : 'default',
              display: '-webkit-box',
              WebkitLineClamp: expanded ? 'unset' : 2,
              WebkitBoxOrient: 'vertical',
              overflow: expanded ? 'visible' : 'hidden',
            } as React.CSSProperties}
          >
            {description}
          </div>
          {description.length > 120 && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 700, color: '#0369a1', cursor: 'pointer', marginTop: 2 }}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {/* Structured expansion per event type */}
      {expanded && (() => {
        const kv = (label: string, value: string | undefined, badge?: string): React.ReactElement | null => value ? (
          <div key={label} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
            <span style={{ color: '#94a3b8', fontWeight: 600, minWidth: 110 }}>{label}</span>
            {badge
              ? <span style={{ padding: '1px 7px', borderRadius: 999, background: badge === 'HIGH' ? '#fef2f2' : badge === 'LOW' ? '#f0fdfa' : '#fffbeb', color: badge === 'HIGH' ? '#b91c1c' : badge === 'LOW' ? '#0f766e' : '#92400e', fontSize: 11, fontWeight: 800 }}>{value}</span>
              : <span style={{ color: '#0f172a', fontWeight: 600 }}>{value}</span>}
          </div>
        ) : null;

        if (event.event_type === 'FIELD_ISSUE') return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: '#fef2f2', borderRadius: 10, border: '1px solid rgba(220,38,38,0.15)' }}>
            {kv('Severity', event.severity, event.severity)}
            {kv('Blocking', event.blocking_flag === 'TRUE' ? 'Yes — work stopped' : 'No')}
            {kv('Category', event.issue_category)}
            {kv('Responsible', event.responsible_party)}
            {kv('Status', event.issue_status)}
            {event.delays_blockers && kv('Impact', event.delays_blockers)}
          </div>
        );

        if (event.event_type === 'FIELD_MEASUREMENT') {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(event.notes); } catch {}
          const fields = (parsed.fields || {}) as Record<string, string | boolean>;
          return Object.keys(fields).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: 'rgba(8,145,178,0.05)', borderRadius: 10, border: '1px solid rgba(8,145,178,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#0891b2', marginBottom: 4 }}>{String(parsed.system_type || 'Measurement')}</div>
              {Object.entries(fields).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                  <span style={{ color: '#94a3b8', fontWeight: 600, minWidth: 110 }}>{k.replace(/_/g,' ')}</span>
                  <span style={{ color: '#0f172a', fontWeight: 600 }}>{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}</span>
                </div>
              ))}
            </div>
          ) : null;
        }

        if (event.event_type === 'TM_CAPTURE') {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(event.notes); } catch {}
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'rgba(146,64,14,0.05)', borderRadius: 10, border: '1px solid rgba(146,64,14,0.15)' }}>
              {kv('Auth Type', String(parsed.authorization_type || ''))}
              {kv('Authorized By', String(parsed.authorized_by || ''))}
              {kv('Crew', parsed.crew ? String(parsed.crew) + ' workers' : undefined)}
              {kv('Hours Est.', parsed.hours_estimated ? String(parsed.hours_estimated) + 'h' : undefined)}
              {kv('Linked Issue', parsed.triggering_event_id ? String(parsed.triggering_event_id).slice(0, 12) + '…' : undefined)}
            </div>
          );
        }

        if (event.event_type === 'DAILY_LOG') {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(event.notes); } catch { parsed = { raw: event.notes }; }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'rgba(21,128,61,0.05)', borderRadius: 10, border: '1px solid rgba(21,128,61,0.15)' }}>
              {kv('Manpower', event.manpower_count ? event.manpower_count + ' workers' : undefined)}
              {kv('Crew', parsed.crew_on_site ? String(parsed.crew_on_site) : undefined)}
              {kv('Hours', parsed.hours_worked ? String(parsed.hours_worked) + 'h' : undefined)}
              {event.work_performed && kv('Work Performed', event.work_performed)}
              {kv('Work Performed', parsed.work_performed && !event.work_performed ? String(parsed.work_performed) : undefined)}
              {kv('Delays', event.delays_blockers || undefined)}
              {kv('Delay type', parsed.delays && String(parsed.delays) !== 'None' ? String(parsed.delays) : undefined)}
              {kv('Weather', event.weather_context || undefined)}
              {kv('Materials', event.materials_received || undefined)}
            </div>
          );
        }

        if (event.event_type === 'PUNCH_LIST') {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(event.notes); } catch {}
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'rgba(217,119,6,0.05)', borderRadius: 10, border: '1px solid rgba(217,119,6,0.15)' }}>
              {kv('Location', String(parsed.location || event.unit_reference || ''))}
              {kv('Reported By', String(parsed.reported_by || ''))}
              {kv('Responsible', String(parsed.responsible_party || event.responsible_party || ''))}
              {kv('Priority', String(parsed.priority || ''))}
              {kv('Fix Required', parsed.resolution_required ? String(parsed.resolution_required) : undefined)}
              {kv('Status', event.issue_status || 'OPEN')}
            </div>
          );
        }

        return null;
      })()}

      {/* Photo thumbnail */}
      {event.evidence_ref && (
        <a
          href={`https://drive.google.com/file/d/${event.evidence_ref}/view`}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-block', marginTop: 2 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://drive.google.com/thumbnail?id=${event.evidence_ref}&sz=w200`}
            alt="Field photo"
            style={{
              width: 140, height: 90, objectFit: 'cover',
              borderRadius: 8, border: '1px solid #e2e8f0',
              display: 'block',
            }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </a>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

interface ActivityTimelineProps {
  kID: string;
}

type UserMap = Record<string, string>; // user_id or email → display name

export default function ActivityTimeline({ kID }: ActivityTimelineProps) {
  const [events, setEvents] = useState<FieldEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [userMap, setUserMap] = useState<UserMap>({});

  // Load users for name resolution
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(users => {
      const map: UserMap = {};
      if (Array.isArray(users)) {
        users.forEach((u: { user_id: string; name: string; email: string }) => {
          if (u.user_id) map[u.user_id] = u.name;
          if (u.email) map[u.email.toLowerCase()] = u.name;
        });
      }
      setUserMap(map);
    }).catch(() => {});
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = new URL('/api/events', window.location.origin);
      url.searchParams.set('kID', kID);
      url.searchParams.set('limit', '100');

      const boundary = getDateBoundary(dateFilter);
      if (boundary) {
        url.searchParams.set('date_from', boundary);
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [kID, dateFilter]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // When an issue is resolved, patch it in local state
  function handleResolved(eventId: string) {
    setEvents(prev =>
      prev.map(e => e.event_id === eventId ? { ...e, issue_status: 'RESOLVED' } : e)
    );
  }

  // Apply client-side type filter
  const filtered = events.filter(e => {
    if (typeFilter === 'ALL') return true;
    if (typeFilter === 'PHOTO_ONLY') return e.event_type === 'PHOTO_ONLY' || e.event_type === 'NOTE';
    return e.event_type === typeFilter;
  });

  const TYPE_PILLS: { key: TypeFilter; label: string }[] = [
    { key: 'ALL',              label: 'All' },
    { key: 'INSTALL_STEP',     label: 'QA Step' },
    { key: 'FIELD_ISSUE',      label: 'Issue' },
    { key: 'DAILY_LOG',        label: 'Daily Report' },
    { key: 'FIELD_MEASUREMENT', label: 'Measurement' },
    { key: 'PHOTO_ONLY',       label: 'Photo / Note' },
    { key: 'TM_CAPTURE',        label: 'T&M' },
    { key: 'PUNCH_LIST',        label: 'Punch List' },
  ];

  const DATE_PILLS: { key: DateFilter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d',    label: '7 days' },
    { key: '30d',   label: '30 days' },
    { key: 'all',   label: 'All time' },
  ];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {/* Type pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TYPE_PILLS.map(p => {
            const cfg = p.key !== 'ALL' ? (EVENT_CONFIG[p.key] || EVENT_CONFIG.NOTE) : null;
            const active = typeFilter === p.key;
            return (
              <button key={p.key} onClick={() => setTypeFilter(p.key)} style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: active ? `1.5px solid ${cfg?.color || '#0f766e'}` : '1.5px solid #e2e8f0',
                background: active ? `${cfg?.color || '#0f766e'}12` : 'white',
                color: active ? (cfg?.color || '#0f766e') : '#64748b',
                transition: 'all 0.1s',
              }}>
                {cfg ? `${cfg.icon} ` : ''}{p.label}
                {p.key !== 'ALL' && (
                  <span style={{ marginLeft: 4, fontWeight: 800, opacity: 0.7 }}>
                    ({events.filter(e =>
                      p.key === 'PHOTO_ONLY'
                        ? (e.event_type === 'PHOTO_ONLY' || e.event_type === 'NOTE')
                        : e.event_type === p.key
                    ).length})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Date filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {DATE_PILLS.map(p => {
            const active = dateFilter === p.key;
            return (
              <button key={p.key} onClick={() => setDateFilter(p.key)} style={{
                padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                border: active ? '1.5px solid #0f766e' : '1.5px solid #e2e8f0',
                background: active ? 'rgba(15,118,110,0.08)' : 'white',
                color: active ? '#0f766e' : '#94a3b8',
              }}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            border: '2.5px solid rgba(20,184,166,0.2)',
            borderTopColor: '#14b8a6',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading field activity…</div>
        </div>
      ) : error ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#dc2626', fontSize: 13 }}>
          ⚠️ {error}
          <button onClick={loadEvents} style={{ marginLeft: 10, fontSize: 12, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#64748b' }}>
            {events.length === 0
              ? 'No field activity logged for this project yet.'
              : 'No events match the selected filters.'}
          </div>
          {events.length > 0 && (
            <button onClick={() => { setTypeFilter('ALL'); setDateFilter('all'); }}
              style={{ marginTop: 10, fontSize: 12, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 10 }}>
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            {typeFilter !== 'ALL' || dateFilter !== 'all' ? ` (filtered from ${events.length})` : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(event => (
              <EventCard key={event.event_id} event={event} onResolved={handleResolved} userMap={userMap} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
