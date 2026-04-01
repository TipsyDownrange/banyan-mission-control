import { NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

const KEY_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json';
const USER = 'sean@kulaglass.com';

const CALENDAR_COLORS: Record<string, string> = {
  '1': '#a4bdfc', '2': '#7ae7bf', '3': '#dbadff', '4': '#ff887c',
  '5': '#fbd75b', '6': '#ffb878', '7': '#46d6db', '8': '#e1e1e1',
  '9': '#5484ed', '10': '#51b749', '11': '#dc2127',
};

export async function GET() {
  try {
    const scriptPath = join(tmpdir(), 'kai_calendar.py');
    const script = `import json, datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build

KEY_FILE = '${KEY_FILE}'
USER = '${USER}'

creds = service_account.Credentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/calendar.readonly']
).with_subject(USER)
cal = build('calendar', 'v3', credentials=creds)

now = datetime.datetime.now(datetime.timezone.utc)
end = now + datetime.timedelta(days=7)

# Get all calendars
calendars = cal.calendarList().list().execute()
events_list = []

for calendar in calendars.get('items', []):
    try:
        events = cal.events().list(
            calendarId=calendar['id'],
            timeMin=now.isoformat(),
            timeMax=end.isoformat(),
            maxResults=20,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        for e in events.get('items', []):
            all_day = 'date' in e.get('start', {}) and 'dateTime' not in e.get('start', {})
            events_list.append({
                'id': e['id'],
                'title': e.get('summary', '(no title)'),
                'start': e['start'].get('dateTime', e['start'].get('date', '')),
                'end': e['end'].get('dateTime', e['end'].get('date', '')),
                'location': e.get('location', ''),
                'description': (e.get('description', '') or '')[:200],
                'calendar': calendar.get('summary', 'Calendar'),
                'color': calendar.get('colorId', '9'),
                'allDay': all_day,
            })
    except Exception:
        pass

events_list.sort(key=lambda x: x['start'])
print(json.dumps({'events': events_list}))
`;
    writeFileSync(scriptPath, script);
    const result = execFileSync('python3', [scriptPath], { timeout: 20000, encoding: 'utf8' });
    unlinkSync(scriptPath);

    const data = JSON.parse(result.trim());
    // Map color IDs to hex
    const events = (data.events || []).map((e: {color: string; [key: string]: unknown}) => ({
      ...e,
      color: CALENDAR_COLORS[e.color] || '#14b8a6',
    }));

    return NextResponse.json({ events });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), events: [] }, { status: 500 });
  }
}
