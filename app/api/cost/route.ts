/**
 * GET /api/cost
 * Reads from BanyanOS Cost Tracking Google Sheet.
 * Sheet is synced every 5 minutes from OpenClaw sessions.json via sync-cost.py + launchd.
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const COST_SHEET_ID = '1EutKs3k0Cp3UwmpmAEDV8FaSSeIklb7Lk7wufRq5YdI';
const DAILY_BUDGET = 50;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || '';
    const to   = searchParams.get('to')   || '';

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: COST_SHEET_ID,
      range: 'Daily!A1:G200',
    });

    const rows = res.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ entries: [], totalCost: 0, todayCost: 0, error: 'No data yet — sync may not have run' });
    }

    const dataRows = rows.slice(1).filter(r => r[0]);

    const entries = dataRows
      .map(r => ({
        date:             r[0] || '',
        inputTokens:      parseInt(r[1])  || 0,
        outputTokens:     parseInt(r[2])  || 0,
        cacheReadTokens:  parseInt(r[3])  || 0,
        cacheWriteTokens: parseInt(r[4])  || 0,
        costUsd:          parseFloat(r[5]) || 0,
        sessions:         parseInt(r[6])  || 0,
      }))
      .filter(e => {
        if (from && e.date < from) return false;
        if (to   && e.date > to)   return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date)); // newest first

    const today = new Date().toISOString().slice(0, 10);
    const todayEntry  = entries.find(e => e.date === today);
    const totalCost   = entries.reduce((s, e) => s + e.costUsd, 0);
    const totalTokens = entries.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0);
    const totalInput  = entries.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutput = entries.reduce((s, e) => s + e.outputTokens, 0);
    const totalCache  = entries.reduce((s, e) => s + e.cacheReadTokens, 0);
    const totalSessions = entries.reduce((s, e) => s + e.sessions, 0);
    const todayCost   = todayEntry?.costUsd || 0;
    const todayTokens = todayEntry ? todayEntry.inputTokens + todayEntry.outputTokens : 0;

    // Week total
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const weekCost = entries.filter(e => e.date >= weekAgo).reduce((s, e) => s + e.costUsd, 0);

    // Monthly total
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const monthCost = entries.filter(e => e.date >= monthAgo).reduce((s, e) => s + e.costUsd, 0);

    // Projected monthly (based on last 7 days avg)
    const last7Avg = weekCost / 7;
    const projectedMonthly = last7Avg * 30;

    return NextResponse.json({
      entries,
      totalCost:        Math.round(totalCost   * 100) / 100,
      todayCost:        Math.round(todayCost   * 10000) / 10000,
      weekCost:         Math.round(weekCost    * 100) / 100,
      monthCost:        Math.round(monthCost   * 100) / 100,
      projectedMonthly: Math.round(projectedMonthly * 100) / 100,
      todayTokens,
      totalInput,
      totalOutput,
      totalCache,
      totalTokens,
      totalSessions,
      dailyBudget:  DAILY_BUDGET,
      overBudget:   todayCost > DAILY_BUDGET,
      budgetPct:    Math.round((todayCost / DAILY_BUDGET) * 100),
      lastSync:     new Date().toISOString(),
      note: 'Synced from OpenClaw sessions every 5 minutes',
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, entries: [], totalCost: 0, todayCost: 0 }, { status: 500 });
  }
}
