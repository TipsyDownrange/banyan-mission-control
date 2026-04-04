'use client';
import Sidebar from '@/components/Sidebar';
import TodayPanel from '@/components/TodayPanel';
import InboxPanel from '@/components/InboxPanel';
import CalendarPanel from '@/components/CalendarPanel';
import OverviewPanel from '@/components/OverviewPanel';
import EventFeedPanel from '@/components/EventFeedPanel';
import ProjectsPanel from '@/components/ProjectsPanel';
import IssuesPanel from '@/components/IssuesPanel';
import CrewPanel from '@/components/CrewPanel';
import PMPanel from '@/components/PMPanel';
import SchedulingPanel from '@/components/SchedulingPanel';
import DispatchBoard from '@/components/DispatchBoard';
import TaskBoardPanel from '@/components/TaskBoardPanel';
import ApprovalsPanel from '@/components/ApprovalsPanel';
import CostPanel from '@/components/CostPanel';
import CronPanel from '@/components/CronPanel';
import AssetsPanel from '@/components/AssetsPanel';
import BidIntakePanel from '@/components/BidIntakePanel';
import BidQueuePanel from '@/components/BidQueuePanel';
import EstimatorWorkspace from '@/components/EstimatorWorkspace';
import ServicePanel from '@/components/ServicePanel';
import CustomersPanel from '@/components/CustomersPanel';
import KaiPanel from '@/components/KaiPanel';
import KaiFloat from '@/components/KaiFloat';
import OrgChartPanel from '@/components/OrgChartPanel';
import { useState, useEffect } from 'react';

export type AppView =
  | 'Today' | 'Inbox' | 'Calendar'
  | 'Overview' | 'Forecasting' | 'Dispatch Board' | 'Event Feed' | 'Issues'
  | 'Projects' | 'Schedules' | 'Submittals' | 'Budget' | 'Change Orders'
  | 'Crew' | 'Customers' | 'Assets' | 'Org Chart'
  | 'Bid Intake' | 'Bid Queue' | 'My Bids'
  | 'Work Orders'
  | 'Task Board' | 'Approvals' | 'Workflows' | 'Cost & Usage';

// ── Full org user list ────────────────────────────────────────────────────────
export const ALL_USERS: { name: string; role: string; group: string }[] = [
  { name: 'Jody Boeringa',            role: 'owner',      group: 'Leadership' },
  { name: 'Sean Daniels',             role: 'gm',         group: 'Leadership' },
  { name: 'Frank Redondo',            role: 'pm',         group: 'PM / Estimating' },
  { name: 'Kyle Shimizu',             role: 'estimator',  group: 'PM / Estimating' },
  { name: 'Jenny Shimabukuro',        role: 'estimator',  group: 'PM / Estimating' },
  { name: 'Joey Ritthaler',           role: 'service_pm', group: 'PM / Estimating' },
  { name: 'Mark Olson',               role: 'sales',      group: 'Sales / Admin — Remote' },
  { name: 'Tia Omura',                role: 'admin',      group: 'Sales / Admin' },
  { name: 'Jenna Nakama',             role: 'admin',      group: 'Sales / Admin' },
  { name: 'Sherilynn Takuchi',        role: 'admin',      group: 'Sales / Admin' },
  { name: 'Karl Nakamura Sr.',        role: 'super',      group: 'Field — Oahu' },
  { name: 'Nate Nakamura',            role: 'super',      group: 'Field — Maui' },
  { name: 'Karl Nakamura Jr.',        role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Thomas Begonia',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Jay Castillo',             role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Nolan Lagmay',             role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Francis Lynch',            role: 'glazier',    group: 'Field — Oahu' },
  { name: 'James Nakamura',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Timothy Stitt',            role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Wendall Tavares',          role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Deric Valoroso',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Sonny Ah Kui',             role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Lewis Roman',              role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Christian Altman',         role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Ninja Thang',              role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Malu Cleveland',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Layton Domingo',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Wena Hun',                 role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Santia-Jacob Pascual',     role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Chachleigh Clarabal',      role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Elijah-David Meheula-Lando', role: 'glazier', group: 'Field — Oahu' },
  { name: 'Nathan Nakamura',          role: 'glazier',    group: 'Field — Maui' },
  { name: 'Mark Villados',            role: 'glazier',    group: 'Field — Maui' },
  { name: 'Tyler Niemeyer',           role: 'glazier',    group: 'Field — Maui' },
  { name: 'Tyson Omura',              role: 'glazier',    group: 'Field — Maui' },
  { name: 'Owen Nakamura',            role: 'glazier',    group: 'Field — Maui' },
  { name: 'Holden Ioanis',            role: 'glazier',    group: 'Field — Maui' },
  { name: 'Quintin Castro-Perry',     role: 'glazier',    group: 'Field — Maui' },
  { name: 'Silas Macon',              role: 'glazier',    group: 'Field — Kauai' },
  { name: 'Mien-Quoc Ly',             role: 'glazier',    group: 'Field — Kauai' },
  { name: 'Lonnie McKenzie',          role: 'glazier',    group: 'Field — Kauai' },
  { name: 'Joshua Moore',             role: 'glazier',    group: 'Field — Kauai' },
  { name: 'Troy Sliter',              role: 'glazier',    group: 'Field — Kauai' },
];

// ── Nav visibility per role ──────────────────────────────────────────────────
//
// Sections: Assistant | Operations | Projects | People & Assets |
//           Estimating | Service | AI Command
//
// Items that are view-only for certain roles are controlled in the panel itself
// (we pass a readOnly prop). The section visibility here controls whether the
// nav item appears at all.

export function navSectionsForRole(role: string): string[] {
  switch (role) {
    case 'owner':
    case 'gm':
      // Sean + Jody: everything
      return ['Assistant', 'Operations', 'Projects', 'People & Assets', 'Estimating', 'Service', 'AI Command'];

    case 'pm':
      // Frank: no Estimating, no AI Command; WOs are view-only (controlled in panel)
      return ['Assistant', 'Operations', 'Projects', 'People & Assets', 'Service'];

    case 'estimator':
      // Kyle + Jenny: no Operations (except Overview — handled below), Projects view-only
      return ['Assistant', 'Operations', 'Projects', 'People & Assets', 'Estimating'];

    case 'service_pm':
      // Joey: Dispatch Board + Forecasting in Operations, full WO control
      return ['Assistant', 'Operations', 'Service', 'People & Assets'];

    case 'sales':
      // Mark: Estimating to see bid queue, People & Assets
      return ['Assistant', 'Estimating', 'People & Assets'];

    case 'admin':
      // Tia, Jenna, Sherilynn: Assistant + People
      return ['Assistant', 'People & Assets'];

    case 'super':
      // Karl Sr. + Nate: Overview (view), Dispatch Board (control), Forecasting (view)
      // Service WOs view-only
      return ['Assistant', 'Operations', 'Service', 'People & Assets'];

    case 'glazier':
      // Field crew: Today + Org Chart only
      return ['Assistant', 'People & Assets'];

    default:
      return ['Assistant'];
  }
}

// Items hidden per role within a visible section
export function hiddenItemsForRole(role: string): AppView[] {
  switch (role) {
    case 'estimator':
      // Can see Overview but not Forecasting, Dispatch, Event Feed, Issues
      // Can't see Dispatch or scheduling tools
      return ['Forecasting', 'Dispatch Board', 'Event Feed', 'Issues'];
    case 'super':
      // Supers: no Event Feed, Issues, or Forecasting write (still visible — control in panel)
      return ['Event Feed', 'Issues'];
    case 'glazier':
      // Only Today/Calendar from Assistant; only Org Chart from People & Assets
      return ['Inbox', 'Crew', 'Customers', 'Assets'];
    case 'admin':
      // Admin sees People & Assets but not Org Chart... actually they should see it
      return [];
    default:
      return [];
  }
}

// Read-only views per role (panel renders view-only mode)
export function readOnlyViewsForRole(role: string): AppView[] {
  switch (role) {
    case 'pm':        return ['Work Orders', 'Schedules', 'Submittals', 'Budget', 'Change Orders'];
    case 'estimator': return ['Projects', 'Schedules', 'Submittals', 'Budget', 'Change Orders', 'Overview'];
    case 'super':     return ['Work Orders', 'Overview', 'Forecasting'];
    default:          return [];
  }
}

function defaultViewForRole(role: string): AppView {
  if (role === 'glazier')    return 'Today';
  if (role === 'estimator')  return 'Bid Queue';
  if (role === 'service_pm') return 'Work Orders';
  if (role === 'super')      return 'Today';
  if (role === 'sales')      return 'Bid Queue';
  if (role === 'admin')      return 'Today';
  return 'Today';
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeView, setActiveView] = useState<AppView>('Today');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [demoUser, setDemoUser] = useState('Sean Daniels');

  const demoUserObj = ALL_USERS.find(u => u.name === demoUser) || ALL_USERS[0];
  const visibleSections  = navSectionsForRole(demoUserObj.role);
  const hiddenItems      = hiddenItemsForRole(demoUserObj.role);
  const readOnlyViews    = readOnlyViewsForRole(demoUserObj.role);
  const isReadOnly       = (view: AppView) => readOnlyViews.includes(view);

  function handleUserChange(name: string) {
    setDemoUser(name);
    const u = ALL_USERS.find(x => x.name === name);
    if (u) setActiveView(defaultViewForRole(u.role));
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
  };

  return (
    <div style={{ display: 'flex', height: '100dvh', background: '#f8fafc', overflow: 'hidden', fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif' }}>

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

        {activeView === 'Today'         && <TodayPanel />}
        {activeView === 'Inbox'         && <InboxPanel />}
        {activeView === 'Calendar'      && <CalendarPanel />}
        {activeView === 'Overview'      && <OverviewPanel />}
        {activeView === 'Event Feed'    && <EventFeedPanel />}
        {activeView === 'Projects'      && <ProjectsPanel />}
        {activeView === 'Issues'        && <IssuesPanel />}
        {activeView === 'Crew'          && <CrewPanel />}
        {activeView === 'Schedules'     && <PMPanel defaultTab='schedule' />}
        {activeView === 'Budget'        && <PMPanel defaultTab='budget' />}
        {activeView === 'Change Orders' && <PMPanel defaultTab='co' />}
        {activeView === 'Submittals'    && <PMPanel defaultTab='submittal' />}
        {activeView === 'Bid Queue'     && <BidQueuePanel />}
        {activeView === 'Bid Intake'    && <BidIntakePanel />}
        {activeView === 'My Bids'       && <EstimatorWorkspace currentUser={demoUser} />}
        {activeView === 'Work Orders'   && <ServicePanel readOnly={isReadOnly('Work Orders')} />}
        {activeView === 'Customers'     && <CustomersPanel />}
        {activeView === 'Assets'        && <AssetsPanel />}
        {activeView === 'Org Chart'     && <OrgChartPanel />}
        {activeView === 'Forecasting'   && <SchedulingPanel readOnly={isReadOnly('Forecasting')} />}
        {activeView === 'Dispatch Board'&& <DispatchBoard />}
        {activeView === 'Approvals'     && <ApprovalsPanel />}
        {activeView === 'Cost & Usage'  && <CostPanel />}
        {activeView === 'Workflows'     && <CronPanel />}
        {activeView === 'Task Board'    && <TaskBoardPanel />}

        <KaiFloat activeView={activeView} />
      </main>
    </div>
  );
}
