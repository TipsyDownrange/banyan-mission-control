'use client';
import { useEffect, useState } from 'react';
import { ALL_USERS } from '@/lib/roles';

type FlightData = {
  id: string; subject: string; date: string; flightDate: string | null;
  flightNumber: string | null; passengers: string[];
  route: { from: string; to: string; fromCode: string; toCode: string } | null;
  snippet: string; isForwardFromTia: boolean;
};

// Roles that can see All Staff calendar
const ALL_STAFF_ROLES = ['owner', 'gm', 'pm', 'estimator', 'service_pm', 'sales', 'admin', 'pm_track', 'super'];

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  calendar: string;
  calendarOwner?: string;
  color: string;
  allDay: boolean;
  description?: string;
  googleEventId?: string;
  calendarId?: string;
};

function fmt(iso: string) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); }
  catch { return ''; }
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function isToday(dateStr: string) {
  return new Date().toDateString() === new Date(dateStr).toDateString();
}

function isSameDay(iso: string, date: Date) {
  const d = new Date(iso);
  return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
}

export default function CalendarPanel() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'month' | 'agenda'>('month');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [calMode, setCalMode] = useState<'personal' | 'management'>('personal');
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [flights, setFlights] = useState<FlightData[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState('Sean Daniels');

  // Read current demo user from the page (stored in localStorage for panel-level access)
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('banyan_demo_user') : null;
    if (stored) setCurrentUser(stored);
  }, []);

  const userObj = ALL_USERS.find(u => u.name === currentUser) || ALL_USERS[0];
  const canSeeAllStaff = ALL_STAFF_ROLES.includes(userObj.role);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/calendar?mode=${calMode}&days=30`)
      .then(r => r.json())
      .then(d => { setEvents(d.events || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [calMode]);

  // Load flight data (management only)
  useEffect(() => {
    if (calMode !== 'management' || !canSeeAllStaff) return;
    setFlightsLoading(true);
    fetch('/api/inbox/flights')
      .then(r => r.json())
      .then(d => { setFlights(d.upcoming || []); setFlightsLoading(false); })
      .catch(() => setFlightsLoading(false));
  }, [calMode, canSeeAllStaff]);

  // Build calendar grid
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  function eventsForDay(date: Date) {
    return events.filter(e => isSameDay(e.start, date));
  }

  function selectedDayEvents() {
    if (!selectedDate) return [];
    return eventsForDay(selectedDate).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = new Date();

  // Agenda: next 30 days
  const agendaDays: { date: Date; events: CalEvent[] }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(today.getDate() + i);
    const dayEvents = eventsForDay(d);
    if (dayEvents.length > 0 || i === 0) agendaDays.push({ date: d, events: dayEvents });
  }

  async function createEvent() {
    if (!newTitle || !newDate) return;
    setSavingEvent(true);
    try {
      const start = newStartTime ? `${newDate}T${newStartTime}:00` : newDate;
      const end = newEndTime ? `${newDate}T${newEndTime}:00` : newDate;
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, start, end, allDay: !newStartTime }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowNewEvent(false);
        setNewTitle(''); setNewDate(''); setNewStartTime(''); setNewEndTime('');
        // Refresh
        setLoading(true);
        fetch(`/api/calendar?mode=${calMode}&days=30`).then(r=>r.json()).then(d=>{setEvents(d.events||[]);setLoading(false);});
      } else { alert('Failed: ' + (data.error || 'Unknown')); }
    } catch(e) { alert('Error: ' + e); }
    setSavingEvent(false);
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>Assistant</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Calendar</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Personal / All Staff toggle — All Staff only for non-glazier roles */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setCalMode('personal')}
              style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', border: 'none', background: calMode === 'personal' ? 'white' : 'transparent', color: calMode === 'personal' ? '#0369a1' : '#94a3b8', cursor: 'pointer', boxShadow: calMode === 'personal' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
              My Calendar
            </button>
            {canSeeAllStaff && (
              <button onClick={() => setCalMode('management')}
                style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', border: 'none', background: calMode === 'management' ? 'white' : 'transparent', color: calMode === 'management' ? '#0369a1' : '#94a3b8', cursor: 'pointer', boxShadow: calMode === 'management' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                🏢 All Staff
              </button>
            )}
          </div>
          {/* View toggle */}
          {(['month', 'agenda'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', border: view === v ? '1px solid rgba(3,105,161,0.4)' : '1px solid #e2e8f0', background: view === v ? 'rgba(239,246,255,0.96)' : 'white', color: view === v ? '#0369a1' : '#64748b', cursor: 'pointer' }}>
              {v}
            </button>
          ))}
          {/* Month nav (only in month view) */}
          {view === 'month' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
              <button onClick={() => setCurrentMonth(new Date(year, month - 1))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 14, color: '#64748b' }}>‹</button>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', minWidth: 140, textAlign: 'center' }}>{monthName}</span>
              <button onClick={() => setCurrentMonth(new Date(year, month + 1))}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 14, color: '#64748b' }}>›</button>
              <button onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}
                style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontSize: 11, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>Today</button>
              {calMode === 'personal' && (
                <button onClick={() => setShowNewEvent(true)}
                  style={{ padding: '5px 14px', borderRadius: 8, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                  + New
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', marginBottom: 16 }}>{error}</div>}

      {/* ── Personnel Travel Ticker ── */}
      {calMode === 'management' && canSeeAllStaff && (
        <div style={{ marginBottom: 16 }}>
          {flightsLoading && (
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, color: '#94a3b8' }}>
              Scanning emails for travel…
            </div>
          )}
          {!flightsLoading && flights.length === 0 && (
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0', fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>✈</span> No upcoming flights found in inbox. Tia can forward travel confirmations to Sean and they'll appear here.
            </div>
          )}
          {!flightsLoading && flights.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg,#071722,#0c2330)', borderRadius: 14, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.6)', marginBottom: 10 }}>
                ✈ Personnel Travel — Next 7 Days
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {flights.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Date */}
                    <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 48 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.03em', lineHeight: 1 }}>
                        {f.flightDate ? new Date(f.flightDate + 'T12:00:00').getDate() : '?'}
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(148,163,184,0.6)', textTransform: 'uppercase' }}>
                        {f.flightDate ? new Date(f.flightDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }) : ''}
                      </div>
                    </div>
                    {/* Route */}
                    {f.route && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#14b8a6' }}>{f.route.fromCode}</span>
                        <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)' }}>→</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#14b8a6' }}>{f.route.toCode}</span>
                      </div>
                    )}
                    {/* Passengers */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {f.passengers.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {f.passengers.map(p => (
                            <span key={p} style={{ fontSize: 11, fontWeight: 700, color: '#f8fafc', background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 6, padding: '2px 8px' }}>
                              {p.split(' ')[0]} {p.split(' ').slice(-1)[0]}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', fontStyle: 'italic' }}>
                          {f.subject.substring(0, 50)}
                        </div>
                      )}
                    </div>
                    {/* Flight number */}
                    {f.flightNumber && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.5)', flexShrink: 0 }}>{f.flightNumber}</div>
                    )}
                    {f.isForwardFromTia && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(20,184,166,0.5)', flexShrink: 0 }}>via Tia</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading calendar...</div>
        </div>
      )}

      {!loading && view === 'month' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedDate ? '1fr 320px' : '1fr', gap: 16 }}>
          {/* Month grid */}
          <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #f1f5f9' }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8' }}>{d}</div>
              ))}
            </div>
            {/* Grid cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
              {cells.map((date, i) => {
                if (!date) return <div key={i} style={{ minHeight: 90, borderRight: i % 7 !== 6 ? '1px solid #f8fafc' : 'none', borderBottom: '1px solid #f8fafc', background: '#fafafa' }} />;
                const dayEvents = eventsForDay(date);
                const isTodayCell = isToday(date.toISOString());
                const isSelected = selectedDate?.toDateString() === date.toDateString();
                return (
                  <div key={i} onClick={() => setSelectedDate(date)} style={{ minHeight: 90, padding: '6px 4px', borderRight: i % 7 !== 6 ? '1px solid #f8fafc' : 'none', borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: isSelected ? 'rgba(239,246,255,0.6)' : 'white', transition: 'background 0.1s' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: isTodayCell ? '#0369a1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: isTodayCell ? 900 : 500, color: isTodayCell ? 'white' : date.getMonth() !== month ? '#cbd5e1' : '#0f172a' }}>{date.getDate()}</span>
                      </div>
                    </div>
                    {dayEvents.slice(0, 3).map(ev => (
                      <div key={ev.id} onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                        style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 4, marginBottom: 2, background: ev.color || '#0369a1', color: 'white', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: 'pointer' }}>
                        {calMode === 'management' && ev.calendar && (
                          <span style={{ opacity: 0.7 }}>{ev.calendar.split('@')[0].charAt(0).toUpperCase()} · </span>
                        )}
                        {!ev.allDay && <span style={{ opacity: 0.85 }}>{fmt(ev.start)} </span>}{ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div style={{ fontSize: 9, color: '#94a3b8', paddingLeft: 4 }}>+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day detail panel */}
          {selectedDate && (
            <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', padding: '16px', maxHeight: 600, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8' }}>{selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</div>
                </div>
                <button onClick={() => setSelectedDate(null)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#94a3b8', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              {selectedDayEvents().length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>No events</div>
              ) : (
                selectedDayEvents().map(ev => (
                  <div key={ev.id} style={{ marginBottom: 10, padding: '10 12', borderRadius: 12, background: '#f8fafc', border: `1px solid #e2e8f0`, cursor: 'pointer' }}
                    onClick={() => setSelectedEvent(ev === selectedEvent ? null : ev)}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 999, background: ev.color || '#0369a1', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{ev.title}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {ev.allDay ? 'All day' : `${fmt(ev.start)} – ${fmt(ev.end)}`}
                          {calMode === 'management' && ev.calendarOwner && (
                            <span style={{ marginLeft: 8, fontWeight: 700, color: ev.color || '#64748b' }}>
                              {ev.calendarOwner.split('@')[0]}
                            </span>
                          )}
                        </div>
                        {ev.location && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>📍 {ev.location}</div>}
                        {selectedEvent?.id === ev.id && ev.description && (
                          <div style={{ marginTop: 6, fontSize: 11, color: '#475569', lineHeight: 1.5 }}>{ev.description}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Agenda view */}
      {!loading && view === 'agenda' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agendaDays.map(({ date, events: dayEvts }) => (
            <div key={date.toISOString()}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: isToday(date.toISOString()) ? '#0369a1' : '#94a3b8', marginTop: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                {isToday(date.toISOString()) && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0369a1', flexShrink: 0 }} />}
                {fmtDate(date.toISOString())}
                {isToday(date.toISOString()) && <span style={{ padding: '1px 6px', borderRadius: 999, background: '#0369a1', color: 'white', fontSize: 9, fontWeight: 800 }}>TODAY</span>}
              </div>
              {dayEvts.length === 0 ? (
                <div style={{ padding: '10px 16px', borderRadius: 12, background: '#fafafa', border: '1px dashed #e2e8f0', fontSize: 12, color: '#cbd5e1' }}>No events</div>
              ) : (
                dayEvts.map(ev => (
                  <div key={ev.id} style={{ padding: '10px 16px', borderRadius: 12, background: 'white', border: '1px solid #e2e8f0', marginBottom: 6, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 999, background: ev.color || '#0369a1', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{ev.title}</div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#94a3b8' }}>
                        <span>{ev.allDay ? 'All day' : `${fmt(ev.start)} – ${fmt(ev.end)}`}</span>
                        {ev.location && <span>📍 {ev.location}</span>}
                        <span style={{ color: '#cbd5e1' }}>{ev.calendar}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
          {agendaDays.filter(d => d.events.length > 0).length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', borderRadius: 20, background: 'white', border: '1px solid #e2e8f0', fontSize: 13, color: '#94a3b8' }}>
              No upcoming events in the next 30 days
            </div>
          )}
        </div>
      )}
      {/* New Event Modal */}
      {showNewEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 420, padding: 28, boxShadow: '0 24px 64px rgba(15,23,42,0.15)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 20 }}>New Event</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4, display: 'block' }}>Title *</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Event title..." autoFocus
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4, display: 'block' }}>Date *</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4, display: 'block' }}>Start Time</label>
                  <input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4, display: 'block' }}>End Time</label>
                  <input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Leave time blank to create an all-day event</div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setShowNewEvent(false); setNewTitle(''); setNewDate(''); }}
                style={{ flex: 1, padding: 11, borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={createEvent} disabled={!newTitle || !newDate || savingEvent}
                style={{ flex: 2, padding: 11, borderRadius: 12, background: newTitle && newDate ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0', color: newTitle && newDate ? 'white' : '#94a3b8', border: 'none', fontSize: 13, fontWeight: 700, cursor: newTitle && newDate ? 'pointer' : 'default' }}>
                {savingEvent ? 'Creating...' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
