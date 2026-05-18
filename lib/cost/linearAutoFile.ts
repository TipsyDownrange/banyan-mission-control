/**
 * Cost & Usage v2 — Linear auto-file for BROKEN_AUTH / BROKEN_SCHEMA.
 *
 * Best-effort fire-and-forget: if LINEAR_API_KEY is set, file a Linear issue
 * tagged Lane:Kai / Risk:P1 / Repo:MC when a cost source flips broken.
 * Dedup by title pattern within an in-process window to prevent storms.
 *
 * No-op when LINEAR_API_KEY is absent — we don't want this to be a hard
 * dependency that breaks /api/cost/ingest in environments without Linear.
 */

import type { CostSourceState } from './stateMachine';

const DEDUP_WINDOW_MS = 60 * 60 * 1000;
const recentTitles = new Map<string, number>();

const LINEAR_API = 'https://api.linear.app/graphql';

export interface AutoFileInput {
  source: string;
  state: Extract<CostSourceState, 'BROKEN_AUTH' | 'BROKEN_SCHEMA'>;
  detail?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export interface AutoFileResult {
  attempted: boolean;
  deduped: boolean;
  filed: boolean;
  reason?: string;
}

export async function autoFileCostBreak(input: AutoFileInput): Promise<AutoFileResult> {
  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) return { attempted: false, deduped: false, filed: false, reason: 'LINEAR_API_KEY not set' };

  const now = input.now || new Date();
  const title = `Cost source ${input.source} is ${input.state}`;

  const lastFiledMs = recentTitles.get(title);
  if (lastFiledMs && now.getTime() - lastFiledMs < DEDUP_WINDOW_MS) {
    return { attempted: true, deduped: true, filed: false, reason: 'dedup window' };
  }

  recentTitles.set(title, now.getTime());

  const fetchImpl = input.fetchImpl || fetch;
  const description = [
    `Detected at: ${now.toISOString()}`,
    `Source: ${input.source}`,
    `State: ${input.state}`,
    input.detail ? `Detail: ${input.detail}` : '',
    '',
    'Auto-filed by BAN-319 Cost & Usage v2 state machine.',
    'Lane:Kai · Risk:P1 · Repo:MC',
  ].filter(Boolean).join('\n');

  try {
    const res = await fetchImpl(LINEAR_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': apiKey,
      },
      body: JSON.stringify({
        query: `mutation($title:String!,$description:String!){ issueCreate(input:{title:$title,description:$description}){ success } }`,
        variables: { title, description },
      }),
    });
    if (!res.ok) {
      return { attempted: true, deduped: false, filed: false, reason: `HTTP ${res.status}` };
    }
    return { attempted: true, deduped: false, filed: true };
  } catch (err) {
    return { attempted: true, deduped: false, filed: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export function __resetLinearAutoFileDedupForTests(): void {
  recentTitles.clear();
}
