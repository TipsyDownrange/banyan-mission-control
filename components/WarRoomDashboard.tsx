'use client';

import { useMemo, useState } from 'react';
import { buildWarRoomDispatchPrompt, canPrepareWarRoomDispatch } from '@/lib/war-room/dispatchPrompt';
import type { WarRoomDashboardData, WarRoomIssue, WarRoomQueueKey } from '@/lib/war-room/types';

const NAV: Array<{ key: WarRoomQueueKey; label: string }> = [
  { key: 'myWatch', label: 'My Watch' },
  { key: 'readyForCodex', label: 'Ready for Codex' },
  { key: 'needsSean', label: 'Needs Sean' },
  { key: 'captainsTriage', label: "Captain's Triage" },
  { key: 'xoReview', label: 'XO Review' },
  { key: 'needsEvidence', label: 'Needs Evidence' },
  { key: 'backlog', label: 'Backlog / Dry Dock' },
  { key: 'closed', label: 'Closed / Logged' },
];

const FILTERS = ['All', 'P0/P1', 'Codex', 'Needs Sean', 'Evidence', 'MC', 'Both'];

function riskColor(risk: WarRoomIssue['risk']) {
  if (risk === 'P0') return '#ef4444';
  if (risk === 'P1') return '#f97316';
  if (risk === 'P2') return '#f59e0b';
  if (risk === 'P3') return '#22c55e';
  return '#38bdf8';
}

function formatDate(value?: string | null) {
  if (!value) return 'No timestamp';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function matchesFilter(issue: WarRoomIssue, filter: string) {
  if (filter === 'All') return true;
  if (filter === 'P0/P1') return issue.risk === 'P0' || issue.risk === 'P1';
  if (filter === 'Codex') return issue.lane === 'Codex';
  if (filter === 'Needs Sean') return issue.labels.some(label => label.includes('Needs Sean'));
  if (filter === 'Evidence') return issue.labels.includes('State: Evidence Missing') || issue.latestCommentSummary?.toLowerCase().includes('evidence');
  if (filter === 'MC') return issue.repo === 'MC';
  if (filter === 'Both') return issue.repo === 'Both';
  return true;
}

function IssuePills({ issue }: { issue: WarRoomIssue }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {[issue.status, `Risk ${issue.risk}`, `Repo ${issue.repo}`, `Lane ${issue.lane}`, issue.area].map(item => (
        <span key={item} style={{
          border: item.includes('Risk') ? `1px solid ${riskColor(issue.risk)}66` : '1px solid rgba(94,234,212,0.2)',
          color: item.includes('Risk') ? riskColor(issue.risk) : '#a7f3d0',
          background: item.includes('Risk') ? `${riskColor(issue.risk)}1f` : 'rgba(20,184,166,0.08)',
          padding: '4px 8px',
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>{item}</span>
      ))}
    </div>
  );
}

function QueueCard({ issue, active, onSelect }: { issue: WarRoomIssue; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        border: active ? '1px solid rgba(94,234,212,0.65)' : '1px solid rgba(148,163,184,0.16)',
        background: active ? 'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(14,165,233,0.08))' : 'rgba(15,23,42,0.58)',
        borderRadius: 8,
        padding: 12,
        color: '#e2e8f0',
        cursor: 'pointer',
        boxShadow: active ? '0 0 24px rgba(20,184,166,0.12)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <span style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{issue.id}</span>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: riskColor(issue.risk), boxShadow: `0 0 10px ${riskColor(issue.risk)}99`, flexShrink: 0 }} />
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 800, marginBottom: 10 }}>{issue.title}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>
        <span>{issue.status}</span>
        <span>{issue.repo}</span>
        <span>{issue.lane}</span>
      </div>
    </button>
  );
}

function Column({ title, issues, selectedId, onSelect }: { title: string; issues: WarRoomIssue[]; selectedId: string; onSelect: (issue: WarRoomIssue) => void }) {
  return (
    <section style={{
      minWidth: 0,
      border: '1px solid rgba(148,163,184,0.14)',
      background: 'rgba(8,20,32,0.72)',
      borderRadius: 8,
      padding: 12,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, color: '#f8fafc', fontSize: 13, fontWeight: 900 }}>{title}</h2>
        <span style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{issues.length}</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {issues.slice(0, 6).map(issue => (
          <QueueCard key={issue.id} issue={issue} active={issue.id === selectedId} onSelect={() => onSelect(issue)} />
        ))}
        {issues.length === 0 && (
          <div style={{ border: '1px dashed rgba(148,163,184,0.2)', borderRadius: 8, padding: 16, color: '#64748b', fontSize: 13 }}>
            Queue clear.
          </div>
        )}
      </div>
    </section>
  );
}

export default function WarRoomDashboard({ initialData }: { initialData: WarRoomDashboardData }) {
  const [data] = useState(initialData);
  const [selectedId, setSelectedId] = useState(initialData.upNext[0]?.id || initialData.issues[0]?.id || '');
  const [activeQueue, setActiveQueue] = useState<WarRoomQueueKey>('myWatch');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [dispatchIssueId, setDispatchIssueId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const selectedIssue = data.issues.find(issue => issue.id === selectedId) || data.issues[0];
  const dispatchIssue = data.issues.find(issue => issue.id === dispatchIssueId) || null;
  const dispatchPrompt = dispatchIssue ? buildWarRoomDispatchPrompt(dispatchIssue) : '';
  const selectedIssueQueueKeys = selectedIssue
    ? data.queues.filter(queueItem => queueItem.issues.some(issue => issue.id === selectedIssue.id)).map(queueItem => queueItem.key)
    : [];
  const dispatchReady = canPrepareWarRoomDispatch(selectedIssue, { queueKeys: selectedIssueQueueKeys });
  const activeQueueMeta = data.queues.find(queueItem => queueItem.key === activeQueue);

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    const activeQueueIssues = data.queues.find(queueItem => queueItem.key === activeQueue)?.issues || data.issues;

    return activeQueueIssues.filter(issue => {
      const haystack = [issue.id, issue.title, issue.status, issue.repo, issue.lane, issue.area, issue.risk, ...issue.labels].join(' ').toLowerCase();
      return (!query || haystack.includes(query)) && matchesFilter(issue, filter);
    });
  }, [activeQueue, data.issues, data.queues, filter, search]);

  const queue = (key: WarRoomQueueKey) => data.queues.find(item => item.key === key)?.issues.filter(issue => filteredIssues.some(match => match.id === issue.id)) || [];
  const commandDecision = [...queue('needsSean'), ...queue('needsEvidence')].filter((issue, index, arr) => arr.findIndex(item => item.id === issue.id) === index);
  const triage = queue('captainsTriage');
  const ready = queue('readyForCodex');
  const xoReview = queue('xoReview');

  function selectIssue(issue: WarRoomIssue) {
    setSelectedId(issue.id);
    setCopyStatus('idle');
  }

  function selectQueue(key: WarRoomQueueKey) {
    const queueIssues = data.queues.find(queueItem => queueItem.key === key)?.issues || [];
    const nextIssues = key === 'myWatch'
      ? queueIssues.length > 0 ? queueIssues : data.upNext.length > 0 ? data.upNext : data.issues
      : queueIssues;

    setActiveQueue(key);
    setFilter('All');
    setCopyStatus('idle');
    setDispatchIssueId(null);
    if (nextIssues[0]) setSelectedId(nextIssues[0].id);
  }

  async function copyDispatchPrompt() {
    if (!dispatchPrompt) return;
    try {
      await navigator.clipboard.writeText(dispatchPrompt);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    <div style={{
      minHeight: '100%',
      background: 'radial-gradient(circle at top left, rgba(20,184,166,0.16), transparent 32%), linear-gradient(180deg, #06121f 0%, #071722 38%, #08111d 100%)',
      color: '#e2e8f0',
      fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif',
      display: 'flex',
    }}>
      <aside style={{
        width: 220,
        flexShrink: 0,
        borderRight: '1px solid rgba(148,163,184,0.14)',
        background: 'rgba(3,10,20,0.68)',
        padding: '20px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ padding: '0 8px 12px', borderBottom: '1px solid rgba(148,163,184,0.12)', marginBottom: 8 }}>
          <div style={{ color: '#2dd4bf', fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>BanyanOS</div>
          <div style={{ color: '#f8fafc', fontSize: 18, fontWeight: 900, marginTop: 4 }}>War Room</div>
        </div>
        {NAV.map(item => {
          const count = data.queues.find(queueItem => queueItem.key === item.key)?.issues.length || 0;
          const active = item.key === activeQueue;
          return (
            <button
              key={item.key}
              type="button"
              data-war-room-queue={item.key}
              aria-pressed={active}
              onClick={() => selectQueue(item.key)}
              style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              border: active ? '1px solid rgba(45,212,191,0.36)' : '1px solid transparent',
              background: active ? 'rgba(20,184,166,0.12)' : 'transparent',
              color: active ? '#ccfbf1' : '#94a3b8',
              borderRadius: 8,
              padding: '9px 10px',
              fontSize: 12,
              fontWeight: 800,
              textAlign: 'left',
              cursor: 'pointer',
              position: 'relative',
              zIndex: 1,
            }}>
              <span>{item.label}</span>
              <span style={{ color: active ? '#67e8f9' : '#475569', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{count}</span>
            </button>
          );
        })}
        <div style={{ marginTop: 'auto', border: '1px solid rgba(45,212,191,0.18)', background: 'rgba(20,184,166,0.07)', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#67e8f9', fontSize: 11, fontWeight: 900, marginBottom: 5 }}>Bridge Config</div>
          <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.45 }}>{data.source === 'linear' ? 'Read-only Linear adapter active.' : 'Fixture fallback active until LINEAR_API_KEY is configured.'}</div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: 24, overflow: 'auto' }}>
        <header style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(280px, 460px)', gap: 16, alignItems: 'start', marginBottom: 18 }}>
          <div>
            <div style={{ color: '#38bdf8', fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
              BanyanOS War Room / Captain's Triage
            </div>
            <h1 style={{ margin: 0, color: '#f8fafc', fontSize: 30, fontWeight: 950, letterSpacing: '-0.02em' }}>Linear Command Dashboard</h1>
            <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12, fontWeight: 800 }}>
              Viewing {activeQueueMeta?.label || 'War Room'} queue ({filteredIssues.length})
            </div>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search issue IDs, titles, labels, repos, lanes"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'rgba(15,23,42,0.82)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(148,163,184,0.22)',
                  borderRadius: 8,
                  padding: '11px 12px',
                  outline: 'none',
                  fontSize: 13,
                }}
              />
              <div style={{ border: '1px solid rgba(34,197,94,0.32)', background: 'rgba(34,197,94,0.1)', color: '#86efac', borderRadius: 8, padding: '10px 12px', fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }}>
                {data.bridgeStatus}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {FILTERS.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  style={{
                    border: filter === item ? '1px solid rgba(94,234,212,0.55)' : '1px solid rgba(148,163,184,0.16)',
                    background: filter === item ? 'rgba(20,184,166,0.15)' : 'rgba(15,23,42,0.5)',
                    color: filter === item ? '#ccfbf1' : '#94a3b8',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(120px, 1fr))', gap: 10, marginBottom: 18 }}>
          {[
            ['Ready', data.kpis.readyForCodex, '#22d3ee'],
            ['Needs Sean', data.kpis.needsSean, '#f59e0b'],
            ['P0/P1 Risks', data.kpis.p0p1Risks, '#ef4444'],
            ['Needs Evidence', data.kpis.needsEvidence, '#fb923c'],
            ['Closed / Logged', data.kpis.closedLogged, '#22c55e'],
            ['Codex Active', data.kpis.activeCodex ?? '-', '#a7f3d0'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(15,23,42,0.64)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ color: color as string, fontSize: 24, fontWeight: 950, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{value}</div>
              <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            </div>
          ))}
        </section>

        {selectedIssue && (
          <section style={{
            border: '1px solid rgba(94,234,212,0.26)',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.88), rgba(8,47,73,0.64))',
            borderRadius: 8,
            padding: 18,
            marginBottom: 18,
            boxShadow: '0 18px 60px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 18, alignItems: 'start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ color: '#67e8f9', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14, fontWeight: 950 }}>{selectedIssue.id}</span>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: riskColor(selectedIssue.risk), boxShadow: `0 0 16px ${riskColor(selectedIssue.risk)}` }} />
                </div>
                <h2 style={{ color: '#f8fafc', fontSize: 24, lineHeight: 1.15, margin: '0 0 12px', fontWeight: 950 }}>{selectedIssue.title}</h2>
                <IssuePills issue={selectedIssue} />
                <p style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.55, margin: '16px 0 0', maxWidth: 900 }}>
                  {selectedIssue.latestCommentSummary || 'No comment or evidence summary has been captured for this issue yet.'}
                </p>
              </div>
              <div style={{ display: 'grid', gap: 8, minWidth: 190 }}>
                <a href={selectedIssue.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', textAlign: 'center', borderRadius: 8, padding: '10px 12px', color: '#04111f', background: 'linear-gradient(135deg,#67e8f9,#2dd4bf)', fontWeight: 950, fontSize: 13 }}>Review / Act</a>
                <button
                  type="button"
                  data-war-room-action="prepare-dispatch"
                  disabled={!dispatchReady}
                  onClick={() => {
                    if (!selectedIssue || !dispatchReady) return;
                    setDispatchIssueId(selectedIssue.id);
                    setCopyStatus('idle');
                  }}
                  title={dispatchReady ? 'Generate a copy-ready Codex dispatch prompt' : 'Dispatch prompts are enabled for Ready for Codex issues with complete issue metadata.'}
                  style={{
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: dispatchReady ? '#06121f' : '#64748b',
                    background: dispatchReady ? 'linear-gradient(135deg,#f8fafc,#a7f3d0)' : 'rgba(148,163,184,0.08)',
                    border: dispatchReady ? '1px solid rgba(167,243,208,0.5)' : '1px solid rgba(148,163,184,0.16)',
                    fontWeight: 900,
                    cursor: dispatchReady ? 'pointer' : 'not-allowed',
                  }}
                >
                  Prepare Dispatch
                </button>
                <a href={selectedIssue.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', textAlign: 'center', borderRadius: 8, padding: '10px 12px', color: '#ccfbf1', background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.28)', fontWeight: 900, fontSize: 13 }}>Open Linear</a>
                <button disabled style={{ borderRadius: 8, padding: '10px 12px', color: '#64748b', background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.16)', fontWeight: 900 }}>Mark Needs Evidence</button>
              </div>
            </div>
          </section>
        )}

        {dispatchIssue && (
          <section style={{
            border: '1px solid rgba(94,234,212,0.28)',
            background: 'rgba(3,10,20,0.82)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 18,
            boxShadow: '0 16px 50px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: 12, alignItems: 'start', marginBottom: 12 }}>
              <div>
                <div style={{ color: '#67e8f9', fontSize: 11, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>
                  Codex Dispatch Prompt
                </div>
                <h2 style={{ color: '#f8fafc', margin: 0, fontSize: 18, lineHeight: 1.25, fontWeight: 950 }}>
                  {dispatchIssue.id}: {dispatchIssue.title}
                </h2>
                <p style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5, margin: '8px 0 0' }}>
                  Read-only prompt generation. Copy this into Codex; BanyanOS does not execute the dispatch or write to Linear.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  onClick={copyDispatchPrompt}
                  style={{
                    border: '1px solid rgba(94,234,212,0.44)',
                    background: 'linear-gradient(135deg,#67e8f9,#2dd4bf)',
                    color: '#04111f',
                    borderRadius: 8,
                    padding: '9px 12px',
                    fontSize: 12,
                    fontWeight: 950,
                    cursor: 'pointer',
                  }}
                >
                  Copy Prompt
                </button>
                <button
                  onClick={() => {
                    setDispatchIssueId(null);
                    setCopyStatus('idle');
                  }}
                  style={{
                    border: '1px solid rgba(148,163,184,0.18)',
                    background: 'rgba(15,23,42,0.66)',
                    color: '#cbd5e1',
                    borderRadius: 8,
                    padding: '9px 12px',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: copyStatus === 'copied' ? '#22c55e' : copyStatus === 'failed' ? '#f59e0b' : '#38bdf8' }} />
              <span style={{ color: copyStatus === 'failed' ? '#fbbf24' : '#94a3b8', fontSize: 12, fontWeight: 800 }}>
                {copyStatus === 'copied' && 'Prompt copied to clipboard.'}
                {copyStatus === 'failed' && 'Clipboard blocked. Select the prompt text below and copy manually.'}
                {copyStatus === 'idle' && 'Fallback copy block is always visible below.'}
              </span>
            </div>
            <textarea
              readOnly
              value={dispatchPrompt}
              aria-label={`Dispatch prompt for ${dispatchIssue.id}`}
              style={{
                width: '100%',
                minHeight: 320,
                resize: 'vertical',
                border: '1px solid rgba(148,163,184,0.2)',
                background: 'rgba(2,6,23,0.82)',
                color: '#dbeafe',
                borderRadius: 8,
                padding: 14,
                fontSize: 12,
                lineHeight: 1.55,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </section>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
          <Column title="Needs Command Decision" issues={commandDecision} selectedId={selectedId} onSelect={selectIssue} />
          <Column title="Captain's Triage" issues={triage} selectedId={selectedId} onSelect={selectIssue} />
          <Column title="Ready to Execute" issues={ready} selectedId={selectedId} onSelect={selectIssue} />
          <Column title="XO Review" issues={xoReview} selectedId={selectedId} onSelect={selectIssue} />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 12 }}>
          {[
            ['Recently Completed', data.recentlyCompleted],
            ['Up Next', data.upNext],
          ].map(([title, issues]) => (
            <div key={title as string} style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(8,20,32,0.72)', borderRadius: 8, padding: 14 }}>
              <h2 style={{ margin: '0 0 12px', color: '#f8fafc', fontSize: 14, fontWeight: 950 }}>{title as string}</h2>
              <div style={{ display: 'grid', gap: 9 }}>
                {(issues as WarRoomIssue[]).slice(0, 5).map(issue => (
                  <button key={issue.id} onClick={() => selectIssue(issue)} style={{ textAlign: 'left', background: 'transparent', border: 'none', padding: 0, color: '#cbd5e1', cursor: 'pointer' }}>
                    <span style={{ color: '#67e8f9', fontSize: 11, fontWeight: 950, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{issue.id}</span>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginTop: 2 }}>{issue.title}</span>
                    <span style={{ display: 'block', color: '#64748b', fontSize: 11, marginTop: 2 }}>{formatDate(issue.completedAt || issue.updatedAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(8,20,32,0.72)', borderRadius: 8, padding: 14 }}>
            <h2 style={{ margin: '0 0 12px', color: '#f8fafc', fontSize: 14, fontWeight: 950 }}>Bridge Communications</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {data.bridgeCommunications.map(note => (
                <button key={`${note.issueId}-${note.updatedAt}`} onClick={() => {
                  setSelectedId(note.issueId);
                  setCopyStatus('idle');
                }} style={{ textAlign: 'left', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 8, padding: 10, background: 'rgba(15,23,42,0.5)', color: '#cbd5e1', cursor: 'pointer' }}>
                  <div style={{ color: '#67e8f9', fontSize: 11, fontWeight: 950, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', marginBottom: 4 }}>{note.issueId}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.45 }}>{note.note}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <footer style={{ marginTop: 18, border: '1px solid rgba(45,212,191,0.16)', background: 'rgba(20,184,166,0.06)', borderRadius: 8, padding: '10px 12px', color: '#94a3b8', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>Read-only command surface. No Linear mutations or production writes are enabled.</span>
          <span>Updated {formatDate(data.generatedAt)} from {data.source === 'linear' ? 'Linear' : 'typed fixtures'}.</span>
        </footer>
      </main>
    </div>
  );
}
