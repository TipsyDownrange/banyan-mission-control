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
  | 'Forecasting'
  | 'Dispatch Board'
  | 'Task Board'
  | 'Approvals'
  | 'Cost & Usage'
  | 'Workflows';

const DEMO_USERS = ['Sean Daniels', 'Kyle Shimizu', 'Jenny Shimabukuro', 'Mark Olson'];

export default function Home() {
  const [activeView, setActiveView] = useState<AppView>('Today');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [demoUser, setDemoUser] = useState('Sean Daniels');

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
          onUserChange={setDemoUser}
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
            <select value={demoUser} onChange={e => setDemoUser(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.8)', cursor: 'pointer', outline: 'none' }}>
              {DEMO_USERS.map(u => <option key={u} style={{ background: '#0c2330' }}>{u}</option>)}
            </select>
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
