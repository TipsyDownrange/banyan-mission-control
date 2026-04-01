import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const USER = 'sean@kulaglass.com';
const COLORS: Record<string, string> = { '1':'#7986cb','2':'#33b679','3':'#8e24aa','4':'#e67c73','5':'#f6bf26','6':'#f4511e','7':'#039be5','8':'#616161','9':'#3f51b5','10':'#0b8043','11':'#d50000' };

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/calendar.readonly'], USER);
    const cal = google.calendar({ version: 'v3', auth });

    const now = new Date().toISOString();
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const calendarsRes = await cal.calendarList.list();
    const calendars = calendarsRes.data.items || [];
    const allEvents: object[] = [];

    await Promise.all(calendars.map(async calendar => {
      try {
        const res = await cal.events.list({ calendarId: calendar.id!, timeMin: now, timeMax: end, maxResults: 20, singleEvents: true, orderBy: 'startTime' });
        for (const e of res.data.items || []) {
          allEvents.push({
            id: e.id, title: e.summary || '(no title)',
            start: e.start?.dateTime || e.start?.date || '',
            end: e.end?.dateTime || e.end?.date || '',
            location: e.location || '', description: (e.description || '').substring(0, 200),
            calendar: calendar.summary || 'Calendar',
            color: COLORS[calendar.colorId || '9'] || '#3f51b5',
            allDay: !e.start?.dateTime,
          });
        }
      } catch { /* skip */ }
    }));

    allEvents.sort((a, b) => ((a as {start:string}).start < (b as {start:string}).start ? -1 : 1));
    return NextResponse.json({ events: allEvents });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), events: [] }, { status: 500 });
  }
}
