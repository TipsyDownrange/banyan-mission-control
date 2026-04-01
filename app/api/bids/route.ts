import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const KEY_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json';
const BID_LOG_ID = '18QyNI3JPuUw_nRl2EHSUrlWItOmD8PUlu3fysrwyrcA';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const status = searchParams.get('status') || '';

  try {
    const script = `
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build

creds = service_account.Credentials.from_service_account_file(
    '${KEY_FILE}',
    scopes=['https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/drive.readonly']
)
sheets = build('sheets', 'v4', credentials=creds)
result = sheets.spreadsheets().values().get(
    spreadsheetId='${BID_LOG_ID}',
    range='Bids!A1:Z500'
).execute()
rows = result.get('values', [])
if not rows: print(json.dumps([])); exit()

headers = rows[0]
bids = []
for row in rows[1:${limit + 1}]:
    while len(row) < len(headers):
        row.append('')
    b = dict(zip(headers, row))
    status_filter = '${status}'
    if status_filter and b.get('Status','').lower() != status_filter.lower():
        continue
    bids.append(b)

print(json.dumps(bids))
`;

    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`, {
      timeout: 15000, encoding: 'utf8'
    });

    const bids = JSON.parse(result.trim());
    return NextResponse.json({ bids, total: bids.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), bids: [] }, { status: 500 });
  }
}
