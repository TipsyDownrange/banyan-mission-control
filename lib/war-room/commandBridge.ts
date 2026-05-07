import type {
  WarRoomAgentCard,
  WarRoomApprovalItem,
  WarRoomCommandBridgeData,
  WarRoomCrewLane,
  WarRoomIssue,
  WarRoomLane,
  WarRoomMission,
  WarRoomPriority,
  WarRoomReceipt,
  WarRoomRisk,
  WarRoomScopeType,
  WarRoomTaskIntake,
} from './types';

const PRIORITIES: WarRoomPriority[] = ['P0', 'P1', 'P2', 'P3'];
const RISKS: WarRoomRisk[] = ['P0', 'P1', 'P2', 'P3'];
const SCOPE_TYPES: WarRoomScopeType[] = ['audit', 'code', 'verify', 'doc', 'external-action', 'recurring'];
const LANES: WarRoomLane[] = ['kai', 'claude', 'codex', 'sean', 'auto'];

export const WAR_ROOM_CREW_LANES: WarRoomCrewLane[] = [
  {
    id: 'kai',
    displayName: 'Kai / Captain',
    health: 'ok',
    authStatus: 'Mission Control session required',
    quotaStatus: 'unknown',
    currentRecommendation: 'Use for orchestration, packet shaping, verification, and stop-condition calls.',
    notes: 'No autonomous dispatch from War Room. Kai remains the human-facing control lane.',
  },
  {
    id: 'codex',
    displayName: 'Codex / Build Crew',
    health: 'unknown',
    authStatus: 'Manual ACP/session status',
    quotaStatus: 'manual',
    currentRecommendation: 'Use for scoped code changes when weekly capacity is manually confirmed.',
    notes: 'War Room does not claim exact remaining quota and cannot execute Codex from the UI.',
  },
  {
    id: 'claude',
    displayName: 'Claude / Audit Crew',
    health: 'unknown',
    authStatus: 'Manual ACP/session status',
    quotaStatus: 'manual',
    currentRecommendation: 'Use for high-context audit/review when Codex capacity is constrained.',
    notes: 'Manual 5h/weekly window tracking only until a verified quota source exists.',
  },
];

export const WAR_ROOM_RECURRING_MISSIONS: WarRoomMission[] = [
  ['morning-diagnostic', 'Morning Diagnostic', 'Daily 06:00 HST', 'Kai / Captain'],
  ['cost-quota-check', 'Cost/Quota Check', 'Daily 08:00 HST', 'Costmaster'],
  ['linear-drift-check', 'Linear Drift Check', 'Weekdays 07:30 HST', 'Ship Log / Scribe'],
  ['drive-canon-delta-check', 'Drive Canon Delta Check', 'Weekdays 07:45 HST', 'Librarian / Canon Keeper'],
  ['module-maturity-map-freshness', 'Module Maturity Map Freshness Check', 'Weekly Monday', 'Librarian / Canon Keeper'],
  ['vercel-deploy-health', 'Vercel Deploy Health', 'Daily 09:00 HST', 'Regression Bosun'],
  ['stale-pr-sweep', 'Stale PR Sweep', 'Weekly Friday', 'Dispatcher / Quartermaster'],
  ['wo-lifecycle-smoke-test', 'WO Lifecycle Smoke Test', 'Disabled protected-surface smoke', 'Regression Bosun'],
  ['session-closeout-reminder', 'Session Closeout Reminder', 'Daily 17:00 HST', 'Ship Log / Scribe'],
].map(([id, name, schedule, ownerAgent]) => ({
  id,
  name,
  schedule,
  enabled: false,
  ownerAgent,
  lastRunAt: null,
  nextRunAt: null,
  lastStatus: 'disabled',
  approvalRequired: true,
}));

export const WAR_ROOM_AGENT_CARDS: WarRoomAgentCard[] = [
  {
    id: 'kai-captain',
    title: 'Captain / Kai',
    role: 'Orchestrator and verifier',
    status: 'watching',
    currentFocus: 'Command bridge intake, routing, and proof gates',
    nextAction: 'Shape approved work into scoped packets',
  },
  {
    id: 'canon-keeper',
    title: 'Librarian / Canon Keeper',
    role: 'Canon freshness and Drive index watch',
    status: 'standing-by',
    currentFocus: 'Drive canon deltas, Module Maturity Map, Delta Ledger',
    nextAction: 'Flag stale docs before dispatch',
  },
  {
    id: 'quartermaster',
    title: 'Quartermaster / Dispatcher',
    role: 'Task intake and lane routing',
    status: 'standing-by',
    currentFocus: 'Manual intake to Linear-safe queue',
    nextAction: 'Prepare dispatch packets after human gate',
  },
  {
    id: 'inspector',
    title: 'Inspector / QA Officer',
    role: 'Evidence verification',
    status: 'standing-by',
    currentFocus: 'Receipts, tests, screenshots, and stop-condition proof',
    nextAction: 'Reject done claims without evidence',
  },
  {
    id: 'costmaster',
    title: 'Costmaster',
    role: 'Quota and cost routing',
    status: 'standing-by',
    currentFocus: 'Manual Codex/Claude/Kai capacity status',
    nextAction: 'Recommend cheapest safe lane',
  },
  {
    id: 'scribe',
    title: 'Ship Log / Scribe',
    role: 'Linear and receipt ledger',
    status: 'standing-by',
    currentFocus: 'Dispatch and return receipts',
    nextAction: 'Keep issue ledger aligned with proof',
  },
  {
    id: 'safety-officer',
    title: 'Safety Officer',
    role: 'External-write and production gates',
    status: 'watching',
    currentFocus: 'Drive, Sheets, Gmail, QBO, Vercel, Supabase, production mutation gates',
    nextAction: 'Hold risky actions for Sean approval',
  },
  {
    id: 'regression-bosun',
    title: 'Regression Bosun',
    role: 'Recurring smoke tests and audits',
    status: 'disabled',
    currentFocus: 'Recurring mission catalog is visible but disabled',
    nextAction: 'Wait for later packet before automated runs',
  },
];

export interface WarRoomIntakeValidationResult {
  ok: boolean;
  errors: string[];
  intake?: WarRoomTaskIntake;
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return allowed.includes(value as T) ? value as T : fallback;
}

export function validateWarRoomTaskIntake(payload: unknown, requestedBy: string): WarRoomIntakeValidationResult {
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const safetyFlags = body.safetyFlags && typeof body.safetyFlags === 'object' ? body.safetyFlags as Record<string, unknown> : {};
  const title = asText(body.title);
  const description = asText(body.description);
  const intake: WarRoomTaskIntake = {
    title,
    description,
    requestedBy,
    priority: enumValue(body.priority, PRIORITIES, 'P2'),
    risk: enumValue(body.risk, RISKS, 'P2'),
    scopeType: enumValue(body.scopeType, SCOPE_TYPES, 'audit'),
    suggestedLane: enumValue(body.suggestedLane, LANES, 'kai'),
    safetyFlags: {
      noExternalWrites: asBoolean(safetyFlags.noExternalWrites, true),
      stagingOnly: asBoolean(safetyFlags.stagingOnly, true),
      needsApproval: asBoolean(safetyFlags.needsApproval, true),
      productionSensitive: asBoolean(safetyFlags.productionSensitive, false),
    },
  };
  const errors: string[] = [];

  if (title.length < 4) errors.push('title must be at least 4 characters');
  if (title.length > 140) errors.push('title must be 140 characters or fewer');
  if (description.length < 12) errors.push('description must be at least 12 characters');
  if (description.length > 4000) errors.push('description must be 4000 characters or fewer');
  if (!intake.safetyFlags.noExternalWrites) errors.push('noExternalWrites must remain enabled for BAN-180.A');
  if (intake.scopeType === 'external-action' && !intake.safetyFlags.needsApproval) {
    errors.push('external-action intake must require approval');
  }
  if (intake.safetyFlags.productionSensitive && !intake.safetyFlags.needsApproval) {
    errors.push('productionSensitive intake must require approval');
  }

  return { ok: errors.length === 0, errors, intake: errors.length === 0 ? intake : undefined };
}

export function buildWarRoomLinearLabels(intake: WarRoomTaskIntake) {
  return [
    'Area: War Room',
    `Lane: ${laneLabel(intake.suggestedLane)}`,
    'Workflow: Intake',
    `Risk: ${intake.risk}`,
    'Source: War Room',
    `Scope: ${intake.scopeType}`,
  ];
}

export function buildWarRoomLinearDescription(intake: WarRoomTaskIntake) {
  const flags = Object.entries(intake.safetyFlags)
    .map(([key, value]) => `- ${key}: ${value ? 'yes' : 'no'}`)
    .join('\n');

  return [
    '## War Room Intake',
    '',
    intake.description,
    '',
    '## Routing',
    '',
    `- Requested by: ${intake.requestedBy}`,
    `- Priority: ${intake.priority}`,
    `- Risk: ${intake.risk}`,
    `- Scope: ${intake.scopeType}`,
    `- Suggested lane: ${laneLabel(intake.suggestedLane)}`,
    '',
    '## Safety Flags',
    '',
    flags,
    '',
    '## BAN-180.A Guardrails',
    '',
    '- No autonomous agent dispatch from War Room.',
    '- No shell execution from the web UI.',
    '- No Drive/Gmail/QBO/Vercel/Supabase/Google Sheets writes.',
    '- Linear issue creation only through this authenticated route.',
  ].join('\n');
}

export function buildWarRoomLinearIssuePayload(intake: WarRoomTaskIntake, teamId: string) {
  return {
    teamId,
    title: intake.title,
    description: buildWarRoomLinearDescription(intake),
    priority: linearPriority(intake.priority),
  };
}

export function buildWarRoomCommandBridgeData(issues: WarRoomIssue[]): WarRoomCommandBridgeData {
  const approvalInbox = buildApprovalInbox(issues);
  const receipts = buildReceipts(issues);

  return {
    crewLanes: WAR_ROOM_CREW_LANES,
    missions: WAR_ROOM_RECURRING_MISSIONS,
    agents: WAR_ROOM_AGENT_CARDS,
    receipts,
    approvalInbox,
  };
}

function buildApprovalInbox(issues: WarRoomIssue[]): WarRoomApprovalItem[] {
  return issues
    .filter(issue => {
      const labels = issue.labels.join(' ').toLowerCase();
      return labels.includes('needs sean') || labels.includes('approval') || issue.latestCommentSummary?.toLowerCase().includes('blocked');
    })
    .slice(0, 8)
    .map(issue => ({
      id: `approval-${issue.id}`,
      title: issue.title,
      issueId: issue.id,
      lane: normalizeLane(issue.lane),
      risk: issue.risk,
      blockerSummary: issue.latestCommentSummary || 'Needs Sean decision before work can continue.',
      requestedAction: issue.labels.some(label => label.toLowerCase().includes('approval')) ? 'Approve or reject requested action' : 'Answer blocker / clarify next step',
      approvalRequired: true,
      updatedAt: issue.updatedAt,
    }));
}

function buildReceipts(issues: WarRoomIssue[]): WarRoomReceipt[] {
  return issues
    .filter(issue => issue.statusType === 'completed' || issue.labels.some(label => label.toLowerCase().includes('evidence')))
    .slice(0, 8)
    .map(issue => ({
      taskId: issue.id,
      agent: issue.lane === 'Unassigned' ? 'Unassigned' : issue.lane,
      lane: normalizeLane(issue.lane),
      dispatchedAt: null,
      completedAt: issue.completedAt || null,
      promptPath: null,
      packetPath: null,
      repoPath: issue.repo,
      commitSha: null,
      allowedActions: ['Linear read/review', 'Manual evidence review'],
      resultPath: issue.url,
      prUrl: null,
      filePath: null,
      testsRun: [],
      verificationStatus: issue.labels.some(label => label === 'State: Evidence Missing') ? 'missing' : issue.statusType === 'completed' ? 'passed' : 'pending',
      blockerSummary: issue.latestCommentSummary || null,
    }));
}

function laneLabel(lane: WarRoomLane) {
  if (lane === 'kai') return 'Kai';
  if (lane === 'claude') return 'Claude';
  if (lane === 'codex') return 'Codex';
  if (lane === 'sean') return 'Sean';
  return 'Auto';
}

function normalizeLane(value: string): WarRoomLane | 'operator' {
  const lane = value.toLowerCase();
  if (lane.includes('kai')) return 'kai';
  if (lane.includes('claude')) return 'claude';
  if (lane.includes('codex')) return 'codex';
  if (lane.includes('sean')) return 'sean';
  return 'operator';
}

function linearPriority(priority: WarRoomPriority) {
  if (priority === 'P0') return 1;
  if (priority === 'P1') return 2;
  if (priority === 'P2') return 3;
  return 4;
}
