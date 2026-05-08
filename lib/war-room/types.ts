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

export type WarRoomPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type WarRoomRisk = 'P0' | 'P1' | 'P2' | 'P3';
export type WarRoomScopeType = 'audit' | 'code' | 'verify' | 'doc' | 'external-action' | 'recurring';
export type WarRoomLane = 'kai' | 'claude' | 'codex' | 'sean' | 'auto';

export interface WarRoomTaskIntake {
  title: string;
  description: string;
  requestedBy: string;
  priority: WarRoomPriority;
  risk: WarRoomRisk;
  scopeType: WarRoomScopeType;
  suggestedLane: WarRoomLane;
  safetyFlags: {
    noExternalWrites: boolean;
    stagingOnly: boolean;
    needsApproval: boolean;
    productionSensitive: boolean;
  };
  linkedLinearIssueId?: string;
  linkedLinearIdentifier?: string;
  linkedLinearUrl?: string;
}

export interface WarRoomCrewLane {
  id: 'kai' | 'claude' | 'codex';
  displayName: string;
  health: 'ok' | 'degraded' | 'blocked' | 'unknown';
  authStatus: string;
  quotaStatus: 'manual' | 'verified' | 'unknown';
  currentRecommendation: string;
  notes: string;
}

export interface WarRoomMission {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  ownerAgent: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: 'never-run' | 'queued' | 'running' | 'blocked' | 'failed' | 'complete' | 'disabled';
  approvalRequired: boolean;
}

export interface WarRoomAgentCard {
  id: string;
  title: string;
  role: string;
  status: 'standing-by' | 'watching' | 'blocked' | 'disabled';
  currentFocus: string;
  nextAction: string;
}

export interface WarRoomReceipt {
  taskId: string;
  agent: string;
  lane: WarRoomLane | 'operator';
  dispatchedAt: string | null;
  completedAt: string | null;
  promptPath: string | null;
  packetPath: string | null;
  repoPath: string | null;
  commitSha: string | null;
  allowedActions: string[];
  resultPath: string | null;
  prUrl: string | null;
  filePath: string | null;
  testsRun: string[];
  verificationStatus: 'missing' | 'pending' | 'passed' | 'failed' | 'blocked';
  blockerSummary: string | null;
}

export interface WarRoomApprovalItem {
  id: string;
  title: string;
  issueId?: string;
  lane: WarRoomLane | 'operator';
  risk: WarRoomRisk | 'None';
  blockerSummary: string;
  requestedAction: string;
  approvalRequired: boolean;
  updatedAt: string;
}

export interface WarRoomCommandBridgeData {
  crewLanes: WarRoomCrewLane[];
  missions: WarRoomMission[];
  agents: WarRoomAgentCard[];
  receipts: WarRoomReceipt[];
  approvalInbox: WarRoomApprovalItem[];
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
  commandBridge: WarRoomCommandBridgeData;
}
