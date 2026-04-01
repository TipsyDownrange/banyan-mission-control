import { EVENTS, EVENT_TYPE_COLOR } from '@/lib/data';

const TYPE_STYLE: Record<string, { color: string; bg: string }> = {
  DAILY_LOG:    { color: '#1d4ed8', bg: '#eff6ff' },
  INSTALL_STEP: { color: '#0f766e', bg: '#f0fdfa' },
  FIELD_ISSUE:  { color: '#c2410c', bg: '#fff7ed' },
  NOTE:         { color: '#475569', bg: '#f8fafc' },
  PHOTO_ONLY:   { color: '#92400e', bg: '#fffbeb' },
};

export default function EventFeedPanel() {
  return (
    <div style={{ padding: '32px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Operations</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Event Feed</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Activity spine — immutable field record</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {EVENTS.map(e => {
          const st = TYPE_STYLE[e.type] || TYPE_STYLE.NOTE;
          return (
            <div key={e.id} style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 3, borderRadius: 4, background: st.color, alignSelf: 'stretch', flexShrink: 0, minHeight: 32, opacity: 0.7 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: st.color, background: st.bg, padding: '3px 9px', borderRadius: 999 }}>
                      {e.type.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8' }}>{e.id}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>
                    {e.user} <span style={{ color: '#94a3b8', fontWeight: 500 }}>·</span> <span style={{ color: '#64748b', fontWeight: 500 }}>{e.projectName}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 6 }}>{e.note}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{e.timestamp}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
