'use client';
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import OverviewPanel from '@/components/OverviewPanel';
import EventFeedPanel from '@/components/EventFeedPanel';
import ProjectsPanel from '@/components/ProjectsPanel';
import IssuesPanel from '@/components/IssuesPanel';
import CrewPanel from '@/components/CrewPanel';
import SchedulesPanel from '@/components/SchedulesPanel';
import SubmittalsPanel from '@/components/SubmittalsPanel';
import BidQueuePanel from '@/components/BidQueuePanel';
import ApprovalsPanel from '@/components/ApprovalsPanel';
import CostPanel from '@/components/CostPanel';
import CronPanel from '@/components/CronPanel';
import TaskBoardPanel from '@/components/TaskBoardPanel';
import InboxPanel from '@/components/InboxPanel';
import TodayPanel from '@/components/TodayPanel';
import KaiFloat from '@/components/KaiFloat';

export type AppView =
  | 'Today'
  | 'Inbox'
  | 'Overview'
  | 'Event Feed'
  | 'Projects'
  | 'Issues'
  | 'Crew'
  | 'Schedules'
  | 'Submittals'
  | 'Bid Queue'
  | 'Bid Intake'
  | 'Task Board'
  | 'Approvals'
  | 'Cost & Usage'
  | 'Workflows';

export default function Home() {
  const [activeView, setActiveView] = useState<AppView>('Today');

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar activeView={activeView} onSelect={setActiveView} />
      <main className="flex-1 overflow-y-auto bg-[#f4f7f9]" style={{ position: 'relative' }}>
        {activeView === 'Today' && <TodayPanel />}
        {activeView === 'Inbox' && <InboxPanel />}
        {activeView === 'Overview' && <OverviewPanel />}
        {activeView === 'Event Feed' && <EventFeedPanel />}
        {activeView === 'Projects' && <ProjectsPanel />}
        {activeView === 'Issues' && <IssuesPanel />}
        {activeView === 'Crew' && <CrewPanel />}
        {activeView === 'Schedules' && <SchedulesPanel />}
        {activeView === 'Submittals' && <SubmittalsPanel />}
        {activeView === 'Bid Queue' && <BidQueuePanel />}
        {activeView === 'Bid Intake' && <InboxPanel />}
        {activeView === 'Approvals' && <ApprovalsPanel />}
        {activeView === 'Cost & Usage' && <CostPanel />}
        {activeView === 'Workflows' && <CronPanel />}
        {activeView === 'Task Board' && <TaskBoardPanel />}
        <KaiFloat activeView={activeView} />
      </main>
    </div>
  );
}
