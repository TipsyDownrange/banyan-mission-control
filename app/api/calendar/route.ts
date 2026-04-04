import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const COLORS: Record<string, string> = {
  '1':'#7986cb','2':'#33b679','3':'#8e24aa','4':'#e67c73',
  '5':'#f6bf26','6':'#f4511e','7':'#039be5','8':'#616161',
  '9':'#3f51b5','10':'#0b8043','11':'#d50000',
};

// Management view users — all office/PM staff whose calendars matter
const MANAGEMENT_USERS = [
  'sean@kulaglass.com',
  'jody@kulaglass.com',
  'frank@kulaglass.com',
  'kyle@kulaglass.com',
  'jenny@kulaglass.com',
  'joey@kulaglass.com',
  'tia@kulaglass.com',
  'nate@kulaglass.com',
  'karl@kulaglass.com',
];

// Use calendar (write) scope — enables write-back
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar';

// ── GET: fetch events ─────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'personal'; // personal | management
    const user = searchParams.get('user') || 'sean@kulaglass.com';
    const daysAhead = parseInt(searchParams.get('days') || '30');

    const now = new Date().toISOString();
    const end = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

    if (mode === 'management') {
      // Aggregate events from all management users
      const allEvents: object[] = [];

      await Promise.all(MANAGEMENT_USERS.map(async calUser => {
        try {
          const auth = getGoogleAuth([CAL_SCOPE], calUser);
          const cal = google.calendar({ version: 'v3', auth });
          const res = await cal.events.list({
            calendarId: 'primary',
            timeMin: now, timeMax: end,
            maxResults: 50, singleEvents: true, orderBy: 'startTime',
          });
          for (const e of res.data.items || []) {
            if (!e.summary) continue;
            allEvents.push({
              id: `${calUser}:${e.id}`,
              title: e.summary,
              start: e.start?.dateTime || e.start?.date || '',
              end: e.end?.dateTime || e.end?.date || '',
              location: e.location || '',
              description: (e.description || '').substring(0, 200),
              calendar: calUser.split('@')[0],
              calendarOwner: calUser,
              color: userColor(calUser),
              allDay: !e.start?.dateTime,
              googleEventId: e.id,
            });
          }
        } catch { /* user calendar not accessible */ }
      }));

      // Deduplicate: same title + same start time = same meeting
      // Merge attendee names into one card, pick one color
      type RawEvent = {
        id: string; title: string; start: string; end: string;
        location: string; description: string; calendar: string;
        calendarOwner: string; color: string; allDay: boolean; googleEventId: string;
      };

      const deduped = new Map<string, RawEvent & { attendees: string[] }>();
      for (const ev of allEvents as RawEvent[]) {
        // Key: normalize title (lowercase, trimmed) + rounded start time (minute precision)
        const startKey = ev.start.substring(0, 16); // "2026-04-06T09:00"
        const titleKey = ev.title.toLowerCase().trim().replace(/\s+/g, ' ');
        const key = `${titleKey}::${startKey}`;

        if (deduped.has(key)) {
          const existing = deduped.get(key)!;
          const owner = ev.calendar;
          if (!existing.attendees.includes(owner)) {
            existing.attendees.push(owner);
          }
        } else {
          deduped.set(key, { ...ev, attendees: [ev.calendar] });
        }
      }

      const dedupedEvents = Array.from(deduped.values()).map(ev => ({
        ...ev,
        // Show attendee names in the calendar label, keep first owner's color
        calendar: ev.attendees.join(', '),
        calendarOwner: ev.attendees[0] + '@kulaglass.com',
      }));

      dedupedEvents.sort((a, b) => (a.start < b.start ? -1 : 1));
      return NextResponse.json({ events: dedupedEvents, mode: 'management', users: MANAGEMENT_USERS });
    }

    // Personal view
    const auth = getGoogleAuth([CAL_SCOPE], user);
    const cal = google.calendar({ version: 'v3', auth });

    const calendarsRes = await cal.calendarList.list();
    const calendars = calendarsRes.data.items || [];
    const allEvents: object[] = [];

    await Promise.all(calendars.map(async calendar => {
      try {
        const res = await cal.events.list({
          calendarId: calendar.id!, timeMin: now, timeMax: end,
          maxResults: 30, singleEvents: true, orderBy: 'startTime',
        });
        for (const e of res.data.items || []) {
          allEvents.push({
            id: e.id, title: e.summary || '(no title)',
            start: e.start?.dateTime || e.start?.date || '',
            end: e.end?.dateTime || e.end?.date || '',
            location: e.location || '',
            description: (e.description || '').substring(0, 200),
            calendar: calendar.summary || 'Calendar',
            color: COLORS[calendar.colorId || '9'] || '#3f51b5',
            allDay: !e.start?.dateTime,
            googleEventId: e.id,
            calendarId: calendar.id,
          });
        }
      } catch { /* skip */ }
    }));

    allEvents.sort((a, b) => ((a as {start:string}).start < (b as {start:string}).start ? -1 : 1));
    return NextResponse.json({ events: allEvents, mode: 'personal', user });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), events: [] }, { status: 500 });
  }
}

// ── POST: create event ────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user = 'sean@kulaglass.com', calendarId = 'primary', title, start, end, location, description, allDay } = body;

    if (!title || !start) return NextResponse.json({ error: 'title and start required' }, { status: 400 });

    const auth = getGoogleAuth([CAL_SCOPE], user);
    const cal = google.calendar({ version: 'v3', auth });

    const event = await cal.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        location: location || '',
        description: description || '',
        start: allDay ? { date: start.slice(0,10) } : { dateTime: start, timeZone: 'Pacific/Honolulu' },
        end:   allDay ? { date: (end || start).slice(0,10) } : { dateTime: end || start, timeZone: 'Pacific/Honolulu' },
      },
    });

    return NextResponse.json({ ok: true, eventId: event.data.id, htmlLink: event.data.htmlLink });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// ── PATCH: update event ───────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { user = 'sean@kulaglass.com', calendarId = 'primary', eventId, title, start, end, location, description } = body;

    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 });

    const auth = getGoogleAuth([CAL_SCOPE], user);
    const cal = google.calendar({ version: 'v3', auth });

    const patch: Record<string, unknown> = {};
    if (title) patch.summary = title;
    if (start) patch.start = { dateTime: start, timeZone: 'Pacific/Honolulu' };
    if (end)   patch.end   = { dateTime: end,   timeZone: 'Pacific/Honolulu' };
    if (location !== undefined) patch.location = location;
    if (description !== undefined) patch.description = description;

    await cal.events.patch({ calendarId, eventId, requestBody: patch });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// ── DELETE: remove event ──────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const user = searchParams.get('user') || 'sean@kulaglass.com';
    const calendarId = searchParams.get('calendarId') || 'primary';
    const eventId = searchParams.get('eventId') || '';

    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 });

    const auth = getGoogleAuth([CAL_SCOPE], user);
    const cal = google.calendar({ version: 'v3', auth });
    await cal.events.delete({ calendarId, eventId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function userColor(email: string): string {
  const map: Record<string, string> = {
    'sean@kulaglass.com':  '#0369a1',
    'jody@kulaglass.com':  '#0D0D80',
    'frank@kulaglass.com': '#0f766e',
    'kyle@kulaglass.com':  '#4338ca',
    'jenny@kulaglass.com': '#6d28d9',
    'joey@kulaglass.com':  '#92400e',
    'tia@kulaglass.com':   '#0891b2',
    'nate@kulaglass.com':  '#065f46',
    'karl@kulaglass.com':  '#1d4ed8',
  };
  return map[email] || '#64748b';
}
