'use client';
import React, { useState, useEffect, useCallback } from 'react';
import WorkspaceShell, { WorkspaceTab } from '@/components/shared/WorkspaceShell';
import CardList, { CardListItem } from '@/components/shared/CardList';
import FilterBar, { FilterChip, SortOption } from '@/components/shared/FilterBar';
import StatusPipeline, { PipelineStage } from '@/components/shared/StatusPipeline';
import EstimatingKaiPanel from '@/components/estimating/EstimatingKaiPanel';
import BidOverviewTab from '@/components/estimating/BidOverviewTab';
import CarlsMethodTab from '@/components/estimating/CarlsMethodTab';
import TakeoffTab from '@/components/estimating/TakeoffTab';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StepTemplateStep {
  step_seq: number;
  step_name: string;
  default_hours: number;
  category: string;
  notes: string;
}

export type StepTemplates = Record<string, StepTemplateStep[]>;

export interface GoldDataEntry {
  system_type: string;
  step_name: string;
  step_category: string;
  avg_hours: number;
  sample_count: number;
  min_hours: number;
  max_hours: number;
  avg_allotted: number;
  avg_delta: number;
  last_updated: string;
}

export interface GoldDataSummary {
  total_templates: number;
  templates_with_data: number;
  most_accurate: { template: string; avg_abs_delta: number } | null;
  needs_review: { template: string; avg_delta: number } | null;
  last_computed: string;
  by_step: GoldDataEntry[];
  by_category: {
    system_type: string;
    step_category: string;
    avg_hours: number;
    sample_count: number;
    min_hours: number;
    max_hours: number;
    avg_delta: number;
    last_updated: string;
  }[];
}

export interface BidSummary {
  bidVersionId: string;
  jobId: string;
  projectName: string;
  clientGC?: string;
  island?: string;
  bidDate?: string;
  estimator?: string;
  status: string;
  totalEstimate?: string;
  priority?: string;
  version?: string;
  notes?: string;
  bidFolderUrl?: string;
  getRate?: string;
  profitPct?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { color: string; bg: string; accentColor: string }> = {
  draft:      { color: '#64748b', bg: 'rgba(100,116,139,0.1)',  accentColor: '#94a3b8' },
  'in review':{ color: '#2563eb', bg: 'rgba(37,99,235,0.1)',    accentColor: '#3b82f6' },
  submitted:  { color: '#0369a1', bg: 'rgba(3,105,161,0.1)',    accentColor: '#0369a1' },
  active:     { color: '#0f766e', bg: 'rgba(15,118,110,0.1)',   accentColor: '#14b8a6' },
  won:        { color: '#15803d', bg: 'rgba(21,128,61,0.1)',    accentColor: '#16a34a' },
  lost:       { color: '#64748b', bg: 'rgba(100,116,139,0.08)', accentColor: '#94a3b8' },
};

function getStatusStyle(status: string) {
  const key = (status || 'draft').toLowerCase();
  return STATUS_STYLES[key] ?? STATUS_STYLES.draft;
}

const WORKSPACE_TABS: WorkspaceTab[] = [
  { id: 'overview',   label: 'Overview' },
  { id: 'carls',      label: "Simple Estimate" },
  { id: 'takeoff',    label: 'Takeoff' },
  { id: 'estimate',   label: 'Estimate' },
  { id: 'quotes',     label: 'Quotes' },
  { id: 'gaps',       label: 'Bid Gaps' },
  { id: 'proposal',   label: 'Proposal' },
  { id: 'gold',       label: 'Gold Data' },
];

const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'Draft',      label: 'Draft',      color: '#94a3b8' },
  { id: 'In Review',  label: 'In Review',  color: '#3b82f6' },
  { id: 'Submitted',  label: 'Submitted',  color: '#0369a1' },
  { id: 'Won',        label: 'Won',        color: '#16a34a', terminal: 'success' },
  { id: 'Lost',       label: 'Lost',       color: '#dc2626', terminal: 'fail' },
];

const FILTER_CHIPS: FilterChip[] = [
  { id: 'all',       label: 'All',       color: '#64748b' },
  { id: 'active',    label: 'Active',    color: '#14b8a6' },
  { id: 'submitted', label: 'Submitted', color: '#0369a1' },
  { id: 'won',       label: 'Won',       color: '#16a34a' },
  { id: 'lost',      label: 'Lost',      color: '#94a3b8' },
];

const SORT_OPTIONS: SortOption[] = [
  { id: 'date_desc',  label: 'Bid Date (Newest)' },
  { id: 'date_asc',   label: 'Bid Date (Oldest)' },
  { id: 'amount_desc',label: 'Amount (High→Low)' },
  { id: 'amount_asc', label: 'Amount (Low→High)' },
  { id: 'name',       label: 'Project Name' },
];

// ─── Placeholder Tab ────────────────────────────────────────────────────────

function PlaceholderTab({ tabId }: { tabId: string }) {
  const info: Record<string, { phase: string; desc: string }> = {
    carls: {
      phase: 'Phase 2',
      desc: "The classic Kula Glass estimate form — Jody's Lotus 1-2-3 format rebuilt. Metal, glass, misc materials, labor, overhead, profit, and GET all in one familiar view. Editable fields sync from the detailed estimate.",
    },
    takeoff: {
      phase: 'Phase 3',
      desc: 'Quantity takeoff across all systems: curtainwall assemblies, storefront, doors, glass (with DLO calculations), sealant joints, fasteners, and flashing. Expand each system to see lite-by-lite detail and compliance flags.',
    },
    estimate: {
      phase: 'Phase 3',
      desc: 'Detailed material cost lines with 3-number comparison (historical / industry standard / actual), labor breakdown with friction analysis, and 4-method comparison (Complete / Lockwood / Field Fab / Hybrid).',
    },
    quotes: {
      phase: 'Phase 4',
      desc: 'Vendor quote intake and coverage matrix. See which systems have competitive quotes, which have single-source risk, and which have spec deviations. AI can parse quote PDFs automatically.',
    },
    gaps: {
      phase: 'Phase 4',
      desc: 'Bid gap log and risk register. Every ambiguity, scope boundary issue, spec/drawing contradiction, and compliance concern. Includes inclusions/exclusions library with proposal language.',
    },
    proposal: {
      phase: 'Phase 4',
      desc: 'Proposal preview with pricing table (base bid, alternates, allowances, unit prices), exclusions, and compliance qualifications. One-click generate to DOCX/PDF. Also generates the classic Carl\'s Method PDF.',
    },
    gold: {
      phase: 'Phase 7',
      desc: 'Historical performance reference for all systems in this bid. Labor productivity, material costs, lessons learned, and substitution history from past Kula Glass projects. Updated post-project with actuals.',
    },
  };

  const tab = info[tabId] ?? { phase: 'Phase 2+', desc: 'This tab is coming in a future phase.' };

  return (
    <div style={{ padding: '48px 32px', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
      <div style={{
        width: 64, height: 64,
        borderRadius: 20,
        background: 'rgba(20,184,166,0.1)',
        border: '1px solid rgba(20,184,166,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        margin: '0 auto 24px',
      }}>
        🚧
      </div>
      <div style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 999,
        background: 'rgba(20,184,166,0.1)',
        border: '1px solid rgba(20,184,166,0.2)',
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.1em',
        color: '#0f766e',
        marginBottom: 16,
        textTransform: 'uppercase',
      }}>
        Coming in {tab.phase}
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>
        {WORKSPACE_TABS.find(t => t.id === tabId)?.label ?? tabId}
      </h2>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
        {tab.desc}
      </p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface EstimatingWorkspaceProps {
  /** If provided, workspace opens to this bid immediately */
  initialBidId?: string;
}

export default function EstimatingWorkspace({ initialBidId }: EstimatingWorkspaceProps) {
  const [bids, setBids] = useState<BidSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBid, setSelectedBid] = useState<BidSummary | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('date_desc');
  const [search, setSearch] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [stepTemplates, setStepTemplates] = useState<StepTemplates>({});
  const [goldData, setGoldData] = useState<GoldDataSummary | null>(null);
  const [showNewBidModal, setShowNewBidModal] = useState(false);
  const [newBidDraft, setNewBidDraft] = useState({ project_name: '', client_gc_name: '', island: 'Maui', job_type: 'Commercial', bid_due_date: '', estimator: '', notes: '' });
  const [newBidSaving, setNewBidSaving] = useState(false);

  const loadBids = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/estimating/bids');
      const data = await res.json();
      if (Array.isArray(data.bids)) {
        setBids(data.bids);
      } else if (Array.isArray(data)) {
        setBids(data);
      }
    } catch (err) {
      console.error('Failed to load bids', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Step Library templates + Gold Data once on mount
  useEffect(() => {
    async function loadLibraryData() {
      try {
        const [templatesRes, goldRes] = await Promise.all([
          fetch('/api/step-templates'),
          fetch('/api/gold-data'),
        ]);
        const templatesJson = await templatesRes.json();
        if (templatesJson.ok && templatesJson.templates) {
          setStepTemplates(templatesJson.templates);
        }
        const goldJson = await goldRes.json();
        if (goldJson.ok && goldJson.summary) {
          setGoldData(goldJson.summary);
        }
      } catch (err) {
        console.error('Failed to load library data', err);
      }
    }
    loadLibraryData();
  }, []);

  useEffect(() => {
    loadBids();
  }, [loadBids]);

  // If initial bid ID passed, find and select it
  useEffect(() => {
    if (initialBidId && bids.length > 0) {
      const bid = bids.find(b => b.bidVersionId === initialBidId);
      if (bid) setSelectedBid(bid);
    }
  }, [initialBidId, bids]);

  async function handleStatusAdvance(toStage: string) {
    if (!selectedBid) return;
    setStatusUpdating(true);
    try {
      await fetch(`/api/estimating/bids/${selectedBid.bidVersionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: toStage }),
      });
      setBids(prev => prev.map(b =>
        b.bidVersionId === selectedBid.bidVersionId ? { ...b, status: toStage } : b
      ));
      setSelectedBid(prev => prev ? { ...prev, status: toStage } : null);
    } catch (err) {
      console.error('Status update failed', err);
    } finally {
      setStatusUpdating(false);
    }
  }

  // ─── Filtered + Sorted Bids ───────────────────────────────────────────────

  const filteredBids = bids
    .filter(bid => {
      const status = (bid.status ?? '').toLowerCase();
      if (filter === 'all') return true;
      if (filter === 'active') return status === 'active' || status === 'draft' || status === 'in review';
      return status === filter;
    })
    .filter(bid => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (bid.projectName ?? '').toLowerCase().includes(q) ||
        (bid.clientGC ?? '').toLowerCase().includes(q) ||
        (bid.island ?? '').toLowerCase().includes(q) ||
        (bid.estimator ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sort) {
        case 'date_asc': return (a.bidDate ?? '').localeCompare(b.bidDate ?? '');
        case 'date_desc': return (b.bidDate ?? '').localeCompare(a.bidDate ?? '');
        case 'name': return (a.projectName ?? '').localeCompare(b.projectName ?? '');
        case 'amount_desc': {
          const av = parseFloat((a.totalEstimate ?? '0').replace(/[^0-9.]/g, '')) || 0;
          const bv = parseFloat((b.totalEstimate ?? '0').replace(/[^0-9.]/g, '')) || 0;
          return bv - av;
        }
        case 'amount_asc': {
          const av = parseFloat((a.totalEstimate ?? '0').replace(/[^0-9.]/g, '')) || 0;
          const bv = parseFloat((b.totalEstimate ?? '0').replace(/[^0-9.]/g, '')) || 0;
          return av - bv;
        }
        default: return 0;
      }
    });

  // Counts for filter chips
  const chipCounts = FILTER_CHIPS.reduce((acc, chip) => {
    if (chip.id === 'all') {
      acc[chip.id] = bids.length;
    } else if (chip.id === 'active') {
      acc[chip.id] = bids.filter(b => {
        const s = (b.status ?? '').toLowerCase();
        return s === 'active' || s === 'draft' || s === 'in review';
      }).length;
    } else {
      acc[chip.id] = bids.filter(b => (b.status ?? '').toLowerCase() === chip.id).length;
    }
    return acc;
  }, {} as Record<string, number>);

  // ─── Card List Items ──────────────────────────────────────────────────────

  const cardItems: CardListItem[] = filteredBids.map((bid) => {
    const style = getStatusStyle(bid.status);
    const amount = bid.totalEstimate
      ? (bid.totalEstimate.startsWith('$') ? bid.totalEstimate : `$${bid.totalEstimate}`)
      : null;

    const bidDate = bid.bidDate ? new Date(bid.bidDate).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }) : null;

    const daysUntil = bid.bidDate
      ? Math.ceil((new Date(bid.bidDate).getTime() - Date.now()) / 86400000)
      : null;

    const dueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7;
    const overdue = daysUntil !== null && daysUntil < 0;

    return {
      id: bid.bidVersionId,
      title: bid.projectName ?? 'Untitled Bid',
      subtitle: [bid.clientGC, bid.island].filter(Boolean).join(' · '),
      accentColor: style.accentColor,
      badge: {
        label: bid.status ?? 'Draft',
        color: style.color,
        bg: style.bg,
      },
      meta: (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
          {bid.estimator && (
            <span style={{ color: '#4338ca', fontWeight: 600 }}>→ {bid.estimator}</span>
          )}
          {bidDate && (
            <span style={{
              color: overdue ? '#dc2626' : dueSoon ? '#ea580c' : '#94a3b8',
              fontWeight: (overdue || dueSoon) ? 700 : 400,
            }}>
              {overdue ? 'OVERDUE' : dueSoon ? `${daysUntil}d left` : bidDate}
            </span>
          )}
        </div>
      ),
      rightContent: amount ? (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            {amount}
          </div>
          {bid.version && (
            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>v{bid.version}</div>
          )}
        </div>
      ) : undefined,
      onClick: () => {
        setSelectedBid(bid);
        setActiveTab('overview');
      },
    };
  });

  // ─── Workspace mode ───────────────────────────────────────────────────────

  if (selectedBid) {
    const tabsWithBadges = WORKSPACE_TABS.map(tab => ({
      ...tab,
      // Placeholder tabs get a "P2" badge
      badge: ['carls', 'takeoff', 'estimate', 'quotes', 'gaps', 'proposal', 'gold'].includes(tab.id)
        ? undefined
        : undefined,
    }));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Back bar */}
        <div style={{
          background: '#0f172a',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setSelectedBid(null)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '5px 12px',
              color: 'rgba(148,163,184,0.8)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            ← Bids
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#f8fafc',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {selectedBid.projectName}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.7)', marginTop: 1 }}>
              {[selectedBid.estimator, selectedBid.island, selectedBid.bidDate].filter(Boolean).join(' · ')}
            </div>
          </div>

          {/* Status pipeline — compact in header */}
          <div style={{ flexShrink: 0 }}>
            <StatusPipeline
              stages={PIPELINE_STAGES}
              currentStage={selectedBid.status}
              onAdvance={handleStatusAdvance}
              size="sm"
            />
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <WorkspaceShell
            tabs={tabsWithBadges}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            rightPanel={
              <EstimatingKaiPanel
                bid={selectedBid}
                activeTab={activeTab}
                onBidUpdate={(updates) => {
                  setSelectedBid(prev => prev ? { ...prev, ...updates } : null);
                  setBids(prev => prev.map(b =>
                    b.bidVersionId === selectedBid.bidVersionId ? { ...b, ...updates } : b
                  ));
                }}
              />
            }
          >
            {activeTab === 'overview' && (
              <BidOverviewTab
                bid={selectedBid}
                onBidUpdate={(updates) => {
                  setSelectedBid(prev => prev ? { ...prev, ...updates } : null);
                  setBids(prev => prev.map(b =>
                    b.bidVersionId === selectedBid.bidVersionId ? { ...b, ...updates } : b
                  ));
                }}
                onStatusAdvance={handleStatusAdvance}
              />
            )}
            {activeTab === 'carls' && (
              <CarlsMethodTab
                bid={selectedBid}
              />
            )}
            {activeTab === 'takeoff' && (
              <TakeoffTab bid={selectedBid} />
            )}
            {activeTab !== 'overview' && activeTab !== 'carls' && activeTab !== 'takeoff' && (
              <PlaceholderTab tabId={activeTab} />
            )}
          </WorkspaceShell>
        </div>
      </div>
    );
  }

  // ─── List mode ────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>
            Estimating
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            {bids.length} bids · {bids.filter(b => {
              const s = (b.status ?? '').toLowerCase();
              return s === 'draft' || s === 'active' || s === 'in review';
            }).length} active
          </p>
        </div>
        <button
          onClick={() => setShowNewBidModal(true)}
          style={{
            padding: '9px 20px',
            borderRadius: 999,
            background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
            color: 'white',
            border: 'none',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.06em',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(15,118,110,0.25)',
          }}
        >
          + New Bid
        </button>
      </div>

      {/* New Bid Modal */}
      {showNewBidModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNewBidModal(false)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 32, width: '90%', maxWidth: 520, boxShadow: '0 24px 64px rgba(15,23,42,0.3)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>New Bid</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b', display: 'block', marginBottom: 4 }}>Project Name *</label>
                <input value={newBidDraft.project_name} onChange={e => setNewBidDraft(p => ({ ...p, project_name: e.target.value }))} placeholder="e.g. Hilton Hawaiian Village Alii Tower" autoFocus style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid rgba(20,184,166,0.4)', fontSize: 12, color: '#0f172a', background: 'rgba(240,253,250,0.4)', outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b', display: 'block', marginBottom: 4 }}>Client / GC</label>
                <input value={newBidDraft.client_gc_name} onChange={e => setNewBidDraft(p => ({ ...p, client_gc_name: e.target.value }))} placeholder="Hawaiian Dredging, Hensel Phelps..." style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b', display: 'block', marginBottom: 4 }}>Island</label>
                <select value={newBidDraft.island} onChange={e => setNewBidDraft(p => ({ ...p, island: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const, appearance: 'auto' as const }}>
                  {['Maui','Oahu','Kauai','Hawaii','Molokai','Lanai'].map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b', display: 'block', marginBottom: 4 }}>Bid Due Date</label>
                <input type="date" value={newBidDraft.bid_due_date} onChange={e => setNewBidDraft(p => ({ ...p, bid_due_date: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b', display: 'block', marginBottom: 4 }}>Estimator</label>
                <input value={newBidDraft.estimator} onChange={e => setNewBidDraft(p => ({ ...p, estimator: e.target.value }))} placeholder="Kyle Shimizu" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b', display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea value={newBidDraft.notes} onChange={e => setNewBidDraft(p => ({ ...p, notes: e.target.value }))} placeholder="Products, scope notes..." rows={2} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const, resize: 'none' as const }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowNewBidModal(false)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button
                disabled={newBidSaving || !newBidDraft.project_name.trim()}
                onClick={async () => {
                  setNewBidSaving(true);
                  try {
                    const res = await fetch('/api/estimating/bids', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(newBidDraft),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      setShowNewBidModal(false);
                      setNewBidDraft({ project_name: '', client_gc_name: '', island: 'Maui', job_type: 'Commercial', bid_due_date: '', estimator: '', notes: '' });
                      await loadBids();
                      // Auto-select the new bid
                      const newBid = bids.find(b => b.bidVersionId === data.bid_version_id);
                      if (newBid) { setSelectedBid(newBid); setActiveTab('overview'); }
                    }
                  } catch (err) { console.error('Create bid failed', err); }
                  finally { setNewBidSaving(false); }
                }}
                style={{ padding: '9px 24px', borderRadius: 10, border: 'none', background: newBidDraft.project_name.trim() ? 'linear-gradient(135deg, #0f766e, #14b8a6)' : '#e2e8f0', color: 'white', fontSize: 12, fontWeight: 800, cursor: newBidDraft.project_name.trim() ? 'pointer' : 'default' }}
              >
                {newBidSaving ? 'Creating...' : 'Create Bid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <FilterBar
        chips={FILTER_CHIPS.map(c => ({ ...c, count: chipCounts[c.id] }))}
        activeChip={filter}
        onChipChange={setFilter}
        sortOptions={SORT_OPTIONS}
        sortValue={sort}
        onSortChange={setSort}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search bids..."
        resultCount={filteredBids.length !== bids.length ? filteredBids.length : undefined}
      />

      {/* Card List */}
      <div style={{ marginTop: 12 }}>
        <CardList
          items={cardItems}
          loading={loading}
          emptyMessage="No bids found. Create a new bid to get started."
          columns={2}
        />
      </div>
    </div>
  );
}
