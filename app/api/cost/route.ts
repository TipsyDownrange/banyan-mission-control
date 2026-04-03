import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const COST_SHEET_ID = '1EutKs3k0Cp3UwmpmAEDV8FaSSeIklb7Lk7wufRq5YdI';

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: COST_SHEET_ID,
      range: 'Daily!A1:G60',
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return NextResponse.json({ entries: [], totalCost: 0, todayCost: 0, error: 'No data yet' });

    const dataRows = rows.slice(1); // skip header
    const entries = dataRows
      .filter(r => r[0])
      .map(r => ({
        date: r[0] || '',
        inputTokens: parseInt(r[1]) || 0,
        outputTokens: parseInt(r[2]) || 0,
        cacheReadTokens: parseInt(r[3]) || 0,
        cacheWriteTokens: parseInt(r[4]) || 0,
        costUsd: parseFloat(r[5]) || 0,
        calls: parseInt(r[6]) || 0,
      }));

    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = entries.find(e => e.date === today);
    const totalCost = entries.reduce((s, e) => s + e.costUsd, 0);
    const totalCalls = entries.reduce((s, e) => s + e.calls, 0);

    return NextResponse.json({
      entries: entries.slice().reverse(), // newest first
      totalCost: Math.round(totalCost * 100) / 100,
      todayCost: todayEntry?.costUsd || 0,
      totalCalls,
      totalInput:  entries.reduce((s, e) => s + e.inputTokens, 0),
      totalOutput: entries.reduce((s, e) => s + e.outputTokens, 0),
      totalCacheRead:  entries.reduce((s, e) => s + e.cacheReadTokens, 0),
      totalCacheWrite: entries.reduce((s, e) => s + e.cacheWriteTokens, 0),
      byModel: {},
      dailyBudget: 50,
      overBudget: (todayEntry?.costUsd || 0) > 50,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, totalCost: 0, todayCost: 0, entries: [] }, { status: 500 });
  }
}
