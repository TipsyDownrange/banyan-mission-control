/**
 * GET /api/cost
 * Multi-source cost aggregation:
 *   1. Anthropic daily API costs (Daily tab — synced every 5min via sync-cost.py from Anthropic Admin API)
 *   2. OpenAI daily costs (OpenAI_Daily tab — CSV imports)
 *   3. Anthropic invoices (Anthropic_Invoices tab — actual card charges + credit grants)
 *   4. Subscriptions (Subscriptions tab — fixed monthly costs)
 *   5. Vercel costs (Vercel_Costs tab — base + usage)
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
    const [dailyRes, openaiRes, invoicesRes, subsRes, vercelRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: COST_SHEET_ID, range: 'Daily!A1:G300' }),
      sheets.spreadsheets.values.get({ spreadsheetId: COST_SHEET_ID, range: 'OpenAI_Daily!A2:D200' }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({ spreadsheetId: COST_SHEET_ID, range: 'Anthropic_Invoices!A2:E100' }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({ spreadsheetId: COST_SHEET_ID, range: 'Subscriptions!A2:H50' }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({ spreadsheetId: COST_SHEET_ID, range: 'Vercel_Costs!A2:D50' }).catch(() => ({ data: { values: [] } })),
    ]);

    const today = new Date().toISOString().slice(0, 10);

    // ── Anthropic daily API costs ──
    const dailyRows = dailyRes.data.values || [];
    const anthropicEntries = dailyRows.slice(1).filter(r => r[0])
      .map(r => ({
        date: r[0] || '',
        inputTokens:  parseInt(r[1]) || 0,
        outputTokens: parseInt(r[2]) || 0,
        cacheRead:    parseInt(r[3]) || 0,
        cacheWrite:   parseInt(r[4]) || 0,
        costUsd:      parseFloat(r[5]) || 0,
        sessions:     parseInt(r[6]) || 0,
      }))
      .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
      .sort((a, b) => b.date.localeCompare(a.date));

    // ── OpenAI daily costs ──
    const openaiEntries = ((openaiRes.data.values || []) as string[][])
      .filter(r => r[0])
      .map(r => ({ date: r[0], costUsd: parseFloat(r[1]) || 0, org: r[2] || '', project: r[3] || '' }))
      .filter(e => (!from || e.date >= from) && (!to || e.date <= to));

    // ── Anthropic invoices ──
    const invoices = ((invoicesRes.data.values || []) as string[][])
      .filter(r => r[0])
      .map(r => ({ date: r[0], type: r[1], amount: parseFloat(r[2]) || 0, status: r[3], notes: r[4] || '' }));

    const invoicesPaid = invoices.filter(i => i.type === 'invoice' && i.status === 'paid')
      .reduce((s, i) => s + i.amount, 0);
    const creditsReceived = invoices.filter(i => i.type === 'credit_grant')
      .reduce((s, i) => s + i.amount, 0);

    // ── Subscriptions ──
    const subscriptions = ((subsRes.data.values || []) as string[][])
      .filter(r => r[0])
      .map(r => ({
        id: r[0], provider: r[1], plan: r[2],
        monthlyCost: parseFloat(r[3]) || 0,
        startDate: r[4], endDate: r[5] || '',
        notes: r[6] || '', active: (r[7] || 'TRUE').toUpperCase() === 'TRUE',
      }))
      .filter(s => s.active);

    const monthlySubTotal = subscriptions.reduce((s, sub) => s + sub.monthlyCost, 0);
    // Months since earliest start date
    const subStartDates = subscriptions.map(s => s.startDate).filter(Boolean).sort();
    const earliestSub = subStartDates[0] || '2026-03-01';
    const subMonths = Math.max(1, Math.ceil((Date.now() - new Date(earliestSub).getTime()) / (1000 * 60 * 60 * 24 * 30)));
    const subTotalToDate = monthlySubTotal * subMonths;

    // ── Vercel costs ──
    const vercelRows = ((vercelRes.data.values || []) as string[][]);
    const vercelTotal = vercelRows.reduce((s, r) => s + (parseFloat(r[3]) || 0), 0);

    // ── Aggregates ──
    const anthropicApiTotal = anthropicEntries.reduce((s, e) => s + e.costUsd, 0);
    const openaiApiTotal = openaiEntries.reduce((s, e) => s + e.costUsd, 0);
    const todayAnthropicEntry = anthropicEntries.find(e => e.date === today);
    const todayOpenaiEntry = openaiEntries.find(e => e.date === today);
    const todayCost = (todayAnthropicEntry?.costUsd || 0) + (todayOpenaiEntry?.costUsd || 0);

    const allInTotal = invoicesPaid + openaiApiTotal + subTotalToDate + vercelTotal;

    // ── byDay (merged Anthropic + OpenAI) ──
    const byDay: Record<string, { cost: number; anthropic: number; openai: number; tokens: number; sessions: number }> = {};
    for (const e of anthropicEntries) {
      byDay[e.date] = { ...(byDay[e.date] || { cost: 0, anthropic: 0, openai: 0, tokens: 0, sessions: 0 }) };
      byDay[e.date].anthropic += e.costUsd;
      byDay[e.date].cost += e.costUsd;
      byDay[e.date].tokens += e.inputTokens + e.outputTokens + e.cacheRead;
      byDay[e.date].sessions += e.sessions;
    }
    for (const e of openaiEntries) {
      byDay[e.date] = { ...(byDay[e.date] || { cost: 0, anthropic: 0, openai: 0, tokens: 0, sessions: 0 }) };
      byDay[e.date].openai += e.costUsd;
      byDay[e.date].cost += e.costUsd;
    }

    // byModel (Anthropic only for now)
    const byModel: Record<string, { cost: number; input: number; output: number; sessions: number }> = {
      'claude-sonnet-4-6': {
        cost: anthropicApiTotal,
        input: anthropicEntries.reduce((s, e) => s + e.inputTokens, 0),
        output: anthropicEntries.reduce((s, e) => s + e.outputTokens, 0),
        sessions: anthropicEntries.reduce((s, e) => s + e.sessions, 0),
      },
    };

    // sessions array (per-day entries, newest first)
    const sessions = anthropicEntries.map(e => ({
      id: e.date, date: e.date, model: 'claude-sonnet-4-6',
      cost: e.costUsd, estimatedCost: e.costUsd,
      inputTokens: e.inputTokens, outputTokens: e.outputTokens,
      totalTokens: e.inputTokens + e.outputTokens + e.cacheRead,
      sessions: e.sessions,
    }));

    const allDates = Object.keys(byDay).sort();
    const earliest = allDates[0] || today;

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const weekCost = anthropicEntries.filter(e => e.date >= weekAgo).reduce((s, e) => s + e.costUsd, 0)
                   + openaiEntries.filter(e => e.date >= weekAgo).reduce((s, e) => s + e.costUsd, 0);

    return NextResponse.json({
      // Hero
      allInTotal:          Math.round(allInTotal * 100) / 100,
      totalCost:           Math.round(allInTotal * 100) / 100, // alias
      totalApiCost:        Math.round((anthropicApiTotal + openaiApiTotal) * 100) / 100,
      totalSubscriptions:  Math.round(subTotalToDate * 100) / 100,
      todayCost:           Math.round(todayCost * 10000) / 10000,
      weekCost:            Math.round(weekCost * 100) / 100,
      monthlyBurn:         Math.round(monthlySubTotal * 100) / 100,

      // By provider
      byProvider: {
        anthropic: {
          apiCostToDate:   Math.round(anthropicApiTotal * 100) / 100,
          invoicesPaid:    Math.round(invoicesPaid * 100) / 100,
          creditsReceived: Math.round(creditsReceived * 100) / 100,
          todayCost:       Math.round((todayAnthropicEntry?.costUsd || 0) * 10000) / 10000,
          subscription:    subscriptions.find(s => s.provider === 'Anthropic')?.monthlyCost || 0,
          total:           Math.round((invoicesPaid + (subscriptions.find(s=>s.provider==='Anthropic')?.monthlyCost||0)*subMonths) * 100) / 100,
        },
        openai: {
          apiCostToDate: Math.round(openaiApiTotal * 100) / 100,
          todayCost:     Math.round((todayOpenaiEntry?.costUsd || 0) * 10000) / 10000,
          subscription:  subscriptions.filter(s => s.provider === 'OpenAI').reduce((s, sub) => s + sub.monthlyCost, 0),
          total:         Math.round((openaiApiTotal + subscriptions.filter(s=>s.provider==='OpenAI').reduce((s,sub)=>s+sub.monthlyCost,0)*subMonths) * 100) / 100,
        },
        vercel: {
          totalToDate: Math.round(vercelTotal * 100) / 100,
          subscription: subscriptions.find(s => s.provider === 'Vercel')?.monthlyCost || 0,
        },
        subscriptions: {
          monthly:     Math.round(monthlySubTotal * 100) / 100,
          totalToDate: Math.round(subTotalToDate * 100) / 100,
          items:       subscriptions,
        },
      },

      // Charts & detail
      byDay,
      byModel,
      sessions,

      // Raw data
      anthropicInvoices: invoices,
      openaiDaily: openaiEntries,

      // Legacy fields (CostPanel compat)
      totalInput:  anthropicEntries.reduce((s, e) => s + e.inputTokens, 0),
      totalOutput: anthropicEntries.reduce((s, e) => s + e.outputTokens, 0),
      totalCache:  anthropicEntries.reduce((s, e) => s + e.cacheRead, 0),
      totalTokens: anthropicEntries.reduce((s, e) => s + e.inputTokens + e.outputTokens + e.cacheRead, 0),
      totalSessions: anthropicEntries.reduce((s, e) => s + e.sessions, 0),
      entries: anthropicEntries.map(e => ({ ...e, costUsd: e.costUsd })),

      // Alerts
      dailyBudget: DAILY_BUDGET,
      overBudget:  todayCost > DAILY_BUDGET,
      budgetPct:   Math.round((todayCost / DAILY_BUDGET) * 100),

      // Metadata
      dataRange:   { earliest, latest: today },
      lastSync:    new Date().toISOString(),
      anthropicSource: 'live_admin_api',
      openaiSource: 'csv_import',
      note: 'Anthropic: live Admin API every 5min. OpenAI: CSV imports. Subscriptions: configured.',
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cost]', msg);
    // Return safe empty response — never crash
    return NextResponse.json({
      allInTotal: 0, totalCost: 0, totalApiCost: 0, todayCost: 0,
      byDay: {}, byModel: {}, sessions: [], entries: [],
      anthropicInvoices: [], openaiDaily: [], subscriptions: [],
      byProvider: { anthropic:{apiCostToDate:0,invoicesPaid:0,creditsReceived:0,todayCost:0,subscription:0,total:0}, openai:{apiCostToDate:0,todayCost:0,subscription:0,total:0}, vercel:{totalToDate:0,subscription:0}, subscriptions:{monthly:0,totalToDate:0,items:[]} },
      dailyBudget: 50, overBudget: false, totalInput:0, totalOutput:0, totalCache:0, totalTokens:0, totalSessions:0,
      error: msg,
    }, { status: 500 });
  }
}
