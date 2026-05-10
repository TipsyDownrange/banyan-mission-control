import type {
  SourceAuthority,
  SourceHealthConflict,
  SourceHealthSnapshot,
  SourceHealthSourceCard,
  SourceHealthStatus,
  SourceHealthFreshness,
  SupabaseStagingHealth,
} from './types';

const SUPABASE_PROJECT_REF = 'utsocsidsblmudxyaekm';
const SUPABASE_PROJECT_NAME = 'banyan-os-staging';
const SUPABASE_REGION = 'us-west-2';
const SUPABASE_PROJECT_STATUS = 'ACTIVE_HEALTHY';
const SUPABASE_POSTGRES_VERSION = '17.6.1.113';
const BAN195_SERVICE_WORK_ORDERS = 577;
const BAN195_DRIFT_RUNS = 1;
const BAN195_DRIFT_DIFFS = 6005;
const SOURCE_PROBE_TIMEOUT_MS = 2500;
const LINEAR_API_URL = 'https://api.linear.app/graphql';
const NON_AUTHORIZATION_LABEL = 'Production authority: NO / Writes allowed: NO / Cutover approved: NO';

const LINEAR_CONTEXT_IDS = ['BAN-48', 'BAN-49', 'BAN-50', 'BAN-180', 'BAN-181', 'BAN-182', 'BAN-184', 'BAN-185', 'BAN-195', 'BAN-196', 'BAN-203'];

type FetchImpl = typeof fetch;

type SourceHealthOptions = {
  now?: Date;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchImpl;
};

type CountProbe = {
  count: number | null;
  channel: string;
  error?: string;
};

export async function buildWarRoomSourceHealthSnapshot(options: SourceHealthOptions = {}): Promise<SourceHealthSnapshot> {
  const now = options.now || new Date();
  const nowIso = now.toISOString();
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;

  const [supabase, linear, github, vercel, drive, runtime] = await Promise.all([
    buildSupabaseCard({ nowIso, env, fetchImpl }),
    buildLinearCard({ nowIso, env, fetchImpl }),
    Promise.resolve(buildGitHubCard(nowIso, env)),
    Promise.resolve(buildVercelCard(nowIso, env)),
    Promise.resolve(buildDriveCard(nowIso)),
    Promise.resolve(buildWarRoomRuntimeCard(nowIso)),
  ]);

  const sources = [linear.card, supabase.card, drive.card, github.card, vercel.card, runtime.card];
  const conflicts = buildConflicts(sources);
  const snapshot: SourceHealthSnapshot = {
    generatedAt: nowIso,
    environment: isStagingFromEnv(env) ? 'staging' : 'mixed',
    sources,
    conflicts,
    supabase: supabase.health,
    linear: linear.health,
    drive: drive.health,
    github: github.health,
    vercel: vercel.health,
  };

  return validateSourceHealthSnapshot(snapshot);
}

export function validateSourceHealthSnapshot(snapshot: SourceHealthSnapshot): SourceHealthSnapshot {
  for (const card of snapshot.sources) {
    assertCardCompatibility(card);
  }

  return snapshot;
}

export function assertCardCompatibility(card: SourceHealthSourceCard): void {
  if (card.status === 'healthy' && (card.freshness !== 'live' || card.isFallback)) {
    throw new Error(`${card.source} cannot be healthy unless freshness is live and isFallback is false.`);
  }

  if (card.freshness === 'last_verified' && card.isFallback && !['degraded', 'warning'].includes(card.status)) {
    throw new Error(`${card.source} last-verified fallback must be degraded or warning.`);
  }

  if (card.status === 'degraded' && (!card.unverifiedChannels || card.unverifiedChannels.length === 0)) {
    throw new Error(`${card.source} degraded cards must list unverifiedChannels.`);
  }

  if ((card.source === 'supabase' || card.authority === 'staging_shadow' || card.authority === 'last_verified_fallback') && !card.nonAuthorizationLabel) {
    throw new Error(`${card.source} requires a non-authorization label.`);
  }
}

async function buildSupabaseCard({ nowIso, env, fetchImpl }: { nowIso: string; env: NodeJS.ProcessEnv; fetchImpl: FetchImpl }) {
  const checkedChannels = ['BAN-195 canon evidence', 'project identity constants'];
  const unverifiedChannels: string[] = [];
  const url = trimTrailingSlash(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '');
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const schemaReachable = await probeSupabaseSchema(url, anonKey, fetchImpl);
  if (schemaReachable.ok) checkedChannels.push('postgrest_schema');
  else unverifiedChannels.push(schemaReachable.channel);

  const counts = await Promise.all([
    probeSupabaseCount(url, anonKey, fetchImpl, 'service_work_orders'),
    probeSupabaseCount(url, anonKey, fetchImpl, 'wo_drift_runs'),
    probeSupabaseCount(url, anonKey, fetchImpl, 'wo_drift_row_diffs'),
  ]);

  const serviceWorkOrders = counts[0].count;
  const driftRuns = counts[1].count;
  const driftDiffs = counts[2].count;
  for (const count of counts) {
    if (typeof count.count === 'number') checkedChannels.push(count.channel);
    else unverifiedChannels.push(count.channel);
  }

  const hasLiveCounts = counts.every(count => typeof count.count === 'number');
  const status: SourceHealthStatus = hasLiveCounts ? 'healthy' : 'degraded';
  const freshness: SourceHealthFreshness = hasLiveCounts ? 'live' : 'last_verified';
  const isFallback = !hasLiveCounts;

  const health: SupabaseStagingHealth = {
    projectRef: SUPABASE_PROJECT_REF,
    projectName: SUPABASE_PROJECT_NAME,
    projectStatus: SUPABASE_PROJECT_STATUS,
    region: SUPABASE_REGION,
    postgresVersion: SUPABASE_POSTGRES_VERSION,
    serviceWorkOrdersCount: serviceWorkOrders ?? BAN195_SERVICE_WORK_ORDERS,
    driftRunCount: driftRuns ?? BAN195_DRIFT_RUNS,
    driftDiffCount: driftDiffs ?? BAN195_DRIFT_DIFFS,
    latestDriftRun: {
      sheetsRowCount: BAN195_SERVICE_WORK_ORDERS,
      postgresRowCount: BAN195_SERVICE_WORK_ORDERS,
      rowsInBoth: BAN195_SERVICE_WORK_ORDERS,
      rowsWithFieldDrift: 0,
      totalFieldDriftCount: BAN195_DRIFT_DIFFS,
      stopConditionTriggered: true,
      stopConditionReason: hasLiveCounts ? 'Latest drift payload not queried in v1 safe path; BAN-195 stop evidence retained for context.' : 'Using last-verified BAN-195 evidence; live Supabase drift row unavailable.',
      schemaVersion: null,
    },
    securityAdvisorCount: null,
    performanceAdvisorCount: null,
    edgeFunctionCount: null,
    migrationCount: null,
  };

  const summary = hasLiveCounts
    ? 'Supabase staging identity and aggregate row counts are live-readable. Production authority remains explicitly NO.'
    : 'Using last-verified BAN-195 evidence; live Supabase row counts unavailable.';

  const details = [
    `Project ${SUPABASE_PROJECT_NAME} (${SUPABASE_PROJECT_REF}) / ${SUPABASE_REGION}`,
    `service_work_orders: ${health.serviceWorkOrdersCount}`,
    `wo_drift_runs: ${health.driftRunCount}`,
    `wo_drift_row_diffs: ${health.driftDiffCount}`,
    'BAN-195 stop condition evidence is included; BAN-196 remains the remediation rail.',
    'Advisor, migration, and edge function counts stay unknown unless safely count-readable.',
  ];

  const card: SourceHealthSourceCard = {
    source: 'supabase',
    label: 'Supabase Staging Shadow',
    status,
    authority: hasLiveCounts ? 'staging_shadow' : 'last_verified_fallback',
    freshness,
    freshnessLabel: hasLiveCounts ? 'Live Supabase count probe this snapshot.' : 'Last verified BAN-195 evidence; not live.',
    lastCheckedAt: nowIso,
    summary,
    details,
    isFallback,
    checkedChannels,
    unverifiedChannels: Array.from(new Set(unverifiedChannels)),
    nonAuthorizationLabel: NON_AUTHORIZATION_LABEL,
  };

  return { card, health };
}

async function probeSupabaseSchema(url: string, anonKey: string, fetchImpl: FetchImpl): Promise<{ ok: boolean; channel: string }> {
  if (!url || !anonKey) return { ok: false, channel: 'postgrest_schema_missing_env' };
  try {
    const response = await fetchWithTimeout(fetchImpl, `${url}/rest/v1/`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      cache: 'no-store',
    });
    return { ok: response.ok, channel: 'postgrest_schema' };
  } catch {
    return { ok: false, channel: 'postgrest_schema' };
  }
}

async function probeSupabaseCount(url: string, anonKey: string, fetchImpl: FetchImpl, table: string): Promise<CountProbe> {
  const channel = `rest_row_count_${table}`;
  if (!url || !anonKey) return { count: null, channel, error: 'missing anon REST configuration' };

  try {
    const response = await fetchWithTimeout(fetchImpl, `${url}/rest/v1/${table}?select=*`, {
      method: 'HEAD',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: 'count=exact',
      },
      cache: 'no-store',
    });
    if (!response.ok) return { count: null, channel, error: `HTTP ${response.status}` };
    const range = response.headers.get('content-range') || '';
    const count = Number(range.split('/')[1]);
    return Number.isFinite(count) ? { count, channel } : { count: null, channel, error: 'missing content-range count' };
  } catch (error) {
    return { count: null, channel, error: error instanceof Error ? error.message : String(error) };
  }
}

async function buildLinearCard({ nowIso, env, fetchImpl }: { nowIso: string; env: NodeJS.ProcessEnv; fetchImpl: FetchImpl }) {
  const apiKey = env.LINEAR_API_KEY;
  const checkedChannels: string[] = [];
  const unverifiedChannels: string[] = [];
  const details: string[] = ['Context issues include BAN-195 and BAN-196 for Supabase drift/remediation scope.'];
  let status: SourceHealthStatus = 'warning';
  let freshness: SourceHealthFreshness = 'manual';
  let lastCheckedAt: string | null = null;
  let summary = 'Linear source card is configured as read-only; live issue status is unavailable in this environment.';
  let issues: Array<{ id: string; status: string; title: string }> = [];

  if (apiKey) {
    try {
      const query = `
        query SourceHealthLinear($ids: [String!]) {
          issues(filter: { identifier: { in: $ids } }, first: 25) {
            nodes { identifier title state { name } }
          }
        }
      `;
      const response = await fetchWithTimeout(fetchImpl, LINEAR_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: apiKey },
        body: JSON.stringify({ query, variables: { ids: LINEAR_CONTEXT_IDS } }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload?.errors?.length) throw new Error(payload.errors.map((error: { message?: string }) => error.message || 'Linear error').join('; '));
      issues = (payload?.data?.issues?.nodes || []).map((issue: { identifier: string; title: string; state?: { name?: string } }) => ({
        id: issue.identifier,
        title: issue.title,
        status: issue.state?.name || 'Unknown',
      }));
      checkedChannels.push('linear_graphql_issue_statuses');
      lastCheckedAt = nowIso;
      freshness = 'live';
      status = issues.length ? 'healthy' : 'degraded';
      if (!issues.length) unverifiedChannels.push('linear_issue_context_empty');
      summary = issues.length
        ? 'Linear issue statuses are live-read only; no mutation route is used by Source Health.'
        : 'Linear API responded but returned no BAN context issues.';
      details.push(...issues.map(issue => `${issue.id}: ${issue.status} — ${issue.title}`));
    } catch (error) {
      status = 'degraded';
      freshness = 'unknown';
      unverifiedChannels.push('linear_graphql_issue_statuses');
      summary = `Linear read unavailable; Source Health did not mutate Linear. ${error instanceof Error ? error.message : String(error)}`;
    }
  } else {
    unverifiedChannels.push('linear_graphql_issue_statuses');
  }

  const card: SourceHealthSourceCard = {
    source: 'linear',
    label: 'Linear Build Board',
    status,
    authority: 'read_only_reference',
    freshness,
    freshnessLabel: freshness === 'live' ? 'Live Linear read this snapshot.' : 'Manual/read-only context; no live Linear key available.',
    lastCheckedAt,
    summary,
    details,
    isFallback: false,
    checkedChannels,
    unverifiedChannels,
  };

  return { card, health: { contextIssueIds: LINEAR_CONTEXT_IDS, issues } };
}

function buildDriveCard(nowIso: string) {
  const details = [
    'BANYAN_BUILD_BRIEF, Module Maturity Map, War Room v0.4 packet, Active Bundle Brief, and Canon Delta Ledger are the intended read-only metadata sources.',
    'Drive writes and canon cleanup are outside BAN-203.',
  ];
  const card: SourceHealthSourceCard = {
    source: 'drive',
    label: 'Drive Canon Freshness',
    status: 'warning',
    authority: 'read_only_reference',
    freshness: 'manual',
    freshnessLabel: 'Manual/canon context only; Drive metadata API is not wired in v1 route yet.',
    lastCheckedAt: nowIso,
    summary: 'Drive canon freshness is represented as a read-only reference card with explicit manual freshness.',
    details,
    isFallback: false,
    checkedChannels: ['BQS canon source list'],
    unverifiedChannels: ['drive_file_metadata_live_read'],
  };
  return { card, health: { checkedDocumentLabels: ['BANYAN_BUILD_BRIEF', 'Module Maturity Map', 'War Room v0.4 packet', 'Active Bundle Brief', 'Canon Delta Ledger'] } };
}

function buildGitHubCard(nowIso: string, env: NodeJS.ProcessEnv) {
  const sha = safeSha(env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || '');
  const hasSha = Boolean(sha);
  const card: SourceHealthSourceCard = {
    source: 'github',
    label: 'GitHub Repo State',
    status: hasSha ? 'healthy' : 'warning',
    authority: 'read_only_reference',
    freshness: hasSha ? 'live' : 'manual',
    freshnessLabel: hasSha ? 'Deployment commit SHA resolved from platform metadata.' : 'No platform commit metadata available in this environment.',
    lastCheckedAt: nowIso,
    summary: hasSha ? `Mission Control deployment commit resolved as ${sha}.` : 'Repo state is read-only but cannot be resolved from runtime metadata here.',
    details: ['Source Health does not push, merge, comment, or create GitHub branches.', hasSha ? `Commit: ${sha}` : 'origin/main must be verified by Kai outside this route.'],
    isFallback: false,
    checkedChannels: hasSha ? ['platform_commit_metadata'] : [],
    unverifiedChannels: hasSha ? [] : ['origin_main_live_sha'],
  };
  return { card, health: { commitSha: sha || null } };
}

function buildVercelCard(nowIso: string, env: NodeJS.ProcessEnv) {
  const target = env.VERCEL_TARGET_ENV;
  const gateResolved = env.WO_POSTGRES_READ_ENABLED === 'true' && isStagingFromEnv(env);
  const hasTarget = Boolean(target);
  const card: SourceHealthSourceCard = {
    source: 'vercel',
    label: 'Mission Control Vercel Deployment',
    status: hasTarget ? 'healthy' : 'warning',
    authority: 'read_only_reference',
    freshness: hasTarget ? 'live' : 'manual',
    freshnessLabel: hasTarget ? 'Runtime deployment labels resolved without exposing raw env values.' : 'No Vercel runtime labels available locally.',
    lastCheckedAt: nowIso,
    summary: `Mission Control only. Postgres shadow-read gate resolves ${gateResolved ? 'enabled-for-staging' : 'closed-or-not-staging'}.`,
    details: [
      'Field App deployment card intentionally excluded from v1.',
      `Resolved WO Postgres gate label: ${gateResolved ? 'enabled-for-staging' : 'closed-or-not-staging'}`,
      'Raw Vercel env variable values are not displayed.',
    ],
    isFallback: false,
    checkedChannels: hasTarget ? ['vercel_runtime_metadata', 'resolved_postgres_gate_label'] : ['resolved_postgres_gate_label'],
    unverifiedChannels: hasTarget ? [] : ['vercel_deployment_api'],
  };
  return { card, health: { missionControlOnly: true, postgresGateLabel: gateResolved ? 'enabled-for-staging' : 'closed-or-not-staging' } };
}

function buildWarRoomRuntimeCard(nowIso: string) {
  const card: SourceHealthSourceCard = {
    source: 'war_room_runtime',
    label: 'War Room Runtime Heartbeat',
    status: 'warning',
    authority: 'non_authoritative',
    freshness: 'manual',
    freshnessLabel: 'Existing runtime dashboard remains isolated; this card is a non-authoritative watch indicator.',
    lastCheckedAt: nowIso,
    summary: 'Runtime health remains on /api/war-room/runtime-status. Source Health does not infer dispatch readiness from it.',
    details: ['No agents, shell commands, fixes, syncs, or cutovers run from Source Health.'],
    isFallback: false,
    checkedChannels: ['route_isolation_contract'],
    unverifiedChannels: ['runtime_status_live_join'],
  };
  return { card, health: { isolatedRuntimeRoute: '/api/war-room/runtime-status' } };
}

function buildConflicts(sources: SourceHealthSourceCard[]): SourceHealthConflict[] {
  const conflicts: SourceHealthConflict[] = [];
  const supabase = sources.find(source => source.source === 'supabase');
  if (supabase?.isFallback) {
    conflicts.push({
      id: 'supabase-row-counts-last-verified',
      severity: 'high',
      sourceA: 'supabase',
      sourceB: 'BAN-195',
      currentA: 'Live row counts unavailable.',
      currentB: 'BAN-195 fallback values 577 / 1 / 6005 are displayed as last verified.',
      recommendedAction: 'Keep remediation in BAN-196; do not treat staging shadow as production authority.',
    });
  }
  return conflicts;
}

async function fetchWithTimeout(fetchImpl: FetchImpl, input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_PROBE_TIMEOUT_MS);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function isStagingFromEnv(env: NodeJS.ProcessEnv) {
  return env.VERCEL_TARGET_ENV === 'staging';
}

function safeSha(value: string) {
  const match = value.match(/^[a-f0-9]{7,40}$/i);
  if (!match) return '';
  return value.slice(0, 12);
}
