/**
 * GET /api/cost
 * Multi-source cost aggregation: Anthropic API + subscriptions + manual costs.
 * Daily API data synced every 5 minutes from OpenClaw sessions.json via sync-cost.py.
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

    // Fetch all tabs in parallel
    const [dailyRes, subsRes, manualRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: COST_SHEET_ID, range: 'Daily!A1:G200' }),
      sheets.spreadsheets.values.get({ spreadsheetId: COST_SHEET_ID, range: 'Subscriptions!A2:H50' }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({ spreadsheetId: COST_SHEET_ID, range: 'Manual_Costs!A2:F200' }).catch(() => ({ data: { values: [] } })),
    ]);

    const dailyRows = dailyRes.data.values || [];
    const subsRows = (subsRes.data.values || []) as string[][];
    const manualRows = (manualRes.data.values || []) as string[][];

    // Parse daily API entries
    const dataRows = dailyRows.slice(1).filter(r => r[0]);
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
      .sort((a, b) => b.date.localeCompare(a.date));

    // Parse subscriptions
    const subscriptions = subsRows.map(r => ({
      id: r[0] || '',
      provider: r[1] || '',
      plan: r[2] || '',
      monthlyCost: parseFloat(r[3]) || 0,
      startDate: r[4] || '',
      endDate: r[5] || '',
      notes: r[6] || '',
      active: (r[7] || 'TRUE').toUpperCase() === 'TRUE',
    })).filter(s => s.active);

    const monthlySubTotal = subscriptions.reduce((s, sub) => s + sub.monthlyCost, 0);

    // Parse manual costs
    const manualCosts = manualRows.map(r => ({
      id: r[0] || '',
      date: r[1] || '',
      provider: r[2] || '',
      description: r[3] || '',
      amount: parseFloat(r[4]) || 0,
      category: r[5] || '',
    }));

    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = entries.find(e => e.date === today);

    const apiTotal = entries.reduce((s, e) => s + e.costUsd, 0);
    const manualTotal = manualCosts.reduce((s, m) => s + m.amount, 0);
    const todayCost = todayEntry?.costUsd || 0;

    // byDay map for chart
    const byDay: Record<string, { cost: number; tokens: number; sessions: number; input: number; output: number; cache: number }> = {};
    for (const e of entries) {
      byDay[e.date] = {
        cost: e.costUsd,
        tokens: e.inputTokens + e.outputTokens + e.cacheReadTokens,
        sessions: e.sessions,
        input: e.inputTokens,
        output: e.outputTokens,
        cache: e.cacheReadTokens,
      };
    }

    // byModel (all from Anthropic for now)
    const byModel: Record<string, { cost: number; input: number; output: number; sessions: number }> = {
      'claude-sonnet-4-6': {
        cost: apiTotal,
        input: entries.reduce((s, e) => s + e.inputTokens, 0),
        output: entries.reduce((s, e) => s + e.outputTokens, 0),
        sessions: entries.reduce((s, e) => s + e.sessions, 0),
      },
    };

    // sessions array (one per day for compatibility)
    const sessions = entries.map(e => ({
      id: e.date,
      date: e.date,
      model: 'claude-sonnet-4-6',
      cost: e.costUsd,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      sessions: e.sessions,
    }));

    // Provider breakdown
    const anthropicSub = subscriptions.find(s => s.provider === 'Anthropic');
    const openaiSubs = subscriptions.filter(s => s.provider === 'OpenAI');
    const vercelSub = subscriptions.find(s => s.provider === 'Vercel');

    const byProvider = {
      anthropic: {
        api: Math.round(apiTotal * 100) / 100,
        subscription: anthropicSub?.monthlyCost || 0,
        total: Math.round((apiTotal + (anthropicSub?.monthlyCost || 0)) * 100) / 100,
      },
      openai: {
        api: 0, // manual entry only for now
        subscription: openaiSubs.reduce((s, sub) => s + sub.monthlyCost, 0),
        total: openaiSubs.reduce((s, sub) => s + sub.monthlyCost, 0),
      },
      vercel: {
        subscription: vercelSub?.monthlyCost || 0,
      },
    };

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const weekCost = entries.filter(e => e.date >= weekAgo).reduce((s, e) => s + e.costUsd, 0);
    const monthCost = entries.filter(e => e.date >= monthAgo).reduce((s, e) => s + e.costUsd, 0);

    const earliestDate = entries.length > 0 ? entries[entries.length - 1].date : today;

    return NextResponse.json({
      // Summary
      totalCost: Math.round((apiTotal + monthlySubTotal + manualTotal) * 100) / 100,
      totalApiCost: Math.round(apiTotal * 100) / 100,
      totalSubscriptions: Math.round(monthlySubTotal * 100) / 100,
      todayCost: Math.round(todayCost * 10000) / 10000,
      weekCost: Math.round(weekCost * 100) / 100,
      monthCost: Math.round(monthCost * 100) / 100,

      // Provider breakdown
      byProvider,

      // Chart data
      byDay,
      byModel,

      // Sessions for table view
      sessions,

      // Raw entries (legacy)
      entries,

      // Subscriptions list
      subscriptions,

      // Metadata
      dailyBudget: DAILY_BUDGET,
      overBudget: todayCost > DAILY_BUDGET,
      budgetPct: Math.round((todayCost / DAILY_BUDGET) * 100),
      lastSync: new Date().toISOString(),
      dataRange: { earliest: earliestDate, latest: today },
      note: 'Anthropic API synced every 5 minutes. Subscriptions pre-configured.',
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cost]', msg);
    return NextResponse.json({
      error: msg, entries: [], sessions: [], totalCost: 0, todayCost: 0,
      byDay: {}, byModel: {}, subscriptions: [], byProvider: { anthropic: { api:0, subscription:0, total:0 }, openai: { api:0, subscription:0, total:0 }, vercel: { subscription:0 } },
    }, { status: 500 });
  }
}
