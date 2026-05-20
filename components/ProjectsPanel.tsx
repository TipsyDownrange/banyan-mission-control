'use client';
import { useEffect, useState, useCallback } from 'react';
import DashboardHeader, { KPI, ActionItem } from './DashboardHeader';
import WorkBreakdown from '@/components/shared/WorkBreakdown';
import ProjectMatrixView from '@/components/shared/ProjectMatrixView';
import ActivityTimeline from '@/components/ActivityTimeline';
import BuildQueuePlaceholder from '@/components/BuildQueuePlaceholder';
import PayAppsTab from '@/components/engagements/PayAppsTab';
import PunchListTab from '@/components/engagements/PunchListTab';
import TMTicketsTab from '@/components/engagements/TMTicketsTab';
import SubmittalsTab from '@/components/engagements/SubmittalsTab';
import RfisTab from '@/components/engagements/RfisTab';
import VerbalAgreementsTab from '@/components/engagements/VerbalAgreementsTab';
import MeetingsTab from '@/components/engagements/MeetingsTab';
import ActionItemsTab from '@/components/engagements/ActionItemsTab';
import DocumentsTab from '@/components/engagements/DocumentsTab';
import HandoffTab from '@/components/engagements/HandoffTab';
import ProjectOverview from '@/components/engagements/ProjectOverview';
import ScheduleTab from '@/components/schedule/ScheduleTab';
import { normalizeProjectIsland } from '@/lib/schedule/normalize-project-island';
import WarrantyClaimCaptureForm from '@/components/closeout/WarrantyClaimCaptureForm';
import { formatCurrency, summarizeSOV } from '@/lib/pm/sov-summary';
import { useSession } from 'next-auth/react';

type Project = {
  kID: string; name: string; status: string; pm: string; super: string;
  island: string; eventCount: number; issues: number;
};
type WorkRecordProject = { work_record_id: string; kid: string; name: string; status: string; assigned_user_id?: string | null; created_at?: string };
type Submittal = Record<string, string>;
type VerbalAgreement = Record<string, string>;
type CO = Record<string, string>;
type SOVLine = Record<string, string>;
type InstallSummary = { kID: string; totalSteps: number; completedSteps: number; pctComplete: number; qcPassRate: number };

const ISLAND_COLOR: Record<string, string> = { Oahu: '#0369a1', Maui: 'var(--bos-color-brand-primary-deep)', Kauai: '#6d28d9', Hawaii: '#92400e' };

interface Props { onNavigate?: (view: string, params?: Record<string, string>) => void; }

// ─── Project Card ────────────────────────────────────────────
function ProjectCard({ project, submittals, cos, install, onClick }: {
  project: Project;
  submittals: Submittal[];
  cos: CO[];
  install?: InstallSummary;
  onClick: () => void;
}) {
  const openSubs = submittals.filter(s => !s.status || ['SUBMITTED','UNDER_REVIEW','PENDING','REVISE_RESUBMIT'].includes(s.status)).length;
  const pendingCOs = cos.filter(c => ['PENDING','IDENTIFIED','SUBMITTED','IN_NEGOTIATION','DRAFT'].includes(c.status || '')).length;
  const coExposure = cos.filter(c => ['PENDING','IDENTIFIED','SUBMITTED','IN_NEGOTIATION'].includes(c.status || '')).reduce((s, c) => s + (parseFloat(c.amount_requested) || 0), 0);
  const installPct = install?.pctComplete ?? null;

  return (
    <button onClick={onClick} style={{
      background: 'white', borderRadius: 18, border: '1.5px solid #e2e8f0',
      boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: 0, cursor: 'pointer',
      textAlign: 'left', width: '100%', overflow: 'hidden', transition: 'box-shadow 0.15s',
    }}>
      {/* Color bar */}
      <div style={{ height: 4, background: ISLAND_COLOR[project.island] || 'var(--bos-color-ink-disabled)' }} />
      
      <div style={{ padding: '16px 20px' }}>
        {/* Header: name + island badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-ink-primary)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
              {project.kID} · PM: {project.pm?.split(' ')[0] || '—'}
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 999, flexShrink: 0,
            color: ISLAND_COLOR[project.island] || 'var(--bos-color-ink-disabled)',
            background: `${ISLAND_COLOR[project.island] || 'var(--bos-color-ink-disabled)'}12`,
            border: `1px solid ${ISLAND_COLOR[project.island] || 'var(--bos-color-ink-disabled)'}33`,
          }}>
            {project.island}
          </span>
        </div>

        {/* KPI grid on the card */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: openSubs > 0 ? '#d97706' : '#059669' }}>{openSubs}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Submittals</div>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: pendingCOs > 0 ? '#d97706' : '#059669' }}>{pendingCOs}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chg Orders</div>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: project.issues > 0 ? '#dc2626' : '#059669' }}>{project.issues}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issues</div>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: installPct !== null ? (installPct >= 75 ? '#059669' : '#d97706') : 'var(--bos-color-ink-tertiary)' }}>
              {installPct !== null ? `${installPct}%` : '—'}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Install</div>
          </div>
        </div>

        {/* CO exposure if any */}
        {coExposure > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fffbeb', padding: '4px 10px', borderRadius: 8, display: 'inline-block' }}>
            ${(coExposure / 1000).toFixed(0)}K CO exposure
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Project Workspace (full detail) ─────────────────────────
function ProjectWorkspace({ project, onClose }: { project: Project; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview'|'submittals'|'rfis'|'verbal-agreements'|'meetings'|'action-items'|'documents'|'handoff'|'cos'|'pay-apps'|'tm-tickets'|'punch-list'|'schedule'|'budget'|'work-breakdown'|'matrix'|'warranty'|'activity'>('overview');
  const [showNewClaimModal, setShowNewClaimModal] = useState(false);
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? 'none';
  const SCHEDULE_WRITE_ROLES = new Set(['pm', 'business_admin', 'super_admin']);
  const canWriteSchedule = SCHEDULE_WRITE_ROLES.has(role);
  const [submittals, setSubmittals] = useState<Submittal[]>([]);
  const [rfis, setRfis] = useState<Record<string, string>[]>([]);
  const [verbalAgreements, setVerbalAgreements] = useState<VerbalAgreement[]>([]);
  const [meetings, setMeetings] = useState<Record<string, unknown>[]>([]);
  const [actionItemsSummary, setActionItemsSummary] = useState<{ total: number; open_count: number }>({ total: 0, open_count: 0 });
  const [documentsSummary, setDocumentsSummary] = useState<{ total: number; current_count: number }>({ total: 0, current_count: 0 });
  const [cos, setCos] = useState<CO[]>([]);
  const [sovLines, setSovLines] = useState<SOVLine[]>([]);
  const [install, setInstall] = useState<{ items: Record<string, string>[]; summary: InstallSummary[] }>({ items: [], summary: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/pm/submittals?kID=${project.kID}`).then(r => r.json()).catch(() => ({ submittals: [] })),
      fetch(`/api/pm/rfi?kID=${project.kID}`).then(r => r.json()).catch(() => ({ rfis: [] })),
      fetch(`/api/verbal-agreements/by-kid/${encodeURIComponent(project.kID)}`).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/meetings/by-kid/${encodeURIComponent(project.kID)}`).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/action-items/by-kid/${encodeURIComponent(project.kID)}`).then(r => r.json()).catch(() => ({ items: [], summary: { total: 0, open_count: 0 } })),
      fetch(`/api/documents/by-kid/${encodeURIComponent(project.kID)}`).then(r => r.json()).catch(() => ({ items: [], summary: { total: 0, current_count: 0 } })),
      fetch(`/api/pm/change-orders?kID=${project.kID}`).then(r => r.json()).catch(() => ({ cos: [] })),
      fetch(`/api/pm/sov?kID=${project.kID}`).then(r => r.json()).catch(() => ({ sov: [] })),
      fetch(`/api/install?kID=${project.kID}`).then(r => r.json()).catch(() => ({ items: [], summary: [] })),
    ]).then(([sData, rData, vaData, mData, aiData, dData, cData, sovData, iData]) => {
      setSubmittals(sData.submittals || []);
      setRfis(rData.rfis || []);
      setVerbalAgreements(vaData.items || []);
      setMeetings(mData.items || []);
      setActionItemsSummary({
        total: aiData.summary?.total ?? 0,
        open_count: aiData.summary?.open_count ?? 0,
      });
      setDocumentsSummary({
        total: dData.summary?.total ?? 0,
        current_count: dData.summary?.current_count ?? 0,
      });
      setCos(cData.cos || []);
      setSovLines(sovData.sov || []);
      setInstall(iData);
      setLoading(false);
    });
  }, [project.kID]);

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'submittals', label: `Submittals (${submittals.length})` },
    { key: 'rfis', label: `RFIs (${rfis.length})` },
    { key: 'verbal-agreements', label: `Verbal Agreements (${verbalAgreements.length})` },
    { key: 'meetings', label: `Meetings (${meetings.length})` },
    { key: 'action-items', label: `Action Items (${actionItemsSummary.open_count}/${actionItemsSummary.total})` },
    { key: 'documents', label: `Documents (${documentsSummary.current_count})` },
    { key: 'handoff', label: 'Handoff' },
    { key: 'cos', label: `Change Orders (${cos.length})` },
    { key: 'pay-apps', label: 'Pay Apps' },
    { key: 'tm-tickets', label: 'T&M Tickets' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'budget', label: 'Budget' },
    { key: 'work-breakdown', label: `Work Breakdown (${install.items?.length || 0})` },
    { key: 'matrix', label: 'Matrix View' },
    { key: 'punch-list', label: 'Punch List' },
    { key: 'warranty', label: 'Warranty' },
    { key: 'activity', label: `Activity (${project.eventCount})` },
  ] as const;

  const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
    APPROVED: { bg: '#f0fdfa', color: 'var(--bos-color-brand-primary-deep)' },
    SUBMITTED: { bg: '#eff6ff', color: '#1d4ed8' },
    PENDING: { bg: '#f8fafc', color: 'var(--bos-color-ink-disabled)' },
    REJECTED: { bg: '#fef2f2', color: '#b91c1c' },
    REVISE_RESUBMIT: { bg: '#fffbeb', color: '#92400e' },
    UNDER_REVIEW: { bg: '#eff6ff', color: '#1d4ed8' },
    IDENTIFIED: { bg: '#fffbeb', color: '#92400e' },
    IN_NEGOTIATION: { bg: '#fffbeb', color: '#92400e' },
  };

  const statusTag = (status: string) => {
    const s = STATUS_COLOR[status] || { bg: '#f8fafc', color: 'var(--bos-color-ink-disabled)' };
    return <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.color}22` }}>{(status || 'PENDING').replace(/_/g, ' ')}</span>;
  };

  const sovSummary = summarizeSOV(sovLines);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(15,23,42,0.5)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 1100, height: '100%', background: '#f8fafc', overflowY: 'auto', boxShadow: '0 0 40px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #071722, #0c2330)', padding: '20px 28px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(20,184,166,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{project.kID}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.03em', marginTop: 4 }}>{project.name}</div>
              <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.7)', marginTop: 4 }}>
                PM: {project.pm || '—'} · {project.island} · {project.eventCount} events
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 16px', color: 'var(--bos-color-ink-tertiary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              ← Back
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginTop: 16, overflowX: 'auto' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key as typeof activeTab)}
                style={{
                  padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: activeTab === t.key ? 'rgba(20,184,166,0.15)' : 'transparent',
                  color: activeTab === t.key ? '#5eead4' : 'rgba(148,163,184,0.6)',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(20,184,166,0.2)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <ProjectOverview
                  project={{ kID: project.kID, name: project.name, pm: project.pm, island: project.island }}
                  onNavigateTab={(tab) => setActiveTab(tab as typeof activeTab)}
                />
              )}

              {activeTab === 'submittals' && (
                <SubmittalsTab kID={project.kID} />
              )}

              {activeTab === 'rfis' && (
                <RfisTab kID={project.kID} />
              )}

              {activeTab === 'verbal-agreements' && (
                <VerbalAgreementsTab kID={project.kID} />
              )}

              {activeTab === 'meetings' && (
                <MeetingsTab kID={project.kID} />
              )}

              {activeTab === 'action-items' && (
                <ActionItemsTab kID={project.kID} />
              )}

              {activeTab === 'documents' && (
                <DocumentsTab kID={project.kID} />
              )}

              {activeTab === 'handoff' && (
                <HandoffTab kID={project.kID} />
              )}

              {activeTab === 'cos' && (
                <div>
                  {cos.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)' }}>No change orders for this project yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {cos.map((c, i) => (
                        <div key={i} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink-primary)' }}>{c.title || `CO #${c.co_number}`}</div>
                            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
                              #{c.co_number} {c.amount_requested ? `· $${parseFloat(c.amount_requested).toLocaleString()}` : ''}
                            </div>
                          </div>
                          {statusTag(c.status)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pay-apps' && (
                <PayAppsTab kID={project.kID} />
              )}

              {activeTab === 'tm-tickets' && (
                <TMTicketsTab kID={project.kID} />
              )}

              {activeTab === 'punch-list' && (
                <PunchListTab kID={project.kID} />
              )}

              {activeTab === 'schedule' && (
                <ScheduleTab
                  kID={project.kID}
                  canWrite={canWriteSchedule}
                  projectIsland={normalizeProjectIsland(project.island)}
                />
              )}

              {activeTab === 'budget' && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)' }}>
                  Budget data will be available once Schedule of Values is populated for this project.
                </div>
              )}


              {activeTab === 'work-breakdown' && (
                <WorkBreakdown jobId={project.kID} jobType="project" />
              )}

              {activeTab === 'matrix' && (
                <ProjectMatrixView jobId={project.kID} />
              )}

              {activeTab === 'warranty' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{
                    background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
                    padding: '14px 18px', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: 12,
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-ink-primary)' }}>
                        Warranty registry
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)', marginTop: 2 }}>
                        Inbound claim capture, triage, and resolution per Closeout v1.1 §8.x.
                      </div>
                    </div>
                    <button
                      onClick={() => setShowNewClaimModal(true)}
                      data-testid="new-warranty-claim-trigger"
                      style={{
                        padding: '8px 16px', borderRadius: 10, border: 'none',
                        background: 'var(--bos-color-brand-primary-deep)', color: 'white', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + New warranty claim
                    </button>
                  </div>
                  <div style={{
                    padding: '16px 20px', borderRadius: 12, background: '#f8fafc',
                    border: '1px solid #e2e8f0', color: 'var(--bos-color-ink-disabled)', fontSize: 13,
                  }}>
                    Warranty record + claim listing for this engagement will populate once the
                    listing endpoint ships. Use <strong>+ New warranty claim</strong> above to
                    capture inbound claims against a known warranty_id.
                  </div>
                </div>
              )}

              {activeTab === 'activity' && (
                <ActivityTimeline kID={project.kID} />
              )}
            </>
          )}
        </div>

        {showNewClaimModal && (
          <div
            data-testid="new-warranty-claim-modal"
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 200, padding: 16,
            }}
            onClick={() => setShowNewClaimModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#f8fafc', borderRadius: 16, padding: 20,
                maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)' }}>
                  New warranty claim
                </div>
                <button
                  onClick={() => setShowNewClaimModal(false)}
                  style={{
                    background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
                    padding: '6px 12px', fontSize: 12, fontWeight: 700, color: 'var(--bos-color-ink-disabled)',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
              <WarrantyClaimCaptureForm
                warranties={[]}
                onCreated={() => setShowNewClaimModal(false)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────
export default function ProjectsPanel({ onNavigate }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [submittals, setSubmittals] = useState<Submittal[]>([]);
  const [cos, setCos] = useState<CO[]>([]);
  const [installSummary, setInstallSummary] = useState<InstallSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [workRecordProjects, setWorkRecordProjects] = useState<WorkRecordProject[]>([]);
  const [filterIsland, setFilterIsland] = useState('All');
  const [filterPM, setFilterPM] = useState('All');
  const [showHistorical, setShowHistorical] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/work-records?work_type=project&limit=100').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/pm/submittals').then(r => r.json()).catch(() => ({ submittals: [] })),
      fetch('/api/pm/change-orders').then(r => r.json()).catch(() => ({ cos: [] })),
      fetch('/api/install').then(r => r.json()).catch(() => ({ summary: [] })),
    ]).then(([pData, wrData, sData, cData, iData]) => {
      setProjects(pData.projects || []);
      setWorkRecordProjects(wrData.data || []);
      setSubmittals(sData.submittals || []);
      setCos(cData.cos || []);
      setInstallSummary(iData.summary || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Filters
  const filtered = projects.filter(p => {
    if (filterIsland !== 'All' && p.island !== filterIsland) return false;
    if (filterPM !== 'All' && !p.pm?.includes(filterPM)) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.kID.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const islands = ['All', ...new Set(projects.map(p => p.island).filter(Boolean))];
  const pms = ['All', ...new Set(projects.map(p => p.pm?.split(' ')[0]).filter(Boolean))];

  // KPIs
  const totalIssues = projects.reduce((s, p) => s + p.issues, 0);
  const byIsland = projects.reduce((acc, p) => { acc[p.island] = (acc[p.island] || 0) + 1; return acc; }, {} as Record<string, number>);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(20,184,166,0.2)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--bos-color-ink-tertiary)', marginBottom: 6 }}>Projects</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--color-ink-primary)', margin: 0 }}>
            {showHistorical ? 'All Projects' : 'Active Projects'}
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowHistorical(false)}
              style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, border: !showHistorical ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0', background: !showHistorical ? 'rgba(240,253,250,0.96)' : 'white', color: !showHistorical ? 'var(--bos-color-brand-primary-deep)' : 'var(--bos-color-ink-disabled)', cursor: 'pointer' }}>
              Active
            </button>
            <button onClick={() => setShowHistorical(true)}
              style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, border: showHistorical ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0', background: showHistorical ? 'rgba(240,253,250,0.96)' : 'white', color: showHistorical ? 'var(--bos-color-brand-primary-deep)' : 'var(--bos-color-ink-disabled)', cursor: 'pointer' }}>
              Historical
            </button>
          </div>
        </div>
      </div>

      {/* Interactive KPI bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {islands.map(isl => (
          <button key={isl} onClick={() => setFilterIsland(isl)}
            style={{
              padding: '8px 16px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: filterIsland === isl ? `1.5px solid ${ISLAND_COLOR[isl] || 'var(--bos-color-brand-primary-deep)'}` : '1.5px solid #e2e8f0',
              background: filterIsland === isl ? `${ISLAND_COLOR[isl] || 'var(--bos-color-brand-primary-deep)'}10` : 'white',
              color: filterIsland === isl ? (ISLAND_COLOR[isl] || 'var(--bos-color-brand-primary-deep)') : 'var(--bos-color-ink-disabled)',
            }}>
            {isl} {isl !== 'All' && <span style={{ fontWeight: 800 }}>({byIsland[isl] || 0})</span>}
          </button>
        ))}
        <div style={{ width: 1, background: '#e2e8f0', margin: '0 4px' }} />
        {pms.filter(p => p !== 'All' || filterPM !== 'All').map(pm => (
          <button key={pm} onClick={() => setFilterPM(pm)}
            style={{
              padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: filterPM === pm ? '1.5px solid var(--bos-color-brand-primary-deep)' : '1.5px solid #e2e8f0',
              background: filterPM === pm ? 'rgba(15,118,110,0.08)' : 'white',
              color: filterPM === pm ? 'var(--bos-color-brand-primary-deep)' : 'var(--bos-color-ink-disabled)',
            }}>
            {pm}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text" placeholder="Search projects..." value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '12px 18px', borderRadius: 14, border: '1.5px solid #e2e8f0', fontSize: 14, marginBottom: 16, outline: 'none', background: 'white', boxSizing: 'border-box' }}
      />

      <section style={{ marginBottom: 18, padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 8px 22px rgba(15,23,42,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' }}>BG1 Work Records</div>
            <div style={{ fontSize: 13, color: 'var(--bos-color-ink-disabled)', marginTop: 2 }}>Read-only project records from Postgres (`work_records where work_type='project'`).</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>{workRecordProjects.length} records</span>
        </div>
        {workRecordProjects.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--bos-color-ink-tertiary)' }}>No BG1 project work records yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {workRecordProjects.slice(0, 12).map(wr => (
              <div key={wr.work_record_id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 100px', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #eef2f7' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--bos-color-ink-disabled)' }}>{wr.kid}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-ink-primary)' }}>{wr.name}</div>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' }}>{wr.status}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Project Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {filtered.map(p => (
          <ProjectCard
            key={p.kID}
            project={p}
            submittals={submittals.filter(s => s.kID === p.kID)}
            cos={cos.filter(c => c.kID === p.kID)}
            install={installSummary.find(i => i.kID === p.kID)}
            onClick={() => setSelectedProject(p)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)' }}>No projects match your filters</div>
      )}

      {/* Project Workspace Overlay */}
      {selectedProject && (
        <ProjectWorkspace project={selectedProject} onClose={() => setSelectedProject(null)} />
      )}
    </div>
  );
}
