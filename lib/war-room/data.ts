import { WAR_ROOM_FIXTURE_ISSUES } from './fixtures';
import type { WarRoomDashboardData, WarRoomIssue, WarRoomQueue, WarRoomQueueKey } from './types';

const PROJECT_NAME = 'BanyanOS War Room';
const LINEAR_API_URL = 'https://api.linear.app/graphql';

const QUEUE_DEFS: Array<Omit<WarRoomQueue, 'issues'>> = [
  { key: 'myWatch', label: 'My Watch', description: 'Captain-visible work needing attention today.' },
  { key: 'readyForCodex', label: 'Ready for Codex', description: 'Scoped and safe to pick up.' },
  { key: 'needsSean', label: 'Needs Sean', description: 'Decisions, approvals, or clarifications.' },
  { key: 'captainsTriage', label: "Captain's Triage", description: 'P0/P1 risk requiring command focus.' },
  { key: 'xoReview', label: 'XO Review', description: 'Completed or mapped work awaiting review.' },
  { key: 'needsEvidence', label: 'Needs Evidence', description: 'Work blocked on proof, screenshots, or logs.' },
  { key: 'backlog', label: 'Backlog / Dry Dock', description: 'Parked work not ready for dispatch.' },
  { key: 'closed', label: 'Closed / Logged', description: 'Completed and logged work.' },
];

interface LinearIssueNode {
  identifier: string;
  title: string;
  url: string;
  priority: number;
  priorityLabel?: string;
  updatedAt: string;
  completedAt?: string | null;
  state?: { name?: string; type?: string };
  labels?: { nodes?: Array<{ name: string }> };
  comments?: { nodes?: Array<{ body?: string; createdAt?: string }> };
}

function labelValue(labels: string[], prefix: string, fallback: string) {
  const match = labels.find(label => label.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : fallback;
}

function riskFromLabels(labels: string[]): WarRoomIssue['risk'] {
  if (labels.includes('Risk: P0')) return 'P0';
  if (labels.includes('Risk: P1')) return 'P1';
  if (labels.includes('Risk: P2')) return 'P2';
  if (labels.includes('Risk: P3')) return 'P3';
  return 'None';
}

function summarizeComment(body?: string) {
  if (!body) return undefined;
  const clean = body.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
}

function normalizeLinearIssue(issue: LinearIssueNode): WarRoomIssue {
  const labels = issue.labels?.nodes?.map(label => label.name).filter(Boolean) || [];
  const status = issue.state?.name || 'Unknown';
  const statusType = issue.state?.type || 'unknown';

  return {
    id: issue.identifier,
    title: issue.title,
    url: issue.url,
    status,
    statusType,
    priority: issue.priorityLabel || priorityLabel(issue.priority),
    priorityValue: issue.priority,
    labels,
    repo: labelValue(labels, 'Repo:', 'Unassigned'),
    lane: labelValue(labels, 'Lane:', 'Unassigned'),
    area: labelValue(labels, 'Area:', 'Unassigned'),
    risk: riskFromLabels(labels),
    latestCommentSummary: summarizeComment(issue.comments?.nodes?.[0]?.body),
    updatedAt: issue.updatedAt,
    completedAt: issue.completedAt || null,
  };
}

function priorityLabel(priority: number) {
  if (priority === 1) return 'Urgent';
  if (priority === 2) return 'High';
  if (priority === 3) return 'Medium';
  if (priority === 4) return 'Low';
  return 'No priority';
}

function hasLabel(issue: WarRoomIssue, label: string) {
  return issue.labels.includes(label);
}

function isDone(issue: WarRoomIssue) {
  return issue.statusType === 'completed' || issue.status.toLowerCase() === 'done';
}

function issueQueues(issue: WarRoomIssue): WarRoomQueueKey[] {
  const queues: WarRoomQueueKey[] = [];
  const highRisk = issue.risk === 'P0' || issue.risk === 'P1';

  if (!isDone(issue) && (hasLabel(issue, 'Workflow: Ready for Codex'))) queues.push('readyForCodex');
  if (!isDone(issue) && (hasLabel(issue, 'State: Needs Sean Answer') || hasLabel(issue, 'Workflow: Needs Sean Answer'))) queues.push('needsSean');
  if (!isDone(issue) && highRisk) queues.push('captainsTriage');
  if (!isDone(issue) && hasLabel(issue, 'Workflow: Needs Review')) queues.push('xoReview');
  if (!isDone(issue) && hasLabel(issue, 'State: Evidence Missing')) queues.push('needsEvidence');
  if (!isDone(issue) && issue.status.toLowerCase() === 'backlog') queues.push('backlog');
  if (isDone(issue)) queues.push('closed');
  if (!isDone(issue) && (highRisk || hasLabel(issue, 'State: Needs Sean Answer'))) queues.push('myWatch');

  return queues;
}

export function buildWarRoomDashboard(issues: WarRoomIssue[], source: WarRoomDashboardData['source']): WarRoomDashboardData {
  const sorted = [...issues].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const queues = QUEUE_DEFS.map(queue => ({
    ...queue,
    issues: sorted.filter(issue => issueQueues(issue).includes(queue.key)),
  }));
  const completed = sorted.filter(isDone);
  const active = sorted.filter(issue => !isDone(issue));

  return {
    source,
    generatedAt: new Date().toISOString(),
    projectName: PROJECT_NAME,
    bridgeStatus: source === 'linear' ? 'Live Linear read-only' : 'Fixture fallback',
    issues: sorted,
    queues,
    recentlyCompleted: completed.slice(0, 5),
    upNext: active.filter(issue => issueQueues(issue).some(key => key === 'readyForCodex' || key === 'needsSean' || key === 'captainsTriage')).slice(0, 6),
    bridgeCommunications: sorted
      .filter(issue => issue.latestCommentSummary)
      .slice(0, 5)
      .map(issue => ({
        issueId: issue.id,
        title: issue.title,
        note: issue.latestCommentSummary || '',
        updatedAt: issue.updatedAt,
      })),
    kpis: {
      readyForCodex: sorted.filter(issue => issueQueues(issue).includes('readyForCodex')).length,
      needsSean: sorted.filter(issue => issueQueues(issue).includes('needsSean')).length,
      p0p1Risks: sorted.filter(issue => !isDone(issue) && (issue.risk === 'P0' || issue.risk === 'P1')).length,
      needsEvidence: sorted.filter(issue => issueQueues(issue).includes('needsEvidence')).length,
      closedLogged: completed.length,
      activeCodex: null,
    },
  };
}

async function fetchLinearIssues(): Promise<WarRoomIssue[] | null> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) return null;

  const query = `
    query WarRoomIssues($projectName: String!) {
      issues(
        first: 100
        filter: { project: { name: { eq: $projectName } } }
        orderBy: updatedAt
      ) {
        nodes {
          identifier
          title
          url
          priority
          priorityLabel
          updatedAt
          completedAt
          state { name type }
          labels { nodes { name } }
          comments(first: 1) { nodes { body createdAt } }
        }
      }
    }
  `;

  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables: { projectName: PROJECT_NAME } }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Linear read failed: ${response.status}`);
  }

  const payload = await response.json() as { data?: { issues?: { nodes?: LinearIssueNode[] } }; errors?: Array<{ message: string }> };
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(error => error.message).join('; '));
  }

  return (payload.data?.issues?.nodes || []).map(normalizeLinearIssue);
}

export async function getWarRoomDashboardData(): Promise<WarRoomDashboardData> {
  try {
    const liveIssues = await fetchLinearIssues();
    if (liveIssues?.length) {
      return buildWarRoomDashboard(liveIssues, 'linear');
    }
  } catch (error) {
    console.error('War Room Linear adapter falling back to fixtures:', error);
  }

  return buildWarRoomDashboard(WAR_ROOM_FIXTURE_ISSUES, 'fixture');
}
