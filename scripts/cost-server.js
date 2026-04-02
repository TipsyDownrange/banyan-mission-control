#!/usr/bin/env node
// Local cost data server — runs on Mac mini, serves session log data to Mission Control
// Start with: node scripts/cost-server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(process.env.HOME, '.openclaw/agents/main/sessions');
const PORT = 3001;

const PRICING = {
  'claude-sonnet-4-6': { input: 3.0,  output: 15.0,  cacheRead: 0.30,  cacheWrite: 3.75 },
  'claude-opus-4-6':   { input: 15.0, output: 75.0,  cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-haiku-4-5':  { input: 0.80, output: 4.0,   cacheRead: 0.08,  cacheWrite: 1.00 },
  'claude-haiku-3-5':  { input: 0.80, output: 4.0,   cacheRead: 0.08,  cacheWrite: 1.00 },
};

function getPrice(model, inp, out, cr, cw) {
  const key = Object.keys(PRICING).find(k => model.includes(k)) || 'claude-sonnet-4-6';
  const p = PRICING[key];
  return (inp/1e6)*p.input + (out/1e6)*p.output + (cr/1e6)*p.cacheRead + (cw/1e6)*p.cacheWrite;
}

function getCostData() {
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl') && !f.includes('.reset'));
  const byDate = {};
  const byModel = {};
  let totalCost = 0, totalCalls = 0, totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;

  for (const file of files) {
    const lines = fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const d = JSON.parse(line);
        if (d.type !== 'message') continue;
        const msg = d.message || {};
        const usage = msg.usage || {};
        if (!usage.input && !usage.output) continue;

        const model = msg.model || 'claude-sonnet-4-6';
        const date = (d.timestamp || '').slice(0, 10);
        const inp = usage.input || 0;
        const out = usage.output || 0;
        const cr = usage.cacheRead || 0;
        const cw = usage.cacheWrite || 0;

        let cost = 0;
        const cd = usage.cost;
        if (cd && typeof cd === 'object') {
          cost = Object.values(cd).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0);
        } else {
          cost = getPrice(model, inp, out, cr, cw);
        }

        if (!byDate[date]) byDate[date] = { input:0, output:0, cacheRead:0, cacheWrite:0, cost:0, calls:0 };
        byDate[date].input += inp; byDate[date].output += out;
        byDate[date].cacheRead += cr; byDate[date].cacheWrite += cw;
        byDate[date].cost += cost; byDate[date].calls += 1;

        const mk = Object.keys(PRICING).find(k => model.includes(k)) || model;
        if (!byModel[mk]) byModel[mk] = { input:0, output:0, cost:0, calls:0 };
        byModel[mk].input += inp; byModel[mk].output += out;
        byModel[mk].cost += cost; byModel[mk].calls += 1;

        totalCost += cost; totalCalls += 1;
        totalInput += inp; totalOutput += out;
        totalCacheRead += cr; totalCacheWrite += cw;
      } catch {}
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const entries = Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, d]) => ({ date, ...d }));

  return { entries, totalCost, todayCost: byDate[today]?.cost || 0, totalCalls,
    totalInput, totalOutput, totalCacheRead, totalCacheWrite, byModel };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  try {
    const data = getCostData();
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message, entries: [], totalCost: 0 }));
  }
});

server.listen(PORT, () => {
  console.log(`Cost server running at http://localhost:${PORT}`);
  console.log(`Reading sessions from: ${SESSIONS_DIR}`);
});
