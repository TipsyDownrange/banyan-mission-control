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
      range: 'Manpower Schedule - MAUI/OUTER ISLAND!A1:ZZ200',
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
    const islands: IslandForecast[] = [];
    let currentIsland = '';
    let currentJobs: ForecastJob[] = [];

    for (let rowIdx = 3; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx] || [];
      const col0 = String(row[0] || '').trim();
      const col1 = String(row[1] || '').trim();

      if (!col0 && !col1) continue;

      // Island header rows (e.g. "MAUI", "OUTER", "OAHU")
      if (['MAUI', 'OUTER', 'OAHU', 'KAUAI', 'HAWAII'].some(isl => col0.toUpperCase().includes(isl)) && !col1) {
        if (currentIsland && currentJobs.length > 0) {
          // Save previous island
        }
        currentIsland = col0.includes('OUTER') ? 'Outer Islands' : col0;
        currentJobs = [];
        continue;
      }

      // Total rows — save as island totals
      if (col0.toUpperCase().includes('TOTAL') || col1.toUpperCase().includes('TOTAL')) {
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

      // Skip PM workload summary rows at bottom
      if (['Frank','Sean','Kyle','Jenny','Joey','Tia','Mark','Frank'].includes(col0)) continue;

      // Job rows — col0 = job number or job name (work orders), col1 = job name
      if (col0 && currentIsland) {
        const weeks = relevantWeeks.map(w => ({
          week_ending: w.label,
          date: w.date,
          men: parseInt(String(row[w.index] || '0')) || 0,
        }));
        const totalMenWeeks = weeks.reduce((s, w) => s + w.men, 0);

        currentJobs.push({
          job_number: col0,
          job_name: col1 || col0,
          pm: String(row[2] || ''),
          notes: String(row[3] || ''),
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
