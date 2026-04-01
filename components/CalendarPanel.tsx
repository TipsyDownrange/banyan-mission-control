'use client';
import { useEffect, useState } from 'react';

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  calendar: string;
  color: string;
  allDay: boolean;
  description?: string;
};

type DayGroup = { date: string; label: string; isToday: boolean; events: CalEvent[] };

const HOUR_HEIGHT = 60; // px per hour in day view

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getDayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function getHour(iso: string) {
  return new Date(iso).getHours() + new Date(iso).getMinutes() / 60;
}

function getDurationHours(start: string, end: string) {
  return Math.max(0.5, (new Date(end).getTime() - new Date(start).getTime()) / 3600000);
}

export default function CalendarPanel() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'week' | 'agenda'>('agenda');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/calendar')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setEvents(d.events || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  // Group events by date
  const groupedByDay: DayGroup[] = [];
  const dayMap: Record<string, CalEvent[]> = {};
  for (const e of events) {
    const date = e.start.split('T')[0] || e.start.split(' ')[0];
    if (!dayMap[date]) dayMap[date] = [];
    dayMap[date].push(e);
  }
  const today = new Date().toISOString().split('T')[0];
  // Show next 7 days
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    groupedByDay.push({
      date: dateStr,
      label: getDayLabel(dateStr),
      isToday: dateStr === today,
      events: dayMap[dateStr] || [],
    });
  }

  const totalEvents = events.length;
  const todayEvents = dayMap[today]?.length || 0;
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowEvents = dayMap[tomorrowDate.toISOString().split('T')[0]]?.length || 0;

  return (
    <div style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Assistant</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Calendar</h1>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['agenda','week'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '7px 16px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                border: `1px solid ${view === v ? 'rgba(15,118,110,0.3)' : '#e2e8f0'}`,
                background: view === v ? 'rgba(240,253,250,0.96)' : 'white',
                color: view === v ? '#0f766e' : '#64748b', cursor: 'pointer', textTransform: 'capitalize',
              }}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24,
          padding: 18, borderRadius: 24,
          background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
          border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 18px 36px rgba(15,23,42,0.08)' }}>
          {[
            { label: 'Today', value: todayEvents, helper: todayEvents === 0 ? 'Clear day' : `${todayEvents} event${todayEvents > 1 ? 's' : ''}` },
            { label: 'Tomorrow', value: tomorrowEvents, helper: tomorrowEvents === 0 ? 'Clear day' : `${tomorrowEvents} event${tomorrowEvents > 1 ? 's' : ''}` },
            { label: 'This week', value: totalEvents, helper: 'Next 7 days' },
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a' }}>{s.value}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>{s.helper}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ background: 'white', borderRadius: 24, padding: 48, textAlign: 'center', border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading calendar...</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(255,251,235,0.98)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 18, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>Calendar not connected yet</div>
          <div style={{ fontSize: 12, color: '#475569' }}>Add calendar.readonly scope in Google Admin → Domain-wide delegation to enable.</div>
        </div>
      )}

      {/* Agenda view */}
      {!loading && view === 'agenda' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groupedByDay.map(day => (
            <div key={day.date}>
              {/* Day header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: day.events.length > 0 ? 8 : 0 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 16, flexShrink: 0,
                  background: day.isToday ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : 'white',
                  border: day.isToday ? 'none' : '1px solid #e2e8f0',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  boxShadow: day.isToday ? '0 4px 16px rgba(15,118,110,0.3)' : '0 1px 3px rgba(15,23,42,0.06)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: day.isToday ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
                    {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.03em', color: day.isToday ? 'white' : '#0f172a', lineHeight: 1 }}>
                    {new Date(day.date + 'T12:00:00').getDate()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: day.isToday ? 800 : 700, color: day.isToday ? '#0f766e' : '#0f172a' }}>{day.label}</div>
                  {day.events.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>No events</div>}
                </div>
              </div>

              {/* Events for this day */}
              {day.events.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 60 }}>
                  {day.events.map(event => (
                    <div key={event.id}
                      onClick={() => setSelectedDay(selectedDay === event.id ? null : event.id)}
                      style={{
                        display: 'grid', gap: 10, padding: '14px 18px', borderRadius: 20,
                        background: 'rgba(255,255,255,0.98)',
                        border: '1px solid rgba(226,232,240,0.9)',
                        boxShadow: '0 14px 30px rgba(15,23,42,0.06)',
                        position: 'relative', overflow: 'hidden', cursor: 'pointer',
                      }}>
                      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 5, background: event.color || '#14b8a6', borderRadius: '4px 0 0 4px' }} />
                      <div style={{ paddingLeft: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 4 }}>{event.title}</div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                              {!event.allDay && (
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                                  {formatTime(event.start)} – {formatTime(event.end)}
                                </span>
                              )}
                              {event.allDay && <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', background: '#f8fafc', padding: '2px 8px', borderRadius: 999 }}>All day</span>}
                              {event.location && (
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>📍 {event.location}</span>
                              )}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', flexShrink: 0 }}>
                            {event.calendar}
                          </span>
                        </div>
                        {selectedDay === event.id && event.description && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(226,232,240,0.7)', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                            {event.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Week grid view */}
      {!loading && view === 'week' && (
        <div style={{ background: 'white', borderRadius: 24, border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderBottom: '1px solid #f1f5f9' }}>
            <div />
            {groupedByDay.map(day => (
              <div key={day.date} style={{ padding: '12px 8px', textAlign: 'center', background: day.isToday ? 'rgba(240,253,250,0.6)' : 'transparent', borderLeft: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: day.isToday ? '#0f766e' : '#94a3b8' }}>
                  {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: day.isToday ? '#0f766e' : '#0f172a' }}>
                  {new Date(day.date + 'T12:00:00').getDate()}
                </div>
                {day.events.length > 0 && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: day.isToday ? '#0f766e' : '#94a3b8', margin: '4px auto 0' }} />
                )}
              </div>
            ))}
          </div>

          {/* Events in week view — simplified blocks */}
          <div style={{ padding: '12px 0' }}>
            {groupedByDay.every(d => d.events.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '32px', fontSize: 13, color: '#94a3b8' }}>No events this week</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)' }}>
                <div />
                {groupedByDay.map(day => (
                  <div key={day.date} style={{ padding: '4px', borderLeft: '1px solid #f1f5f9', minHeight: 80 }}>
                    {day.events.map(e => (
                      <div key={e.id} style={{ marginBottom: 4, padding: '6px 8px', borderRadius: 10, background: `${e.color || '#14b8a6'}18`, borderLeft: `3px solid ${e.color || '#14b8a6'}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{e.title}</div>
                        {!e.allDay && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{formatTime(e.start)}</div>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
