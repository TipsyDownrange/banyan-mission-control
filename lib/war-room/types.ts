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
export type WarRoomLane = 'kai' | 'claude' | 'codex' | 'sean';

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

export type WarRoomRuntimeHealthState = 'ready' | 'manual' | 'degraded' | 'blocked' | 'disabled' | 'unknown';
export type WarRoomRuntimeAuthState = 'ok' | 'missing' | 'expired' | 'unknown';
export type WarRoomRuntimeState = 'ok' | 'degraded' | 'blocked' | 'disabled' | 'unknown';
export type WarRoomRuntimeQuotaState = 'verified' | 'manual' | 'constrained' | 'unknown';

export interface CrewRuntimeStatus {
  id: 'kai' | 'codex' | 'claude';
  health: WarRoomRuntimeHealthState;
  auth: WarRoomRuntimeAuthState;
  runtime: WarRoomRuntimeState;
  quota: WarRoomRuntimeQuotaState;
  lastCheckedAt: string;
  summary: string;
  blockers: string[];
}

export interface WarRoomCostSnapshot {
  allInTotal: number;
  todayCost: number;
  weekCost: number;
  monthlyBurn: number;
  dailyBudget: number;
  budgetPct: number;
  overBudget: boolean;
  providers: Array<{ id: string; label: string; value: number; color: string }>;
  byDay: Record<string, { cost: number; anthropic?: number; openai?: number }>;
  lastSync?: string;
  error?: string;
  /** Live Mac mini relay snapshot (Cost & Usage Live Tracking Phase 1). */
  liveClaudeSession?: import('../cost/types').LiveClaudeSnapshot | null;
  liveClaudeSessionAgeSeconds?: number | null;
}

export interface WarRoomLaneRecommendation {
  lane: 'kai' | 'codex' | 'claude' | 'sean';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  reasons: string[];
}

export interface WarRoomRuntimeHealth {
  generatedAt: string;
  kai: CrewRuntimeStatus;
  codex: CrewRuntimeStatus;
  claude: CrewRuntimeStatus;
  cost: WarRoomCostSnapshot;
  recommendation: WarRoomLaneRecommendation;
  liveOps?: import('./liveOps').WarRoomLiveOpsSnapshot;
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
  status: 'working' | 'idle' | 'blocked' | 'waiting-approval' | 'disabled';
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

export type SourceHealthStatus = 'healthy' | 'degraded' | 'warning' | 'critical' | 'unknown';
export type SourceAuthority =
  | 'production_authoritative'
  | 'staging_shadow'
  | 'read_only_reference'
  | 'last_verified_fallback'
  | 'non_authoritative'
  | 'unknown';
export type SourceHealthFreshness = 'live' | 'last_verified' | 'stale' | 'manual' | 'unknown';

export type SourceHealthSourceKey = 'linear' | 'supabase' | 'drive' | 'github' | 'vercel' | 'war_room_runtime';

export interface SourceHealthSourceCard {
  source: SourceHealthSourceKey;
  label: string;
  status: SourceHealthStatus;
  authority: SourceAuthority;
  freshness: SourceHealthFreshness;
  freshnessLabel: string;
  lastCheckedAt: string | null;
  summary: string;
  details: string[];
  sourceUrl?: string;
  isFallback: boolean;
  checkedChannels?: string[];
  unverifiedChannels?: string[];
  nonAuthorizationLabel?: string;
}

export interface SourceHealthConflict {
  id: string;
  severity: 'high' | 'medium' | 'low';
  sourceA: string;
  sourceB: string;
  currentA: string;
  currentB: string;
  recommendedAction: string;
}

export interface SupabaseStagingHealth {
  projectRef: string;
  projectName: string;
  projectStatus: string;
  region: string;
  postgresVersion?: string;
  serviceWorkOrdersCount: number | null;
  driftRunCount: number | null;
  driftDiffCount: number | null;
  latestDriftRun?: {
    sheetsRowCount: number;
    postgresRowCount: number;
    rowsInBoth: number;
    rowsWithFieldDrift: number;
    totalFieldDriftCount: number;
    stopConditionTriggered: boolean;
    stopConditionReason: string | null;
    schemaVersion: string | null;
  };
  securityAdvisorCount: number | null;
  performanceAdvisorCount: number | null;
  edgeFunctionCount: number | null;
  migrationCount: number | null;
}

export interface LinearHealth {
  contextIssueIds: string[];
  issues: Array<{ id: string; status: string; title: string }>;
}

export interface DriveCanonHealth {
  checkedDocumentLabels: string[];
}

export interface GitHubHealth {
  commitSha: string | null;
}

export interface VercelHealth {
  missionControlOnly: boolean;
  postgresGateLabel: string;
}

export interface SourceHealthSnapshot {
  generatedAt: string;
  environment: 'staging' | 'mixed' | 'unknown';
  sources: SourceHealthSourceCard[];
  conflicts: SourceHealthConflict[];
  supabase?: SupabaseStagingHealth;
  linear?: LinearHealth;
  drive?: DriveCanonHealth;
  github?: GitHubHealth;
  vercel?: VercelHealth;
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
