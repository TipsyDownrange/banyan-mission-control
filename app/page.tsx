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
import KaiPanel from '@/components/KaiPanel';
import ApprovalsPanel from '@/components/ApprovalsPanel';
import CostPanel from '@/components/CostPanel';
import CronPanel from '@/components/CronPanel';
import TaskBoardPanel from '@/components/TaskBoardPanel';

export type AppView =
  | 'Overview'
  | 'Event Feed'
  | 'Projects'
  | 'Issues'
  | 'Crew'
  | 'Schedules'
  | 'Submittals'
  | 'Bid Queue'
  | 'Kai'
  | 'Task Board'
  | 'Approvals'
  | 'Cost & Usage'
  | 'Workflows';

export default function Home() {
  const [activeView, setActiveView] = useState<AppView>('Overview');

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar activeView={activeView} onSelect={setActiveView} />
      <main className="flex-1 overflow-hidden bg-[#f4f7f9]" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="flex-1 overflow-y-auto">
          {activeView === 'Overview' && <OverviewPanel />}
          {activeView === 'Event Feed' && <EventFeedPanel />}
          {activeView === 'Projects' && <ProjectsPanel />}
          {activeView === 'Issues' && <IssuesPanel />}
          {activeView === 'Crew' && <CrewPanel />}
          {activeView === 'Schedules' && <SchedulesPanel />}
          {activeView === 'Submittals' && <SubmittalsPanel />}
          {activeView === 'Bid Queue' && <BidQueuePanel />}
          {activeView === 'Approvals' && <ApprovalsPanel />}
          {activeView === 'Cost & Usage' && <CostPanel />}
          {activeView === 'Workflows' && <CronPanel />}
          {activeView === 'Task Board' && <TaskBoardPanel />}
        </div>
        {activeView === 'Kai' && (
          <div className="absolute inset-0 left-[260px] flex flex-col">
            <KaiPanel />
          </div>
        )}
      </main>
    </div>
  );
}
