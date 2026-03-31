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

export type AppView =
  | 'Overview'
  | 'Event Feed'
  | 'Projects'
  | 'Issues'
  | 'Crew'
  | 'Schedules'
  | 'Submittals'
  | 'Bid Queue';

export default function Home() {
  const [activeView, setActiveView] = useState<AppView>('Overview');

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar activeView={activeView} onSelect={setActiveView} />
      <main className="flex-1 overflow-y-auto bg-[#f4f7f9]">
        {activeView === 'Overview' && <OverviewPanel />}
        {activeView === 'Event Feed' && <EventFeedPanel />}
        {activeView === 'Projects' && <ProjectsPanel />}
        {activeView === 'Issues' && <IssuesPanel />}
        {activeView === 'Crew' && <CrewPanel />}
        {activeView === 'Schedules' && <SchedulesPanel />}
        {activeView === 'Submittals' && <SubmittalsPanel />}
        {activeView === 'Bid Queue' && <BidQueuePanel />}
      </main>
    </div>
  );
}
