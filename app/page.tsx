'use client';
import { useSession } from 'next-auth/react';
import { ALL_USERS, navSectionsForRole, hiddenItemsForRole, readOnlyViewsForRole, defaultViewForRole } from '@/lib/roles';
import Sidebar from '@/components/Sidebar';
import TodayPanel from '@/components/TodayPanel';
import InboxPanel from '@/components/InboxPanel';
import CalendarPanel from '@/components/CalendarPanel';
import OverviewPanel from '@/components/OverviewPanel';
import EventFeedPanel from '@/components/EventFeedPanel';
import ProjectsPanel from '@/components/ProjectsPanel';
import WarRoomPanel from '@/components/WarRoomPanel';
import IssuesPanel from '@/components/IssuesPanel';
import CrewPanel from '@/components/CrewPanel';
import PMPanel from '@/components/PMPanel';
import SchedulingPanel from '@/components/SchedulingPanel';
import DispatchBoard from '@/components/DispatchBoard';
import CostPanel from '@/components/CostPanel';
import AssetsPanel from '@/components/AssetsPanel';
import BidIntakePanel from '@/components/BidIntakePanel';
import BidQueuePanel from '@/components/BidQueuePanel';
import EstimatorWorkspace from '@/components/EstimatorWorkspace';
import EstimatingWorkspace from '@/components/estimating/EstimatingWorkspace';
import ServicePanel from '@/components/ServicePanel';
import CustomersPanel from '@/components/CustomersPanel';
import OrganizationsPanel from '@/components/OrganizationsPanel';
import KaiPanel from '@/components/KaiPanel';
import KaiFloat from '@/components/KaiFloat';
import OrgChartPanel from '@/components/OrgChartPanel';
import AdminPanel from '@/components/AdminPanel';
import OnboardingFlow from '@/components/OnboardingFlow';
import SuggestionButton from '@/components/SuggestionButton';
import StepLibraryPanel from '@/components/StepLibraryPanel';
import SuperSchedulingPanel from '@/components/SuperSchedulingPanel';
import { useState, useEffect } from 'react';

export type AppView =
  | 'Today' | 'Inbox' | 'Calendar'
  | 'Overview' | 'Forecasting' | 'Scheduling' | 'Dispatch Board' | 'Schedule' | 'Event Feed' | 'Issues'
  | 'Projects' | 'Schedules' | 'Submittals' | 'Budget' | 'Change Orders'
  | 'Crew' | 'Customers' | 'Assets' | 'Org Chart'
  | 'Bid Intake' | 'Bid Queue' | 'My Bids' | 'Estimating Workspace'
  | 'Work Orders'
  | 'War Room' | 'Cost & Usage'
  | 'WIP Report' | 'Financials' | 'Vendors' | 'Compliance' | 'HR' | 'Safety' | 'Fleet'
  | 'Step Library';
// ── App ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeView, setActiveView] = useState<AppView>('Today');
  const [focusWoId, setFocusWoId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { data: authSession } = useSession();
  const [demoUser, setDemoUser] = useState('Sean Daniels');
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Auto-detect logged-in user from Google auth session
  useEffect(() => {
    if (authSession?.user?.email) {
      const email = authSession.user.email.toLowerCase();
      const match = ALL_USERS.find(u => u.email === email);
      if (match) {
        setDemoUser(match.name);
        window.localStorage.setItem('banyan_demo_user', match.name);
      }
    }
  }, [authSession]);

  useEffect(() => {
    // Check if user has completed onboarding
    const onboarded = localStorage.getItem('banyan_onboarded');
    if (!onboarded) setShowOnboarding(true);
  }, []);
  const [projectsList, setProjectsList] = useState<{kID:string;name:string}[]>([]);

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setProjectsList(d.map((p: Record<string,string>) => ({ kID: p.kID, name: p.name || p.project_name || '' })));
    }).catch(() => {});
  }, []);

  const demoUserObj = ALL_USERS.find(u => u.name === demoUser) || ALL_USERS[0];
  const visibleSections  = navSectionsForRole(demoUserObj.role);
  const hiddenItems      = hiddenItemsForRole(demoUserObj.role);
  const readOnlyViews    = readOnlyViewsForRole(demoUserObj.role);
  const isReadOnly       = (view: AppView) => readOnlyViews.includes(view);

  function handleUserChange(name: string) {
    setDemoUser(name);
    if (typeof window !== 'undefined') window.localStorage.setItem('banyan_demo_user', name);
    const u = ALL_USERS.find(x => x.name === name);
    if (u) setActiveView(defaultViewForRole(u.role) as AppView);
  }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  function handleSelect(view: AppView) {
    setActiveView(view);
    if (isMobile) setMobileOpen(false);
  }

  const sidebarProps = {
    activeView,
    onSelect: handleSelect,
    collapsed,
    onToggle: () => setCollapsed(c => !c),
    demoUser,
    onUserChange: handleUserChange,
    visibleSections,
    hiddenItems,
    allUsers: ALL_USERS,
    sessionEmail: authSession?.user?.email || '',
  };

  return (
    <div style={{ display: 'flex', height: '100dvh', background: '#f8fafc', overflow: 'hidden', fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif' }}>

      {/* Onboarding overlay */}
      {showOnboarding && (
        <OnboardingFlow
          userRole={demoUserObj.role}
          onComplete={() => setShowOnboarding(false)}
          userName={demoUser}
        />
      )}

      {/* Sidebar — desktop */}
      {!isMobile && <Sidebar {...sidebarProps} />}

      {/* Sidebar — mobile slide-over */}
      {isMobile && mobileOpen && (
        <>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 40 }} />
          <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 50, width: 260 }}>
            <Sidebar {...sidebarProps} />
          </div>
        </>
      )}

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', position: 'relative', minWidth: 0 }}>
        {/* Mobile header */}
        {isMobile && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 30,
            background: 'linear-gradient(180deg, #071722 0%, #0c2330 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <button onClick={() => setMobileOpen(true)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 10px', color: 'rgba(148,163,184,0.7)', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>
              ☰
            </button>
            <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em', color: '#f8fafc' }}>
              Banyan<span style={{ color: '#14b8a6' }}>OS</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,184,166,0.7)' }}>
              {demoUser.split(' ')[0]}
            </div>
          </div>
        )}

        {activeView === 'Today'         && <TodayPanel onNavigate={(view) => setActiveView(view as AppView)} />}
        {activeView === 'Inbox'         && <InboxPanel />}
        {activeView === 'Calendar'      && <CalendarPanel />}
        {activeView === 'Overview'      && <OverviewPanel />}
        {activeView === 'Event Feed'    && <EventFeedPanel />}
        {activeView === 'Projects'      && <ProjectsPanel onNavigate={(view) => setActiveView(view as AppView)} />}
        {activeView === 'Issues'        && <IssuesPanel />}
        {activeView === 'Crew'          && <CrewPanel />}

        {activeView === 'Bid Queue'           && <BidQueuePanel />}
        {activeView === 'Estimating Workspace' && <EstimatingWorkspace />}
        {activeView === 'Bid Intake'    && <BidIntakePanel />}
        {activeView === 'My Bids'       && <EstimatorWorkspace currentUser={demoUser} />}
        {activeView === 'Work Orders'   && <ServicePanel readOnly={isReadOnly('Work Orders')} focusWoId={focusWoId} />}
        {activeView === 'Customers'     && <OrganizationsPanel onNavigate={(section, params) => {
          if (section === 'workorders' && params?.woId) {
            setFocusWoId(params.woId);
            setActiveView('Work Orders');
            // Clear after 1s so re-clicking same WO works
            setTimeout(() => setFocusWoId(null), 1000);
          }
        }} />}
        {activeView === 'Assets'        && <AssetsPanel />}
        {activeView === 'Org Chart'     && <OrgChartPanel />}
        {activeView === 'Forecasting'   && <SuperSchedulingPanel />}
        {activeView === 'Scheduling'     && <SuperSchedulingPanel />}
        {activeView === 'Dispatch Board'&& <DispatchBoard />}
        {activeView === 'Schedule'        && <DispatchBoard />}
        {activeView === 'Cost & Usage'  && <CostPanel />}
        {activeView === 'War Room'      && <WarRoomPanel />}
        {activeView === 'WIP Report'    && <AdminPanel section="wip" />}
        {activeView === 'Financials'    && <AdminPanel section="financials" />}
        {activeView === 'Vendors'       && <AdminPanel section="vendors" />}
        {activeView === 'Compliance'    && <AdminPanel section="compliance" />}
        {activeView === 'HR'            && <AdminPanel section="hr" />}
        {activeView === 'Safety'        && <AdminPanel section="safety" />}
        {activeView === 'Fleet'         && <AdminPanel section="fleet" />}
        {activeView === 'Step Library'   && <StepLibraryPanel />}

        <KaiFloat activeView={activeView} sessionEmail={authSession?.user?.email || ''} />
        <SuggestionButton />
      </main>
    </div>
  );
}
