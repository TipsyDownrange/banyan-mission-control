/**
 * GET /api/scheduling
 * Reads the Manpower Schedule Google Sheet and returns structured forecast data.
 * Sheet: 1099MZ_cGYqNbMKcvoKnwNp0uXnugQPY-jPOpmsJW_wQ
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '1099MZ_cGYqNbMKcvoKnwNp0uXnugQPY-jPOpmsJW_wQ';

export type WeekData = {
  week_ending: string;    // e.g. "WE 04/05/25"
  date: string;           // ISO date of that Friday
  men: number;
};

export type ForecastJob = {
  job_number: string;
  job_name: string;
  pm: string;
  notes: string;
  island: string;
  weeks: WeekData[];
  total_men_weeks: number;
};

export type IslandForecast = {
  island: string;
  jobs: ForecastJob[];
  totals: WeekData[];
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const weeksAhead = parseInt(searchParams.get('weeks') || '12');

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Manpower Schedule - MAUI/OUTER ISLAND!A1:DD200',
    });

    const rows = res.data.values || [];
    if (rows.length < 3) return NextResponse.json({ error: 'Sheet data unavailable' }, { status: 500 });

    // Row 3 (index 2) has headers: Job No | Job Name | PM | Notes | WE MM/DD/YY | WE MM/DD/YY ...
    const headerRow = rows[2] || [];
    const weekCols: { index: number; label: string; date: string }[] = [];

    for (let i = 4; i < headerRow.length; i++) {
      const h = String(headerRow[i] || '');
      if (h.startsWith('WE ')) {
        // Parse "WE 01/04/25" → ISO date
        const parts = h.replace('WE ', '').split('/');
        if (parts.length === 3) {
          const [m, d, y] = parts;
          const isoDate = `20${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
          weekCols.push({ index: i, label: h, date: isoDate });
        }
      }
    }

    // Filter to current + weeksAhead
    const today = new Date();
    const cutoff = new Date(today.getTime() + weeksAhead * 7 * 24 * 60 * 60 * 1000);
    const relevantWeeks = weekCols.filter(w => {
      const d = new Date(w.date);
      return d >= new Date(today.getTime() - 4 * 7 * 24 * 60 * 60 * 1000); // 4 weeks back
    }).slice(0, weeksAhead + 4);

    // Parse rows into island sections
    // Key structure: col0=JobNum, col1=JobName, col2=PM, col3=Notes (or TOTAL label)
    const islands: IslandForecast[] = [];
    let currentIsland = '';
    let currentJobs: ForecastJob[] = [];
    const PM_NAMES = ['Frank','Sean','Kyle','Jenny','Joey','Tia','Mark','Jody','Maatta'];

    for (let rowIdx = 3; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx] || [];
      const col0 = String(row[0] || '').trim();
      const col1 = String(row[1] || '').trim();
      const col2 = String(row[2] || '').trim();
      const col3 = String(row[3] || '').trim();

      // Skip completely empty rows
      if (!col0 && !col1 && !col2 && !col3) continue;

      // Skip PM workload summary rows (col2 = PM name, col3 = number)
      if (!col0 && !col1 && PM_NAMES.includes(col2)) continue;

      // Island header rows: col0 has island name, everything else empty
      const islandKeywords = ['MAUI', 'OUTER', 'OAHU', 'KAUAI', 'HAWAII'];
      if (islandKeywords.some(isl => col0.toUpperCase().includes(isl)) && !col1 && !col2) {
        currentIsland = col0.includes('OUTER') ? 'Outer Islands' : col0.trim();
        currentJobs = [];
        continue;
      }

      // Total rows: col3 contains "TOTAL" (MAUI TOTAL, OUTER ISLAND TOTAL, OAHU TOTAL)
      // OR col0/col1 contains TOTAL
      const allCols = [col0, col1, col2, col3].join(' ').toUpperCase();
      if (allCols.includes('TOTAL') && !col0.match(/^\d{2}-\d{4}/)) {
        const totals = relevantWeeks.map(w => ({
          week_ending: w.label,
          date: w.date,
          men: parseInt(String(row[w.index] || '0')) || 0,
        }));
        if (currentIsland) {
          islands.push({ island: currentIsland, jobs: [...currentJobs], totals });
          currentJobs = [];
          currentIsland = '';
        }
        continue;
      }

      // Job rows: either col0 has a job number OR col1 has WORK ORDERS (service)
      // col0 can be empty for WORK ORDERS rows (Joey's service)
      const hasJobNum = col0.match(/^\d{2}-\d{4}/);
      const isWorkOrders = col1.toUpperCase().includes('WORK ORDER') || col0.toUpperCase().includes('WORK ORDER');

      if ((hasJobNum || isWorkOrders) && currentIsland) {
        const weeks = relevantWeeks.map(w => ({
          week_ending: w.label,
          date: w.date,
          men: parseInt(String(row[w.index] || '0')) || 0,
        }));
        const totalMenWeeks = weeks.reduce((s, w) => s + w.men, 0);

        currentJobs.push({
          job_number: col0 || 'WO',
          job_name: col1 || col0,
          pm: col2 || '',
          notes: col3 || '',
          island: currentIsland,
          weeks,
          total_men_weeks: totalMenWeeks,
        });
      }
    }

    // Handle case where last island didn't have a TOTAL row
    if (currentIsland && currentJobs.length > 0) {
      islands.push({ island: currentIsland, jobs: currentJobs, totals: [] });
    }

    // Build weekly totals across ALL islands (the master headcount)
    const masterTotals = relevantWeeks.map(w => {
      const total = islands.reduce((sum, isl) => {
        const islandTotal = isl.totals.find(t => t.date === w.date);
        return sum + (islandTotal?.men || 0);
      }, 0);
      return { week_ending: w.label, date: w.date, men: total };
    });

    return NextResponse.json({
      weeks: relevantWeeks,
      islands,
      master_totals: masterTotals,
      sheet_title: 'Manpower Schedule December 2024-Current',
      last_updated: new Date().toISOString(),
    });

  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/**
 * PATCH /api/scheduling
 * Update the men count for a specific job + week-ending date.
 * Body: { job_number: string, date: string (ISO week-ending), men: number }
 */
export async function PATCH(req: Request) {
  try {
    const { job_number, date, men } = await req.json();
    if (!job_number || !date || men === undefined) {
      return NextResponse.json({ error: 'job_number, date, and men required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Read the full sheet to find the right row and column
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Manpower Schedule - MAUI/OUTER ISLAND!A1:DD200',
    });
    const rows = res.data.values || [];
    if (rows.length < 3) return NextResponse.json({ error: 'Sheet unavailable' }, { status: 500 });

    // Find column index for this date
    const headerRow = rows[2] || [];
    let colIndex = -1;
    for (let i = 4; i < headerRow.length; i++) {
      const h = String(headerRow[i] || '');
      if (h.startsWith('WE ')) {
        const parts = h.replace('WE ', '').split('/');
        if (parts.length === 3) {
          const [m, d, y] = parts;
          const iso = `20${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
          if (iso === date) { colIndex = i; break; }
        }
      }
    }
    if (colIndex === -1) return NextResponse.json({ error: `Week column not found for date ${date}` }, { status: 404 });

    // Find row index for this job number
    let rowIndex = -1;
    for (let r = 3; r < rows.length; r++) {
      const col0 = String(rows[r]?.[0] || '').trim();
      const col1 = String(rows[r]?.[1] || '').trim();
      // Match by job number or "WORK ORDERS" label
      if (col0 === job_number || col0.replace(/\s/g,'') === job_number.replace(/\s/g,'')) {
        rowIndex = r; break;
      }
      if (job_number === 'WO' && (col1.toUpperCase().includes('WORK ORDER') || col0.toUpperCase().includes('WORK ORDER'))) {
        rowIndex = r; break;
      }
    }
    if (rowIndex === -1) return NextResponse.json({ error: `Job ${job_number} not found in sheet` }, { status: 404 });

    // Convert 0-based indices to A1 notation
    // Row: 1-based (rowIndex + 1)
    // Col: 0-based colIndex → letter(s)
    function colToLetter(n: number): string {
      let s = '';
      n += 1; // 1-based
      while (n > 0) {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    }
    const cellRef = `${colToLetter(colIndex)}${rowIndex + 1}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Manpower Schedule - MAUI/OUTER ISLAND!${cellRef}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[men === 0 ? '' : String(men)]] },
    });

    return NextResponse.json({ ok: true, cell: cellRef, job_number, date, men });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
