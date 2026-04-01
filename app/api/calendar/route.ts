import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';

const KEY_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json';
const USER = 'sean@kulaglass.com';

const CALENDAR_COLORS: Record<string, string> = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73',
  '5': '#f6bf26', '6': '#f4511e', '7': '#039be5', '8': '#616161',
  '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
};

export async function GET() {
  try {
    const key = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
    const auth = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      subject: USER,
    });

    const cal = google.calendar({ version: 'v3', auth });
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const calendarsRes = await cal.calendarList.list();
    const calendars = calendarsRes.data.items || [];

    const allEvents: object[] = [];
    await Promise.all(calendars.map(async calendar => {
      try {
        const eventsRes = await cal.events.list({
          calendarId: calendar.id!,
          timeMin: now, timeMax: end,
          maxResults: 20, singleEvents: true, orderBy: 'startTime',
        });
        for (const e of eventsRes.data.items || []) {
          const allDay = !e.start?.dateTime;
          allEvents.push({
            id: e.id, title: e.summary || '(no title)',
            start: e.start?.dateTime || e.start?.date || '',
            end: e.end?.dateTime || e.end?.date || '',
            location: e.location || '',
            description: (e.description || '').substring(0, 200),
            calendar: calendar.summary || 'Calendar',
            color: CALENDAR_COLORS[calendar.colorId || '9'] || '#3f51b5',
            allDay,
          });
        }
      } catch { /* skip inaccessible calendars */ }
    }));

    allEvents.sort((a: object, b: object) => {
      const aStart = (a as {start: string}).start;
      const bStart = (b as {start: string}).start;
      return aStart < bStart ? -1 : aStart > bStart ? 1 : 0;
    });

    return NextResponse.json({ events: allEvents });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), events: [] }, { status: 500 });
  }
}
