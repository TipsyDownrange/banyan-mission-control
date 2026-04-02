import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const COST_SHEET_ID = '1EutKs3k0Cp3UwmpmAEDV8FaSSeIklb7Lk7wufRq5YdI';

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const [dailyRes, configRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: COST_SHEET_ID, range: 'Daily!A1:G50' }),
      sheets.spreadsheets.values.get({ spreadsheetId: COST_SHEET_ID, range: 'Config!A2:C10' }),
    ]);

    const rows = dailyRes.data.values || [];
    if (rows.length < 2) return NextResponse.json({ entries: [], totalCost: 0, error: 'No data yet' });

    const dataRows = rows.slice(1); // skip header
    const entries = dataRows.map(r => ({
      date: r[0] || '',
      inputTokens: parseInt(r[1]) || 0,
      outputTokens: parseInt(r[2]) || 0,
      cacheReadTokens: parseInt(r[3]) || 0,
      cacheWriteTokens: parseInt(r[4]) || 0,
      costUsd: parseFloat(r[5]) || 0,
      calls: parseInt(r[6]) || 0,
    }));

    const totalCost = entries.reduce((s, e) => s + e.costUsd, 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayCost = entries.find(e => e.date === today)?.costUsd || 0;
    const totalCalls = entries.reduce((s, e) => s + e.calls, 0);
    const totalInput = entries.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutput = entries.reduce((s, e) => s + e.outputTokens, 0);
    const totalCacheRead = entries.reduce((s, e) => s + e.cacheReadTokens, 0);

    // Parse config for budget settings
    const configRows = configRes.data.values || [];
    const config: Record<string, string> = {};
    for (const r of configRows) { if (r[0] && r[1]) config[r[0]] = r[1]; }
    const dailyBudget = parseFloat(config['daily_budget_usd'] || '50');
    const sessionBudget = parseFloat(config['session_budget_usd'] || '25');

    return NextResponse.json({
      entries,
      totalCost,
      todayCost,
      totalCalls,
      totalInput,
      totalOutput,
      totalCacheRead,
      dailyBudget,
      sessionBudget,
      overBudget: todayCost > dailyBudget,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), entries: [], totalCost: 0 }, { status: 500 });
  }
}
