/**
 * BAN-374 Scheduling Spine — /api/schedule/dependencies
 *
 *   GET ?engagement_kid=...   list every dependency within a project
 *   POST                      create a dep, with cycle + self-loop checks
 *
 * Cycle detection runs in the route layer (lib/schedule/dependencies)
 * before the DB insert.  The DB also enforces a unique edge index and a
 * CHECK that predecessor != successor, so race-loss between the
 * application check and the insert still returns a 409 / DB error.
 */

import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import {
  db,
  engagements,
  schedule_dependencies,
  schedule_tasks,
  SCHEDULE_DEPENDENCY_TYPES,
} from '@/db';
import { passScheduleReadGate, passScheduleWriteGate } from '@/lib/schedule/api-gate';
import { wouldCreateCycle, type Edge } from '@/lib/schedule/dependencies';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function GET(req: Request) {
  const gate = await passScheduleReadGate();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementKid = (url.searchParams.get('engagement_kid') ?? '').trim();
  if (!engagementKid) {
    return NextResponse.json(
      { error: 'engagement_kid is required' },
      { status: 400 },
    );
  }

  const eng = await db
    .select({ engagement_id: engagements.engagement_id })
    .from(engagements)
    .where(and(eq(engagements.tenant_id, gate.tenantId), eq(engagements.kid, engagementKid)))
    .limit(1);

  if (eng.length === 0) {
    return NextResponse.json({ kIDFound: false, items: [] });
  }

  // Resolve every task in this project, then list deps whose endpoints are
  // both in that task set.  This is the "all deps for the project" view.
  const tasks = await db
    .select({ id: schedule_tasks.id })
    .from(schedule_tasks)
    .where(
      and(
        eq(schedule_tasks.tenant_id, gate.tenantId),
        eq(schedule_tasks.engagement_id, eng[0].engagement_id),
      ),
    );

  if (tasks.length === 0) {
    return NextResponse.json({ kIDFound: true, items: [] });
  }

  const taskIds = tasks.map((t) => t.id);
  const rows = await db
    .select()
    .from(schedule_dependencies)
    .where(
      and(
        eq(schedule_dependencies.tenant_id, gate.tenantId),
        inArray(schedule_dependencies.predecessor_task_id, taskIds),
        inArray(schedule_dependencies.successor_task_id, taskIds),
      ),
    );

  return NextResponse.json({ kIDFound: true, items: rows });
}

export async function POST(req: Request) {
  const gate = await passScheduleWriteGate();
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const predecessor = typeof body.predecessor_task_id === 'string'
    ? body.predecessor_task_id.trim()
    : '';
  const successor = typeof body.successor_task_id === 'string'
    ? body.successor_task_id.trim()
    : '';
  if (!predecessor || !isUuid(predecessor) || !successor || !isUuid(successor)) {
    return NextResponse.json(
      { error: 'predecessor_task_id and successor_task_id must be valid UUIDs' },
      { status: 400 },
    );
  }
  if (predecessor === successor) {
    return NextResponse.json(
      { error: 'a task cannot depend on itself' },
      { status: 400 },
    );
  }

  const type = typeof body.type === 'string' ? body.type : 'finish_to_start';
  if (!SCHEDULE_DEPENDENCY_TYPES.includes(type as typeof SCHEDULE_DEPENDENCY_TYPES[number])) {
    return NextResponse.json({ error: `invalid type: ${type}` }, { status: 400 });
  }
  const lagDays = Number.isFinite(body.lag_days as number)
    ? Math.trunc(body.lag_days as number)
    : 0;

  // Verify both tasks exist and belong to the same engagement under our tenant.
  const taskRows = await db
    .select({ id: schedule_tasks.id, engagement_id: schedule_tasks.engagement_id })
    .from(schedule_tasks)
    .where(
      and(
        eq(schedule_tasks.tenant_id, gate.tenantId),
        inArray(schedule_tasks.id, [predecessor, successor]),
      ),
    );

  if (taskRows.length < 2) {
    return NextResponse.json(
      { error: 'predecessor or successor task not found in this tenant' },
      { status: 404 },
    );
  }
  if (taskRows[0].engagement_id !== taskRows[1].engagement_id) {
    return NextResponse.json(
      { error: 'predecessor and successor must belong to the same project' },
      { status: 400 },
    );
  }

  // Cycle detection against all existing edges in this engagement's tasks.
  const allTasks = await db
    .select({ id: schedule_tasks.id })
    .from(schedule_tasks)
    .where(
      and(
        eq(schedule_tasks.tenant_id, gate.tenantId),
        eq(schedule_tasks.engagement_id, taskRows[0].engagement_id),
      ),
    );
  const allTaskIds = allTasks.map((t) => t.id);

  const existing = allTaskIds.length === 0
    ? []
    : await db
        .select({
          predecessor_task_id: schedule_dependencies.predecessor_task_id,
          successor_task_id: schedule_dependencies.successor_task_id,
        })
        .from(schedule_dependencies)
        .where(
          and(
            eq(schedule_dependencies.tenant_id, gate.tenantId),
            inArray(schedule_dependencies.predecessor_task_id, allTaskIds),
            inArray(schedule_dependencies.successor_task_id, allTaskIds),
          ),
        );

  if (wouldCreateCycle(existing as Edge[], predecessor, successor)) {
    return NextResponse.json(
      {
        error: 'adding this dependency would create a cycle',
        code: 'DEPENDENCY_CYCLE',
      },
      { status: 400 },
    );
  }

  try {
    const inserted = await db
      .insert(schedule_dependencies)
      .values({
        tenant_id: gate.tenantId,
        predecessor_task_id: predecessor,
        successor_task_id: successor,
        type: type as typeof SCHEDULE_DEPENDENCY_TYPES[number],
        lag_days: lagDays,
      })
      .returning();

    return NextResponse.json({ ok: true, dependency: inserted[0] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key value violates unique constraint/.test(msg)) {
      return NextResponse.json(
        {
          error: 'this dependency edge already exists',
          code: 'DUPLICATE_DEPENDENCY',
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
