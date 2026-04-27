import type { WarRoomIssue, WarRoomQueueKey } from './types';

const REQUIRED_SECTIONS = [
  'TASK',
  'LANE',
  'TARGET',
  'SOURCE FILES / SOURCE ISSUES READ THIS SESSION',
  'SCOPE',
  'OUT OF SCOPE',
  'PROTECTED SURFACES',
  'STOP CONDITIONS',
  'VERIFY',
  'REPORT BACK WITH',
];

function hasLabel(issue: WarRoomIssue, label: string) {
  const target = label.toLowerCase();
  return issue.labels.some(issueLabel => issueLabel.toLowerCase() === target);
}

function isDone(issue: WarRoomIssue) {
  const status = issue.status.toLowerCase();
  return issue.statusType === 'completed' || status === 'done' || status === 'completed';
}

export function canPrepareWarRoomDispatch(
  issue?: WarRoomIssue | null,
  options: { queueKeys?: WarRoomQueueKey[] } = {},
) {
  if (!issue) return false;
  const isReady = hasLabel(issue, 'Workflow: Ready for Codex') || options.queueKeys?.includes('readyForCodex');
  return Boolean(issue.id && issue.title && issue.url && !isDone(issue) && isReady);
}

function metadataLines(issue: WarRoomIssue) {
  return [
    `- Issue ID: ${issue.id}`,
    `- Title: ${issue.title}`,
    `- URL: ${issue.url}`,
    `- Status: ${issue.status} (${issue.statusType})`,
    `- Priority: ${issue.priority}`,
    `- Repo: ${issue.repo}`,
    `- Lane: ${issue.lane}`,
    `- Area: ${issue.area}`,
    `- Risk: ${issue.risk}`,
    `- Labels: ${issue.labels.length ? issue.labels.join(', ') : 'None'}`,
    `- Latest summary: ${issue.latestCommentSummary || 'No latest comment or evidence summary available.'}`,
  ].join('\n');
}

export function buildWarRoomDispatchPrompt(issue: WarRoomIssue) {
  const targetRepo = issue.repo && issue.repo !== 'Unassigned' ? issue.repo : 'banyan-mission-control';
  const lane = issue.lane && issue.lane !== 'Unassigned' ? issue.lane : 'Codex';

  return `TASK:
${issue.title}

LANE:
${lane}

TARGET:
Repo: ${targetRepo}
Linear issue: ${issue.id}
Issue link: ${issue.url}

SOURCE FILES / SOURCE ISSUES READ THIS SESSION:
- Linear ${issue.id}: ${issue.title}
${issue.latestCommentSummary ? `- Latest issue summary/comment: ${issue.latestCommentSummary}` : '- Latest issue summary/comment: Not available in War Room data.'}
- War Room metadata:
${metadataLines(issue)}

SCOPE:
- Work only on the behavior described by ${issue.id}.
- Use the issue metadata, labels, and latest summary above as the dispatch context.
- Keep edits tightly scoped to ${targetRepo} and the relevant files discovered during implementation.
- Preserve existing production behavior outside this issue.

OUT OF SCOPE:
- No Field App changes unless ${issue.id} explicitly requires Field App work.
- No Drive edits.
- No production data writes.
- No Linear mutations.
- No unrelated Mission Control workflow changes.
- No client-side secrets.

PROTECTED SURFACES:
- Existing Mission Control routing, auth/session protection, and non-target modules.
- Existing War Room live Linear read-only behavior.
- Existing Linear project and issue state.
- Existing production data.

STOP CONDITIONS:
- Stop if implementation requires writing to Linear or another third-party system.
- Stop if the issue metadata is insufficient to classify the safe implementation path.
- Stop if unrelated dirty files would be mixed into the work.
- Stop if the change would expose secrets client-side.
- Stop if checks fail in a way unrelated to this issue.

VERIFY:
- Run the narrowest relevant automated checks for the changed files.
- Run git diff --check.
- Run TypeScript, lint, tests, and build when available.
- Verify the affected route or UI path locally.
- Capture screenshots or concrete output when the change affects UI.
- Confirm no production writes or Linear mutations occurred.

REPORT BACK WITH:
1. Branch / PR
2. Commit SHA
3. Files changed
4. Implementation summary
5. File:line evidence
6. Tests/checks run
7. Local/preview/production verification evidence
8. Known limitations
9. Follow-up issues needed
10. Confirmation no Field App, Drive, production data, Linear mutations, client-side secrets, or unrelated Mission Control workflows changed`;
}

export function warRoomDispatchPromptSections() {
  return REQUIRED_SECTIONS;
}
