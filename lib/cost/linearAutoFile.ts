/**
 * Cost & Usage Phase 1 v2 — Linear auto-file on BROKEN_AUTH / BROKEN_SCHEMA.
 *
 * Per packet §5.2: when a relay lane enters BROKEN_AUTH or BROKEN_SCHEMA for
 * the first time, file a Linear issue so the operator gets a tractable
 * surface. Dedupe by exact title — "Cost Relay BROKEN_{state} — {provider}/{lane}".
 *
 * Pattern matches lib/war-room/data.ts (direct GraphQL fetch, LINEAR_API_KEY).
 */

import type { CostProvider, RelayLastError, RelayState } from './types';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

export type RelayLane = 'usage' | 'spend' | 'billed';

export interface AutoFileInput {
  state: RelayState;
  provider: CostProvider;
  lane: RelayLane;
  endpointUrl?: string;
  lastError?: RelayLastError | null;
  lastSuccessAt?: string | null;
  /** Linear team key (defaults to BAN) */
  teamKey?: string;
}

export interface AutoFileResult {
  attempted: boolean;
  skipped?: 'no_api_key' | 'duplicate' | 'state_not_actionable';
  issueIdentifier?: string;
  error?: string;
}

const RUNBOOK_URL = 'https://drive.google.com/file/d/1Q3WkcehKMQ31PZC8GtamBZ5UiLQBLnem/view'; // packet §6.3

export async function autoFileBrokenRelay(
  input: AutoFileInput,
  fetchImpl: typeof fetch = fetch,
): Promise<AutoFileResult> {
  if (input.state !== 'BROKEN_AUTH' && input.state !== 'BROKEN_SCHEMA') {
    return { attempted: false, skipped: 'state_not_actionable' };
  }

  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) {
    return { attempted: false, skipped: 'no_api_key' };
  }

  const title = `Cost Relay ${input.state} — ${input.provider}/${input.lane}`;

  // Dedupe — check for open issue with this title.
  const existing = await findOpenIssueByTitle(title, apiKey, fetchImpl);
  if (existing) {
    return { attempted: true, skipped: 'duplicate', issueIdentifier: existing };
  }

  const teamKey = input.teamKey || 'BAN';
  const teamId = await resolveTeamId(teamKey, apiKey, fetchImpl);
  if (!teamId) {
    return { attempted: true, error: `team ${teamKey} not found` };
  }

  const description = buildIssueDescription(input);

  const mutation = `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { identifier url }
      }
    }
  `;

  try {
    const res = await fetchImpl(LINEAR_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: apiKey },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            teamId,
            title,
            description,
            priority: 2, // High — packet §5.2
            labelIds: [],
          },
        },
      }),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const issue = (json as { data?: { issueCreate?: { issue?: { identifier?: string } } } }).data?.issueCreate?.issue;
    if (issue?.identifier) {
      return { attempted: true, issueIdentifier: issue.identifier };
    }
    return { attempted: true, error: `unexpected response: ${JSON.stringify(json).slice(0, 200)}` };
  } catch (err) {
    return { attempted: true, error: err instanceof Error ? err.message : String(err) };
  }
}

async function findOpenIssueByTitle(
  title: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const query = `
    query OpenIssuesByTitle($title: String!) {
      issues(filter: { title: { eq: $title }, state: { type: { neq: "completed" } } }, first: 1) {
        nodes { identifier }
      }
    }
  `;
  try {
    const res = await fetchImpl(LINEAR_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: apiKey },
      body: JSON.stringify({ query, variables: { title } }),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const nodes = (json as { data?: { issues?: { nodes?: Array<{ identifier?: string }> } } }).data?.issues?.nodes || [];
    return nodes[0]?.identifier ?? null;
  } catch {
    return null;
  }
}

async function resolveTeamId(
  teamKey: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const query = `
    query TeamByKey($key: String!) {
      teams(filter: { key: { eq: $key } }, first: 1) {
        nodes { id }
      }
    }
  `;
  try {
    const res = await fetchImpl(LINEAR_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: apiKey },
      body: JSON.stringify({ query, variables: { key: teamKey } }),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const nodes = (json as { data?: { teams?: { nodes?: Array<{ id?: string }> } } }).data?.teams?.nodes || [];
    return nodes[0]?.id ?? null;
  } catch {
    return null;
  }
}

function buildIssueDescription(input: AutoFileInput): string {
  const excerpt = input.lastError?.responseExcerpt
    ? `\n\n**Response excerpt:**\n\n\`\`\`\n${input.lastError.responseExcerpt.slice(0, 800)}\n\`\`\``
    : '';
  return [
    `## Cost Relay BROKEN — auto-filed by Mission Control`,
    ``,
    `**Provider:** ${input.provider}`,
    `**Lane:** ${input.lane}`,
    `**State:** ${input.state}`,
    input.endpointUrl ? `**Endpoint:** \`${input.endpointUrl}\`` : '',
    input.lastError?.httpStatus ? `**HTTP status:** ${input.lastError.httpStatus}` : '',
    input.lastError?.message ? `**Error:** ${input.lastError.message}` : '',
    input.lastSuccessAt ? `**Last successful ingest:** ${input.lastSuccessAt}` : `**Last successful ingest:** never`,
    excerpt,
    ``,
    `**Refresh runbook:** [BAN-319 packet §6.3](${RUNBOOK_URL})`,
    ``,
    `Lane: Kai · Risk: P1 · Repo: MC`,
  ].filter(Boolean).join('\n');
}
