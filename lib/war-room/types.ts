export type WarRoomQueueKey =
  | 'myWatch'
  | 'readyForCodex'
  | 'needsSean'
  | 'captainsTriage'
  | 'xoReview'
  | 'needsEvidence'
  | 'backlog'
  | 'closed';

export interface WarRoomIssue {
  id: string;
  title: string;
  url: string;
  status: string;
  statusType: string;
  priority: string;
  priorityValue: number;
  labels: string[];
  repo: string;
  lane: string;
  area: string;
  risk: 'P0' | 'P1' | 'P2' | 'P3' | 'None';
  latestCommentSummary?: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface WarRoomQueue {
  key: WarRoomQueueKey;
  label: string;
  description: string;
  issues: WarRoomIssue[];
}

export interface WarRoomKpis {
  readyForCodex: number;
  needsSean: number;
  p0p1Risks: number;
  needsEvidence: number;
  closedLogged: number;
  activeCodex: number | null;
}

export interface WarRoomDashboardData {
  source: 'linear' | 'fixture';
  generatedAt: string;
  projectName: string;
  bridgeStatus: 'Live Linear read-only' | 'Fixture fallback';
  issues: WarRoomIssue[];
  queues: WarRoomQueue[];
  recentlyCompleted: WarRoomIssue[];
  upNext: WarRoomIssue[];
  bridgeCommunications: {
    issueId: string;
    title: string;
    note: string;
    updatedAt: string;
  }[];
  kpis: WarRoomKpis;
}
