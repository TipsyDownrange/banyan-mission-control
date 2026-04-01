'use client';
import { useEffect, useState } from 'react';
import { PROJECTS, ISSUES, BIDS } from '@/lib/data';

type CalEvent = { title: string; time: string; location?: string };
type TodayItem = { id: string; type: 'issue' | 'bid' | 'report' | 'calendar' | 'action'; title: string; detail: string; priority: 'high' | 'medium' | 'low'; tag: string; tagColor: string; tagBg: string };

export default function TodayPanel() {
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [loadingCal, setLoadingCal] = useState(true);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  useEffect(() => {
    // Placeholder — will connect to Google Calendar
    setTimeout(() => {
      setCalEvents([]);
      setLoadingCal(false);
    }, 500);
  }, []);

  const items: TodayItem[] = [
    // Blocking issues
    ...ISSUES.filter(i => i.blocking && i.status === 'OPEN').map(i => ({
      id: i.id, type: 'issue' as const,
      title: `Blocking issue — ${i.kID}`,
      detail: i.description,
      priority: 'high' as const,
      tag: 'Blocking', tagColor: '#b91c1c', tagBg: '#fef2f2',
    })),
    // Bids due soon
    ...BIDS.filter(b => {
      const days = Math.ceil((new Date(b.due).getTime() - Date.now()) / 86400000);
      return days <= 3;
    }).map(b => ({
      id: b.id, type: 'bid' as const,
      title: `Bid due — ${b.name}`,
      detail: `${b.status} · Assigned to ${b.assignedTo} · Due ${b.due}`,
      priority: 'high' as const,
      tag: 'Bid Deadline', tagColor: '#92400e', tagBg: '#fffbeb',
    })),
    // Medium issues
    ...ISSUES.filter(i => !i.blocking && i.status === 'OPEN').map(i => ({
      id: i.id + '-med', type: 'issue' as const,
      title: `Open issue — ${i.kID}`,
      detail: `${i.severity} · ${i.description.substring(0, 80)}`,
      priority: 'medium' as const,
      tag: i.severity, tagColor: '#92400e', tagBg: '#fffbeb',
    })),
    // Daily reports
    {
      id: 'dr-001', type: 'report' as const,
      title: 'Daily reports due at 3:30 PM',
      detail: 'Hokuala Hotel, War Memorial Gym, Makena Beach Club — field leads assigned',
      priority: 'medium' as const,
      tag: 'Daily Report', tagColor: '#1d4ed8', tagBg: '#eff6ff',
    },
  ];

  const high = items.filter(i => i.priority === 'high');
  const medium = items.filter(i => i.priority === 'medium');

  return (
    <div style={{ padding: '32px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Assistant</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Today</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{today}</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24,
        padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Needs action', value: high.length, helper: 'High priority items' },
          { label: 'Watch list', value: medium.length, helper: 'Medium priority items' },
          { label: 'Meetings today', value: calEvents.length, helper: loadingCal ? 'Loading...' : 'From Google Calendar' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      {/* High priority */}
      {high.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 10 }}>Needs Action Now</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {high.map(item => (
              <div key={item.id} style={{ background: 'white', borderRadius: 16, border: '1px solid rgba(239,68,68,0.15)', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '14px 18px', display: 'flex', gap: 12 }}>
                <div style={{ width: 3, borderRadius: 4, background: '#ef4444', flexShrink: 0, alignSelf: 'stretch', minHeight: 32 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: item.tagColor, background: item.tagBg, padding: '2px 8px', borderRadius: 999 }}>{item.tag}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Medium priority */}
      {medium.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>Watch Today</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {medium.map(item => (
              <div key={item.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(15,23,42,0.04)', padding: '14px 18px', display: 'flex', gap: 12 }}>
                <div style={{ width: 3, borderRadius: 4, background: '#f59e0b', flexShrink: 0, alignSelf: 'stretch', minHeight: 28 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: item.tagColor, background: item.tagBg, padding: '2px 8px', borderRadius: 999 }}>{item.tag}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div style={{ background: 'white', borderRadius: 24, border: '1px solid #e2e8f0', padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Clean slate</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Nothing urgent today.</div>
        </div>
      )}
    </div>
  );
}
