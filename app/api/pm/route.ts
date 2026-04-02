import { NextResponse } from 'next/server';
import { getSSToken } from '@/lib/gauth';

// Full map: Smartsheet folder name → { budget, co, schedule, submittal } sheet IDs
const PROJECT_SHEETS: Record<string, { budget?: string; co?: string; schedule?: string; submittal?: string }> = {
  'Hokuala':                      { budget: '4610105060315012', co: '6378368865881988', schedule: '8876953691967364', submittal: '8784403741599620' },
  'Makena Beach Club':            { budget: '1779536690630532', co: '5178903447424900', schedule: '3794358462533508', submittal: '2812700737359748' },
  'KS - Olaniu Bldg. B,C,D and E':{ budget: '7374845919580036', co: '7176781355241348', schedule: '216825506779012',  submittal: '8253720782393220' },
  'War Memorial Gym':             { budget: '986708812189572',  co: '4437042318495620', schedule: '3975563212443524', submittal: '1516055620964228' },
  'War Memorial Football Stadium':{ budget: '171820049190788',  co: '1951480013606788', schedule: '7376039277711236', submittal: '5660354461781892' },
  'Kapolei Lot 64':               { budget: '5425994782429060', co: '3174194968743812', schedule: '8852878320947076', submittal: '8175192611180420' },
  '323 KAMANI':                   { budget: '8048837676453764', co: '1473222349377412' },
  'Four Seasons Resort Maile Suites': { budget: '7536097669474180' },
  'Kahului Elementary':           { schedule: '6806373376780164', submittal: '8134130325055364' },
  'Lipoa Dual Hotel':             { budget: '7156622695550852', co: '8842070941716356', schedule: '3945528514531204', submittal: '6007302332043140' },
  'Makawao Public Library':       { budget: '4619753880506244', co: '2044815759855492', schedule: '2669134672252804', submittal: '7887169897058180' },
  'Marriott Waiohai Sales Center':{ budget: '3209787240042372' },
  'Milolii Beach Park':           { budget: '1323207499927428', co: '5007391791730564', schedule: '2394981020946308', submittal: '4791725780324228' },
  'Montage':                      { budget: '3824391021350788', co: '8444614043193220', submittal: '1855620962537348' },
  'South TSA Checkpoint':         { budget: '2470118915264388', co: '5034506448752516', schedule: '7208217364877188', submittal: '4681065000030084' },
  'VA Office':                    { budget: '4774436713484164', co: '6927791581777796', schedule: '508548493561732',  submittal: '7263947934617476' },
  'Velma Santos':                 { budget: '5520860573394820', co: '8067570021492612', submittal: '1193182806468484' },
};

async function fetchSheet(token: string, sheetId: string) {
  const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}?pageSize=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json() as {
    columns?: { id: number; title: string }[];
    rows?: { cells: { columnId: number; value?: unknown; displayValue?: string }[] }[];
  };
  const cols: Record<number, string> = {};
  for (const c of data.columns || []) cols[c.id] = c.title;
  return (data.rows || []).map(row => {
    const r: Record<string, string> = {};
    for (const cell of row.cells) {
      if (cols[cell.columnId]) r[cols[cell.columnId]] = cell.displayValue || String(cell.value ?? '');
    }
    return r;
  }).filter(r => Object.values(r).some(v => v));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectName = searchParams.get('project') || '';
    const tab = searchParams.get('tab') || 'budget'; // budget | co | schedule | submittal

    if (!projectName) {
      // Return list of available projects
      return NextResponse.json({ projects: Object.keys(PROJECT_SHEETS) });
    }

    // Find matching project (fuzzy — match by included words)
    const key = Object.keys(PROJECT_SHEETS).find(k =>
      k.toLowerCase().includes(projectName.toLowerCase()) ||
      projectName.toLowerCase().includes(k.toLowerCase().split(' ')[0])
    );

    if (!key) return NextResponse.json({ error: `No project found matching: ${projectName}`, rows: [] }, { status: 404 });

    const sheets = PROJECT_SHEETS[key];
    const sheetId = sheets[tab as keyof typeof sheets];

    if (!sheetId) return NextResponse.json({ error: `No ${tab} sheet for ${key}`, rows: [], available: Object.keys(sheets) });

    const token = getSSToken();
    const rows = await fetchSheet(token, sheetId);

    return NextResponse.json({ project: key, tab, rows: rows || [], sheetId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, rows: [] }, { status: 500 });
  }
}
