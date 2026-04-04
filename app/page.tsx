'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import OverviewPanel from '@/components/OverviewPanel';
import EventFeedPanel from '@/components/EventFeedPanel';
import ProjectsPanel from '@/components/ProjectsPanel';
import IssuesPanel from '@/components/IssuesPanel';
import CrewPanel from '@/components/CrewPanel';
import SchedulesPanel from '@/components/SchedulesPanel';
import SubmittalsPanel from '@/components/SubmittalsPanel';
import PMPanel from '@/components/PMPanel';
import BidQueuePanel from '@/components/BidQueuePanel';
import ApprovalsPanel from '@/components/ApprovalsPanel';
import CostPanel from '@/components/CostPanel';
import CronPanel from '@/components/CronPanel';
import TaskBoardPanel from '@/components/TaskBoardPanel';
import InboxPanel from '@/components/InboxPanel';
import TodayPanel from '@/components/TodayPanel';
import CalendarPanel from '@/components/CalendarPanel';
import EstimatorWorkspace from '@/components/EstimatorWorkspace';
import ServicePanel from '@/components/ServicePanel';
import BidIntakePanel from '@/components/BidIntakePanel';
import AssetsPanel from '@/components/AssetsPanel';
import OrgChartPanel from '@/components/OrgChartPanel';
import SchedulingPanel from '@/components/SchedulingPanel';
import DispatchBoard from '@/components/DispatchBoard';
import CustomersPanel from '@/components/CustomersPanel';
import KaiFloat from '@/components/KaiFloat';

export type AppView =
  | 'Today'
  | 'Inbox'
  | 'Calendar'
  | 'Overview'
  | 'Event Feed'
  | 'Projects'
  | 'Issues'
  | 'Crew'
  | 'Schedules'
  | 'Submittals'
  | 'Budget'
  | 'Change Orders'
  | 'Bid Queue'
  | 'Bid Intake'
  | 'My Bids'
  | 'Work Orders'
  | 'Customers'
  | 'Assets'
  | 'Org Chart'
  | 'Forecasting'
  | 'Dispatch Board'
  | 'Task Board'
  | 'Approvals'
  | 'Cost & Usage'
  | 'Workflows';

// Full org — grouped for the picker
const ALL_USERS: { name: string; role: string; group: string }[] = [
  // Leadership
  { name: 'Jody Boeringa',   role: 'owner',       group: 'Leadership' },
  { name: 'Sean Daniels',    role: 'gm',           group: 'Leadership' },
  // PM / Estimating
  { name: 'Frank Redondo',   role: 'pm',           group: 'PM / Estimating' },
  { name: 'Kyle Shimizu',    role: 'estimator',    group: 'PM / Estimating' },
  { name: 'Jenny Shimabukuro',role:'estimator',    group: 'PM / Estimating' },
  { name: 'Joey Ritthaler',  role: 'service_pm',   group: 'PM / Estimating' },
  // Sales / Admin
  { name: 'Mark Olson',      role: 'sales',        group: 'Sales / Admin — Remote' },
  { name: 'Tia Omura',       role: 'admin',        group: 'Sales / Admin' },
  { name: 'Jenna Nakama',    role: 'admin',        group: 'Sales / Admin' },
  { name: 'Sherilynn Takuchi',role:'admin',         group: 'Sales / Admin' },
  // Field — Supers
  { name: 'Karl Nakamura Sr.',role:'super',         group: 'Field — Oahu' },
  { name: 'Nate Nakamura',   role: 'super',        group: 'Field — Maui' },
  // Field — Oahu crew
  { name: 'Karl Nakamura Jr.',role:'glazier',       group: 'Field — Oahu' },
  { name: 'Thomas Begonia',  role: 'glazier',      group: 'Field — Oahu' },
  { name: 'Jay Castillo',    role: 'glazier',      group: 'Field — Oahu' },
  { name: 'Nolan Lagmay',    role: 'glazier',      group: 'Field — Oahu' },
  { name: 'Francis Lynch',   role: 'glazier',      group: 'Field — Oahu' },
  { name: 'James Nakamura',  role: 'glazier',      group: 'Field — Oahu' },
  { name: 'Timothy Stitt',   role: 'glazier',      group: 'Field — Oahu' },
  { name: 'Wendall Tavares', role: 'glazier',      group: 'Field — Oahu' },
  { name: 'Deric Valoroso',  role: 'glazier',      group: 'Field — Oahu' },
  { name: 'Sonny Ah Kui',    role: 'glazier',      group: 'Field — Oahu' },
  { name: 'Lewis Roman',     role: 'glazier',      group: 'Field — Oahu' },
  // Field — Maui crew
  { name: 'Nathan Nakamura', role: 'glazier',      group: 'Field — Maui' },
  { name: 'Mark Villados',   role: 'glazier',      group: 'Field — Maui' },
  { name: 'Tyler Niemeyer',  role: 'glazier',      group: 'Field — Maui' },
  { name: 'Tyson Omura',     role: 'glazier',      group: 'Field — Maui' },
  // Field — Kauai crew
  { name: 'Silas Macon',     role: 'glazier',      group: 'Field — Kauai' },
  { name: 'Mien-Quoc Ly',    role: 'glazier',      group: 'Field — Kauai' },
  { name: 'Lonnie McKenzie', role: 'glazier',      group: 'Field — Kauai' },
  { name: 'Joshua Moore',    role: 'glazier',      group: 'Field — Kauai' },
  { name: 'Troy Sliter',     role: 'glazier',      group: 'Field — Kauai' },
];

// Role → which nav sections are visible
export function navSectionsForRole(role: string): string[] {
  if (role === 'owner') return ['Command', 'Operations', 'People & Assets', 'Estimating', 'Service', 'BanyanOS'];
  if (role === 'gm')    return ['Command', 'Operations', 'People & Assets', 'Estimating', 'Service', 'BanyanOS'];
  if (role === 'pm')    return ['Command', 'Operations', 'People & Assets', 'Service'];
  if (role === 'estimator') return ['Command', 'Estimating', 'People & Assets'];
  if (role === 'service_pm') return ['Command', 'Service', 'People & Assets'];
  if (role === 'sales') return ['Command', 'Estimating', 'People & Assets'];
  if (role === 'admin') return ['Command', 'People & Assets'];
  if (role === 'super') return ['Command', 'Operations', 'People & Assets'];
  if (role === 'glazier') return ['Command']; // schedule only — field app is their primary
  return ['Command'];
}

// Role → default landing view
function defaultViewForRole(role: string): AppView {
  if (['glazier', 'super'].includes(role)) return 'Today';
  if (role === 'estimator') return 'Bid Queue';
  if (role === 'service_pm') return 'Work Orders';
  return 'Today';
}

export default function Home() {
  const [activeView, setActiveView] = useState<AppView>('Today');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [demoUser, setDemoUser] = useState('Sean Daniels');
  const demoUserObj = ALL_USERS.find(u => u.name === demoUser) || ALL_USERS[0];
  const visibleSections = navSectionsForRole(demoUserObj.role);

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

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: '#f4f7f9' }}>
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
        />
      )}

      {/* Sidebar — desktop always visible, mobile slide-over */}
      <div style={{
        position: isMobile ? 'fixed' : 'relative',
        left: isMobile ? (mobileOpen ? 0 : -280) : 0,
        top: 0,
        bottom: 0,
        zIndex: isMobile ? 50 : 'auto',
        transition: isMobile ? 'left 0.2s ease' : undefined,
        flexShrink: 0,
      }}>
        <Sidebar
          activeView={activeView}
          onSelect={handleSelect}
          collapsed={isMobile ? false : collapsed}
          onToggle={() => isMobile ? setMobileOpen(false) : setCollapsed(v => !v)}
          demoUser={demoUser}
          onUserChange={handleUserChange}
          visibleSections={visibleSections}
          allUsers={ALL_USERS}
        />
      </div>

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

        {activeView === 'Today' && <TodayPanel />}
        {activeView === 'Inbox' && <InboxPanel />}
        {activeView === 'Calendar' && <CalendarPanel />}
        {activeView === 'Overview' && <OverviewPanel />}
        {activeView === 'Event Feed' && <EventFeedPanel />}
        {activeView === 'Projects' && <ProjectsPanel />}
        {activeView === 'Issues' && <IssuesPanel />}
        {activeView === 'Crew' && <CrewPanel />}
        {activeView === 'Schedules' && <PMPanel defaultTab='schedule' />}
        {activeView === 'Budget' && <PMPanel defaultTab='budget' />}
        {activeView === 'Change Orders' && <PMPanel defaultTab='co' />}
        {activeView === 'Submittals' && <PMPanel defaultTab='submittal' />}
        {activeView === 'Bid Queue' && <BidQueuePanel />}
        {activeView === 'Bid Intake' && <BidIntakePanel />}
        {activeView === 'My Bids' && <EstimatorWorkspace currentUser={demoUser} />}
        {activeView === 'Work Orders' && <ServicePanel />}
        {activeView === 'Customers' && <CustomersPanel />}
        {activeView === 'Assets' && <AssetsPanel />}
        {activeView === 'Org Chart' && <OrgChartPanel />}
        {activeView === 'Forecasting' && <SchedulingPanel />}
        {activeView === 'Dispatch Board' && <DispatchBoard />}
        {activeView === 'Approvals' && <ApprovalsPanel />}
        {activeView === 'Cost & Usage' && <CostPanel />}
        {activeView === 'Workflows' && <CronPanel />}
        {activeView === 'Task Board' && <TaskBoardPanel />}

        <KaiFloat activeView={activeView} />
      </main>
    </div>
  );
}
