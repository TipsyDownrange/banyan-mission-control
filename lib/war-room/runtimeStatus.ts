import type {
  CrewRuntimeStatus,
  WarRoomCostSnapshot,
  WarRoomLaneRecommendation,
  WarRoomRuntimeAuthState,
  WarRoomRuntimeHealth,
  WarRoomRuntimeHealthState,
  WarRoomRuntimeQuotaState,
  WarRoomRuntimeState,
  WarRoomSpendEntry,
  WarRoomUsageEntry,
} from './types';
import type {
  AggregatedBilled,
  ApiSpendSnapshot,
  LiveClaudeSnapshot,
  UsageSnapshot,
} from '../cost/types';
import { buildFallbackLiveOpsSnapshot, parseLiveOpsSnapshot } from './liveOps';

type CrewId = CrewRuntimeStatus['id'];

type CostApiData = {
  allInTotal?: number;
  totalCost?: number;
  todayCost?: number;
  weekCost?: number;
  monthlyBurn?: number;
  dailyBudget?: number;
  budgetPct?: number;
  overBudget?: boolean;
  byDay?: Record<string, { cost?: number; anthropic?: number; openai?: number }>;
  byProvider?: {
    anthropic?: { invoicesPaid?: number; apiCostToDate?: number; total?: number };
    openai?: { apiCostToDate?: number; total?: number };
    subscriptions?: { totalToDate?: number; monthly?: number };
    vercel?: { totalToDate?: number };
  };
  lastSync?: string;
  error?: string;
  liveClaudeSession?: LiveClaudeSnapshot | null;
  liveClaudeSessionAgeSeconds?: number | null;
  usage?: Array<UsageSnapshot & { storedAt?: string; ageSeconds?: number }>;
  spend?: Array<ApiSpendSnapshot & { storedAt?: string; ageSeconds?: number }>;
  billedToDate?: AggregatedBilled | null;
};

export type RuntimeProbePayload = Partial<{
  auth: WarRoomRuntimeAuthState;
  runtime: WarRoomRuntimeState;
  quota: WarRoomRuntimeQuotaState;
  summary: string;
  blockers: string[];
  disabled: boolean;
}>;

const RUNTIME_PROBE_TIMEOUT_MS = 2500;
const DEFAULT_DAILY_BUDGET = 50;

export function normalizeCrewRuntimeStatus(
  id: CrewId,
  payload: RuntimeProbePayload,
  nowIso: string,
): CrewRuntimeStatus {
  const auth = payload.auth || 'unknown';
  const runtime = payload.disabled ? 'disabled' : payload.runtime || 'unknown';
  const quota = payload.quota || 'unknown';
  const blockers = [...(payload.blockers || [])];
  let health: WarRoomRuntimeHealthState = 'ready';

  if (runtime === 'disabled' || payload.disabled) {
    health = 'disabled';
    if (blockers.length === 0) blockers.push('Runtime lane is disabled by configuration.');
  } else if (auth === 'missing' || auth === 'expired' || runtime === 'blocked') {
    health = 'blocked';
  } else if (auth === 'unknown' || runtime === 'unknown' || quota === 'unknown') {
    health = 'unknown';
  } else if (quota === 'manual' && runtime === 'degraded' && blockers.length === 0) {
    health = 'manual';
  } else if (runtime === 'degraded' || quota === 'manual' || quota === 'constrained' || blockers.length > 0) {
    health = 'degraded';
  }

  return {
    id,
    health,
    auth,
    runtime,
    quota,
    lastCheckedAt: nowIso,
    summary: payload.summary || defaultCrewSummary(id, health),
    blockers,
  };
}

export function mapCostApiDataToWarRoomSnapshot(data: CostApiData | null | undefined): WarRoomCostSnapshot {
  const allInTotal = money(data?.allInTotal ?? data?.totalCost ?? 0);
  const todayCost = money4(data?.todayCost ?? 0);
  const dailyBudget = money(data?.dailyBudget ?? DEFAULT_DAILY_BUDGET);
  const budgetPct = Number.isFinite(data?.budgetPct) ? Math.max(0, Math.round(data?.budgetPct || 0)) : Math.round((todayCost / dailyBudget) * 100);
  const providerValues = [
    {
      id: 'anthropic',
      label: 'Anthropic',
      value: money(data?.byProvider?.anthropic?.invoicesPaid ?? data?.byProvider?.anthropic?.apiCostToDate ?? data?.byProvider?.anthropic?.total ?? 0),
      color: '#4f46e5',
    },
    {
      id: 'openai',
      label: 'OpenAI',
      value: money(data?.byProvider?.openai?.apiCostToDate ?? data?.byProvider?.openai?.total ?? 0),
      color: '#059669',
    },
    {
      id: 'subscriptions',
      label: 'Subscriptions',
      value: money(data?.byProvider?.subscriptions?.totalToDate ?? 0),
      color: '#d97706',
    },
    {
      id: 'vercel',
      label: 'Vercel',
      value: money(data?.byProvider?.vercel?.totalToDate ?? 0),
      color: 'var(--bos-color-ink-disabled)',
    },
  ];

  return {
    allInTotal,
    todayCost,
    weekCost: money(data?.weekCost ?? 0),
    monthlyBurn: money(data?.monthlyBurn ?? data?.byProvider?.subscriptions?.monthly ?? 0),
    dailyBudget,
    budgetPct,
    overBudget: Boolean(data?.overBudget || todayCost > dailyBudget),
    providers: providerValues,
    byDay: Object.fromEntries(Object.entries(data?.byDay || {}).map(([date, day]) => [date, {
      cost: money4(day.cost ?? 0),
      anthropic: money4(day.anthropic ?? 0),
      openai: money4(day.openai ?? 0),
    }])),
    lastSync: data?.lastSync,
    error: data?.error,
    liveClaudeSession: data?.liveClaudeSession ?? null,
    liveClaudeSessionAgeSeconds: typeof data?.liveClaudeSessionAgeSeconds === 'number' ? data.liveClaudeSessionAgeSeconds : null,
    usage: extractUsageEntries(data?.usage),
    spend: extractSpendEntries(data?.spend),
    billedToDate: data?.billedToDate ?? null,
  };
}

function extractUsageEntries(usage: CostApiData['usage']): WarRoomUsageEntry[] {
  if (!Array.isArray(usage)) return [];
  return usage
    .filter(u => u && u.snapshot_type === 'usage')
    .map(u => {
      const { storedAt, ageSeconds, ...snapshot } = u;
      return {
        snapshot: snapshot as UsageSnapshot,
        storedAt: typeof storedAt === 'string' ? storedAt : '',
        ageSeconds: typeof ageSeconds === 'number' ? ageSeconds : 0,
      };
    });
}

function extractSpendEntries(spend: CostApiData['spend']): WarRoomSpendEntry[] {
  if (!Array.isArray(spend)) return [];
  return spend
    .filter(s => s && s.snapshot_type === 'spend')
    .map(s => {
      const { storedAt, ageSeconds, ...snapshot } = s;
      return {
        snapshot: snapshot as ApiSpendSnapshot,
        storedAt: typeof storedAt === 'string' ? storedAt : '',
        ageSeconds: typeof ageSeconds === 'number' ? ageSeconds : 0,
      };
    });
}

export async function buildWarRoomRuntimeHealth(options: {
  costData?: CostApiData | null;
  now?: Date;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<WarRoomRuntimeHealth> {
  const env = options.env || process.env;
  const nowIso = (options.now || new Date()).toISOString();
  const fetchImpl = options.fetchImpl || fetch;
  const kaiStatusUrl = env.KAI_RUNTIME_STATUS_URL || env.OPENCLAW_RUNTIME_STATUS_URL;
  const codexStatusUrl = env.CODEX_ACP_STATUS_URL;
  const claudeStatusUrl = env.CLAUDE_ACP_STATUS_URL || env.CLAUDE_CODE_STATUS_URL;

  const [kaiProbe, codexProbe, claudeProbe] = await Promise.all([
    kaiStatusUrl
      ? probeConfiguredRuntime(kaiStatusUrl, fetchImpl, 'Kai/OpenClaw')
      : Promise.resolve<RuntimeProbePayload>({
        auth: 'ok',
        runtime: 'ok',
        quota: 'verified',
        summary: 'Kai is active as the human-facing operator lane. Dispatch remains manual and approval-gated.',
      }),
    codexStatusUrl
      ? probeConfiguredRuntime(codexStatusUrl, fetchImpl, 'Codex ACP')
      : Promise.resolve<RuntimeProbePayload>({
        auth: 'ok',
        runtime: 'degraded',
        quota: 'manual',
        summary: 'Codex is on standby. Use after manual quota/session check; no live quota API is wired yet.',
      }),
    claudeStatusUrl
      ? probeConfiguredRuntime(claudeStatusUrl, fetchImpl, 'Claude Code ACP')
      : Promise.resolve<RuntimeProbePayload>({
        auth: 'ok',
        runtime: 'degraded',
        quota: 'manual',
        summary: 'Claude is on standby. Use after manual quota/session check; no live quota API is wired yet.',
      }),
  ]);

  const kai = normalizeCrewRuntimeStatus('kai', {
    auth: 'ok',
    quota: 'verified',
    ...kaiProbe,
  }, nowIso);
  const codex = normalizeCrewRuntimeStatus('codex', {
    auth: 'ok',
    quota: 'manual',
    ...codexProbe,
  }, nowIso);
  const claude = normalizeCrewRuntimeStatus('claude', {
    auth: 'ok',
    quota: 'manual',
    ...claudeProbe,
  }, nowIso);
  const cost = mapCostApiDataToWarRoomSnapshot(options.costData);

  const liveOps = parseLiveOpsSnapshot(env.WAR_ROOM_RUNTIME_SNAPSHOT_JSON, options.now || new Date())
    || buildFallbackLiveOpsSnapshot([kai, codex, claude], options.now || new Date());

  return {
    generatedAt: nowIso,
    kai,
    codex,
    claude,
    cost,
    recommendation: recommendLane({ kai, codex, claude }, cost),
    liveOps,
  };
}

function recommendLane(
  crews: Pick<WarRoomRuntimeHealth, 'kai' | 'codex' | 'claude'>,
  cost: WarRoomCostSnapshot,
): WarRoomLaneRecommendation {
  const readyBuildLane = [crews.codex, crews.claude].find(crew => crew.health === 'ready');
  if (readyBuildLane && !cost.overBudget) {
    return {
      lane: readyBuildLane.id,
      confidence: 'medium',
      summary: `${crewLabel(readyBuildLane.id)} is the safest verified build lane right now.`,
      reasons: ['Build lane reports ready.', 'Daily cost pressure is inside budget.'],
    };
  }

  if (cost.overBudget) {
    return {
      lane: 'kai',
      confidence: 'low',
      summary: 'Route through Kai until cost pressure and crew status are reviewed.',
      reasons: ['Daily API spend is over budget.', 'War Room does not autonomously dispatch work.'],
    };
  }

  return {
    lane: 'kai',
    confidence: 'low',
    summary: 'Kai is the default route. Codex and Claude are standby lanes until manually assigned.',
    reasons: [crews.codex.summary, crews.claude.summary],
  };
}

async function probeConfiguredRuntime(
  url: string,
  fetchImpl: typeof fetch,
  label: string,
): Promise<RuntimeProbePayload> {
  try {
    const response = await fetchWithTimeout(fetchImpl, url, RUNTIME_PROBE_TIMEOUT_MS);
    if (!response.ok) {
      return {
        runtime: 'blocked',
        blockers: [`${label} status endpoint returned HTTP ${response.status}.`],
        summary: `${label} status endpoint is reachable but blocked.`,
      };
    }

    const payload = await response.json().catch(() => ({}));
    const body = payload && typeof payload === 'object' ? payload as RuntimeProbePayload : {};
    return {
      auth: validAuth(body.auth),
      runtime: validRuntime(body.runtime),
      quota: validQuota(body.quota),
      summary: typeof body.summary === 'string' ? body.summary : `${label} status endpoint responded.`,
      blockers: Array.isArray(body.blockers) ? body.blockers.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [],
      disabled: Boolean(body.disabled),
    };
  } catch (error) {
    return {
      runtime: 'unknown',
      blockers: [`${label} status endpoint could not be reached: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function validAuth(value: unknown): WarRoomRuntimeAuthState | undefined {
  return value === 'ok' || value === 'missing' || value === 'expired' || value === 'unknown' ? value : undefined;
}

function validRuntime(value: unknown): WarRoomRuntimeState | undefined {
  return value === 'ok' || value === 'degraded' || value === 'blocked' || value === 'disabled' || value === 'unknown' ? value : undefined;
}

function validQuota(value: unknown): WarRoomRuntimeQuotaState | undefined {
  return value === 'verified' || value === 'manual' || value === 'constrained' || value === 'unknown' ? value : undefined;
}

function defaultCrewSummary(id: CrewId, health: WarRoomRuntimeHealthState) {
  return `${crewLabel(id)} health is ${health}.`;
}

function crewLabel(id: CrewId) {
  if (id === 'kai') return 'Kai';
  if (id === 'codex') return 'Codex';
  return 'Claude';
}

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function money4(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 10000) / 10000;
}
