import type { CrewRuntimeStatus } from './types';

export type WarRoomLiveOpsState =
  | 'ready'
  | 'working'
  | 'idle'
  | 'blocked'
  | 'waiting'
  | 'stale'
  | 'manual'
  | 'returned-unmerged'
  | 'verified-local'
  | 'pr-open'
  | 'merged'
  | 'deployed'
  | 'browser-verified'
  | 'unknown';

export interface WarRoomLiveOpsLane {
  id: 'kai' | 'codex' | 'claude';
  label: string;
  state: WarRoomLiveOpsState;
  active: string | null;
  issue: string | null;
  session: string | null;
  worktree: string | null;
  pr: string | null;
  lastActivityAt: string;
  staleAfterSeconds: number;
  source: 'heartbeat' | 'runtime-fallback';
  note: string;
}

export interface WarRoomLiveOpsSnapshot {
  generatedAt: string;
  staleAfterSeconds: number;
  lanes: WarRoomLiveOpsLane[];
}

type SnapshotInput = Partial<WarRoomLiveOpsSnapshot> & {
  lanes?: Array<Partial<WarRoomLiveOpsLane> & { id: WarRoomLiveOpsLane['id'] }>;
};

const DEFAULT_STALE_AFTER_SECONDS = 300;

export function parseLiveOpsSnapshot(raw: string | undefined, now = new Date()): WarRoomLiveOpsSnapshot | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as SnapshotInput;
    return normalizeLiveOpsSnapshot(parsed, now);
  } catch {
    return null;
  }
}

export function normalizeLiveOpsSnapshot(input: SnapshotInput, now = new Date()): WarRoomLiveOpsSnapshot {
  const generatedAt = validDate(input.generatedAt) || now.toISOString();
  const staleAfterSeconds = positiveNumber(input.staleAfterSeconds) || DEFAULT_STALE_AFTER_SECONDS;
  const lanes = (input.lanes || []).map(lane => normalizeLane(lane, now, staleAfterSeconds));

  return { generatedAt, staleAfterSeconds, lanes };
}

export function buildFallbackLiveOpsSnapshot(crews: CrewRuntimeStatus[], now = new Date()): WarRoomLiveOpsSnapshot {
  const nowIso = now.toISOString();
  return {
    generatedAt: nowIso,
    staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
    lanes: crews.map(crew => ({
      id: crew.id,
      label: crew.id === 'kai' ? 'Kai / Captain' : crew.id === 'codex' ? 'Codex / Build Crew' : 'Claude / Audit Crew',
      state: crew.health === 'ready' ? 'ready' : crew.health === 'manual' ? 'manual' : crew.health === 'blocked' ? 'blocked' : 'unknown',
      active: crew.id === 'kai' ? 'Operator lane available' : null,
      issue: null,
      session: null,
      worktree: null,
      pr: null,
      lastActivityAt: crew.lastCheckedAt || nowIso,
      staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS,
      source: 'runtime-fallback',
      note: crew.summary,
    })),
  };
}

function normalizeLane(
  lane: Partial<WarRoomLiveOpsLane> & { id: WarRoomLiveOpsLane['id'] },
  now: Date,
  defaultStaleAfterSeconds: number,
): WarRoomLiveOpsLane {
  const staleAfterSeconds = positiveNumber(lane.staleAfterSeconds) || defaultStaleAfterSeconds;
  const lastActivityAt = validDate(lane.lastActivityAt) || now.toISOString();
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / 1000));
  const state = ageSeconds > staleAfterSeconds && lane.state !== 'idle' && lane.state !== 'manual'
    ? 'stale'
    : validState(lane.state) || 'unknown';

  return {
    id: lane.id,
    label: lane.label || (lane.id === 'kai' ? 'Kai / Captain' : lane.id === 'codex' ? 'Codex / Build Crew' : 'Claude / Audit Crew'),
    state,
    active: stringOrNull(lane.active),
    issue: stringOrNull(lane.issue),
    session: stringOrNull(lane.session),
    worktree: stringOrNull(lane.worktree),
    pr: stringOrNull(lane.pr),
    lastActivityAt,
    staleAfterSeconds,
    source: lane.source === 'heartbeat' ? 'heartbeat' : 'runtime-fallback',
    note: lane.note || (state === 'stale' ? 'No heartbeat inside stale threshold.' : 'No live heartbeat detail supplied.'),
  };
}

function validState(value: unknown): WarRoomLiveOpsState | undefined {
  return typeof value === 'string' && [
    'ready', 'working', 'idle', 'blocked', 'waiting', 'stale', 'manual', 'returned-unmerged',
    'verified-local', 'pr-open', 'merged', 'deployed', 'browser-verified', 'unknown',
  ].includes(value) ? value as WarRoomLiveOpsState : undefined;
}

function validDate(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? value : undefined;
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
