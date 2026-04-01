import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const KEY_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json';
const BID_LOG_ID = '18QyNI3JPuUw_nRl2EHSUrlWItOmD8PUlu3fysrwyrcA';
const SS_TOKEN = '/Users/kulaglassopenclaw/glasscore/credentials/smartsheet-token.txt';

export async function GET() {
  try {
    const script = `
import json, datetime, requests
from google.oauth2 import service_account
from googleapiclient.discovery import build

today = datetime.date.today().isoformat()
in_3_days = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()

# Get bids due soon from BanyanOS Bid Log
creds = service_account.Credentials.from_service_account_file(
    '${KEY_FILE}',
    scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
)
sheets = build('sheets', 'v4', credentials=creds)
result = sheets.spreadsheets().values().get(
    spreadsheetId='${BID_LOG_ID}',
    range='Bids!A1:Z200'
).execute()
rows = result.get('values', [])
headers = rows[0] if rows else []

bids_due = []
for row in rows[1:]:
    while len(row) < len(headers):
        row.append('')
    b = dict(zip(headers, row))
    due = b.get('Due Date','')
    status = b.get('Status','')
    if due and today <= due <= in_3_days and status not in ['Won','Lost','No Bid','Submitted']:
        bids_due.append({'name': b.get('Job Name',''), 'due': due, 'assigned': b.get('Assigned To',''), 'kID': b.get('kID','')})

# Get active projects from Field Events sheet
token = open('${SS_TOKEN}').read().strip()
r = requests.get('https://api.smartsheet.com/2.0/sheets/1291254537080708?pageSize=5',
    headers={'Authorization': f'Bearer {token}'}, timeout=8)
active_projects = []
if r.ok:
    data = r.json()
    cols = {c['id']: c['title'] for c in data.get('columns',[])}
    for row in data.get('rows',[])[:5]:
        rd = {cols.get(c['columnId'],''): c.get('displayValue',c.get('value','')) for c in row.get('cells',[])}
        if rd.get('Job Name'):
            active_projects.append({'name': rd['Job Name'], 'pm': rd.get('Project Manager',''), 'status': 'Active'})

print(json.dumps({'bids_due': bids_due, 'active_projects': active_projects, 'date': today}))
`;

    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`, {
      timeout: 20000, encoding: 'utf8'
    });

    return NextResponse.json(JSON.parse(result.trim()));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), bids_due: [], active_projects: [] });
  }
}
