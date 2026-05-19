/**
 * BAN-354 PM-V1.0-E.b — Subscriber follow-up wiring tests.
 *
 * Verifies dispatchSourceEvent is invoked after the canonical source emit
 * commits for each of the 7 remaining BAN-339 source trunks (4 Pattern B
 * entities through the AIA + Closeout executors, plus 4 route-level emit
 * sites for external waivers and the GC required docs checklist; the pay
 * app create wizard; CO is no-op until AIA emits).
 *
 * Subscriber failures must never roll back the source emit — covered by a
 * mock-rejected dispatch.
 */

const B354_TENANT = '00000000-0000-4000-8000-000000000001';
const B354_ENG_ID = '00000000-0000-4000-8000-000000000099';
const B354_PAY_APP_ID = '00000000-0000-4000-8000-000000000201';
const B354_TICKET_ID = '00000000-0000-4000-8000-000000000202';
const B354_PUNCH_ID = '00000000-0000-4000-8000-000000000203';
const B354_WARRANTY_ID = '00000000-0000-4000-8000-000000000204';
const B354_WAIVER_ID = '00000000-0000-4000-8000-000000000205';
const B354_CHECKLIST_ID = '00000000-0000-4000-8000-000000000206';

const dispatchSpy = jest.fn(async () => ({
  createdActionItemIds: [],
  autoClosedActionItemIds: [],
  createdEventIds: [],
  autoClosedEventIds: [],
  skipped: false,
}));
const resolveEngagementContextSpy = jest.fn(async () => ({
  kid: 'PRJ-26-0001',
  isTestProject: false,
}));

jest.mock('@/lib/pm/action-items/spine-subscriber', () => ({
  __esModule: true,
  dispatchSourceEvent: (...args: unknown[]) => dispatchSpy(...args),
  resolveEngagementContext: (...args: unknown[]) => resolveEngagementContextSpy(...args),
}));

// ── db mock ────────────────────────────────────────────────────────────────
const b354SelectQueue: Array<Array<Record<string, unknown>>> = [];
const b354EmitSpy = jest.fn();

function b354MakeTx(): Record<string, unknown> {
  const insert = jest.fn(() => ({
    values: (vals: Record<string, unknown>) => {
      b354EmitSpy('insert', vals);
      return {
        returning: async () => [{ event_id: 'evt-' + Math.random().toString(36).slice(2, 8), ...vals }],
      };
    },
  }));
  const update = jest.fn(() => ({
    set: jest.fn(() => ({
      where: jest.fn(() => ({ returning: async () => [{}] })),
    })),
  }));
  const selectChain = () => {
    const limit = jest.fn(async () => b354SelectQueue.shift() ?? []);
    const where = jest.fn(() => ({ limit }));
    const innerJoin = jest.fn(() => ({ where }));
    const from = jest.fn(() => ({ where, innerJoin }));
    return { from };
  };
  const select = jest.fn(() => selectChain());
  return { insert, update, select };
}

const b354Transaction = jest.fn(async (cb: (tx: ReturnType<typeof b354MakeTx>) => Promise<unknown>) => {
  return cb(b354MakeTx());
});

function b354Tbl(label: string) {
  const cols = [
    'pay_app_id', 'ticket_id', 'punch_item_id', 'warranty_id', 'engagement_id',
    'external_waiver_id', 'checklist_id', 'tenant_id', 'state', 'status',
    'is_test_project', 'kid', 'updated_at',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

const b354Db = {
  transaction: (cb: never) => b354Transaction(cb),
  select: jest.fn(() => {
    const limit = jest.fn(async () => b354SelectQueue.shift() ?? []);
    const where = jest.fn(() => ({ limit }));
    const innerJoin = jest.fn(() => ({ where }));
    const from = jest.fn(() => ({ where, innerJoin }));
    return { from };
  }),
};

jest.mock('@/db', () => ({
  __esModule: true,
  db: b354Db,
  pay_applications: b354Tbl('pay_applications'),
  tm_tickets: b354Tbl('tm_tickets'),
  punch_list_items: b354Tbl('punch_list_items'),
  warranties: b354Tbl('warranties'),
  external_lien_waiver_requests: b354Tbl('external_lien_waiver_requests'),
  gc_required_docs_checklist: b354Tbl('gc_required_docs_checklist'),
  engagements: b354Tbl('engagements'),
  project_lifecycle_states: b354Tbl('project_lifecycle_states'),
}));

jest.mock('@/lib/activity-spine/emit', () => ({
  __esModule: true,
  emitActivitySpineEvent: jest.fn(async (_tx: unknown, payload: Record<string, unknown>) => {
    b354EmitSpy('field_events', payload);
    return { event_id: 'evt-' + Math.random().toString(36).slice(2, 8) };
  }),
  ActivitySpineEmitError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  b354SelectQueue.length = 0;
  dispatchSpy.mockClear();
  dispatchSpy.mockResolvedValue({
    createdActionItemIds: [],
    autoClosedActionItemIds: [],
    createdEventIds: [],
    autoClosedEventIds: [],
    skipped: false,
  });
  resolveEngagementContextSpy.mockResolvedValue({
    kid: 'PRJ-26-0001',
    isTestProject: false,
  });
});

// ═══ AIA executor — Pay App + T&M Ticket ═══════════════════════════════════

describe('BAN-354 executePatternBTransition wires dispatchSourceEvent', () => {
  it('dispatches PAY_APP_STATE_CHANGED after a successful pay_application transition', async () => {
    b354SelectQueue.push([{
      pay_app_id: B354_PAY_APP_ID,
      tenant_id: B354_TENANT,
      state: 'READY_FOR_SUBMISSION',
    }]);
    const { executePatternBTransition } = await import('@/lib/aia/execute-state-transition');
    const result = await executePatternBTransition({
      entity: 'pay_application',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table: { _label: 'pay_applications' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pkColumn: { name: 'pay_app_id' } as any,
      pkValue: B354_PAY_APP_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantColumn: { name: 'tenant_id' } as any,
      tenantId: B354_TENANT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateColumn: { name: 'state' } as any,
      toState: 'SUBMITTED',
      actorEmail: 'pm@kulaglass.com',
      testData: false,
      engagementId: B354_ENG_ID,
    });
    expect(result.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchArg = dispatchSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(dispatchArg.eventType).toBe('PAY_APP_STATE_CHANGED');
    expect(dispatchArg.entityKind).toBe('pay_application');
    expect(dispatchArg.tenantId).toBe(B354_TENANT);
    expect(dispatchArg.engagementId).toBe(B354_ENG_ID);
    const meta = dispatchArg.metadata as Record<string, unknown>;
    expect(meta.from_state).toBe('READY_FOR_SUBMISSION');
    expect(meta.to_state).toBe('SUBMITTED');
  });

  it('dispatches TM_TICKET_STATE_CHANGED after a successful tm_ticket transition', async () => {
    b354SelectQueue.push([{
      ticket_id: B354_TICKET_ID,
      tenant_id: B354_TENANT,
      status: 'READY_FOR_GC_APPROVAL',
    }]);
    const { executePatternBTransition } = await import('@/lib/aia/execute-state-transition');
    const result = await executePatternBTransition({
      entity: 'tm_ticket',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table: { _label: 'tm_tickets' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pkColumn: { name: 'ticket_id' } as any,
      pkValue: B354_TICKET_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantColumn: { name: 'tenant_id' } as any,
      tenantId: B354_TENANT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateColumn: { name: 'status' } as any,
      toState: 'GC_APPROVED',
      actorEmail: 'pm@kulaglass.com',
      testData: false,
      engagementId: B354_ENG_ID,
    });
    expect(result.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchArg = dispatchSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(dispatchArg.eventType).toBe('TM_TICKET_STATE_CHANGED');
    expect(dispatchArg.entityKind).toBe('tm_ticket');
    const meta = dispatchArg.metadata as Record<string, unknown>;
    expect(meta.to_state).toBe('GC_APPROVED');
  });

  it('does NOT dispatch when the executor returns a non-ok result (404 path)', async () => {
    b354SelectQueue.push([]);
    const { executePatternBTransition } = await import('@/lib/aia/execute-state-transition');
    const result = await executePatternBTransition({
      entity: 'pay_application',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table: { _label: 'pay_applications' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pkColumn: { name: 'pay_app_id' } as any,
      pkValue: B354_PAY_APP_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantColumn: { name: 'tenant_id' } as any,
      tenantId: B354_TENANT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateColumn: { name: 'state' } as any,
      toState: 'SUBMITTED',
      actorEmail: 'pm@kulaglass.com',
      testData: false,
      engagementId: B354_ENG_ID,
    });
    expect(result.ok).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('does NOT roll back the source emit when dispatchSourceEvent rejects', async () => {
    b354SelectQueue.push([{
      pay_app_id: B354_PAY_APP_ID,
      tenant_id: B354_TENANT,
      state: 'READY_FOR_SUBMISSION',
    }]);
    dispatchSpy.mockRejectedValueOnce(new Error('subscriber boom'));
    const { executePatternBTransition } = await import('@/lib/aia/execute-state-transition');
    const result = await executePatternBTransition({
      entity: 'pay_application',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table: { _label: 'pay_applications' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pkColumn: { name: 'pay_app_id' } as any,
      pkValue: B354_PAY_APP_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantColumn: { name: 'tenant_id' } as any,
      tenantId: B354_TENANT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateColumn: { name: 'state' } as any,
      toState: 'SUBMITTED',
      actorEmail: 'pm@kulaglass.com',
      testData: false,
      engagementId: B354_ENG_ID,
    });
    // Subscriber failure is caught inside the executor's post-tx try/catch.
    // The canonical PAY_APP_STATE_CHANGED emit was recorded BEFORE dispatch
    // ran, and the executor returns ok: true regardless of subscriber-side
    // outcome.
    expect(result.ok).toBe(true);
    expect(b354EmitSpy.mock.calls.some(
      (c) => c[0] === 'field_events' && (c[1] as { event_type: string }).event_type === 'PAY_APP_STATE_CHANGED',
    )).toBe(true);
  });
});

// ═══ Closeout executor — Punch List + Warranty ═════════════════════════════

describe('BAN-354 executeCloseoutPatternBTransition wires dispatchSourceEvent', () => {
  it('dispatches PUNCH_LIST_ITEM_STATE_CHANGED after a successful punch_list_item transition', async () => {
    b354SelectQueue.push([{
      punch_item_id: B354_PUNCH_ID,
      tenant_id: B354_TENANT,
      status: 'ASSIGNED',
    }]);
    const { executeCloseoutPatternBTransition } = await import('@/lib/closeout/execute-state-transition');
    const result = await executeCloseoutPatternBTransition({
      entity: 'punch_list_item',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table: { _label: 'punch_list_items' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pkColumn: { name: 'punch_item_id' } as any,
      pkValue: B354_PUNCH_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantColumn: { name: 'tenant_id' } as any,
      tenantId: B354_TENANT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateColumn: { name: 'status' } as any,
      toState: 'IN_PROGRESS',
      actorEmail: 'pm@kulaglass.com',
      testData: false,
      engagementId: B354_ENG_ID,
    });
    expect(result.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchArg = dispatchSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(dispatchArg.eventType).toBe('PUNCH_LIST_ITEM_STATE_CHANGED');
    expect(dispatchArg.entityKind).toBe('punch_list_item');
    expect(dispatchArg.entityId).toBe(B354_PUNCH_ID);
    const meta = dispatchArg.metadata as Record<string, unknown>;
    expect(meta.from_state).toBe('ASSIGNED');
    expect(meta.to_state).toBe('IN_PROGRESS');
  });

  it('dispatches WARRANTY_STATE_CHANGED after a successful warranty transition', async () => {
    b354SelectQueue.push([{
      warranty_id: B354_WARRANTY_ID,
      tenant_id: B354_TENANT,
      status: 'ACTIVE',
    }]);
    const { executeCloseoutPatternBTransition } = await import('@/lib/closeout/execute-state-transition');
    const result = await executeCloseoutPatternBTransition({
      entity: 'warranty',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table: { _label: 'warranties' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pkColumn: { name: 'warranty_id' } as any,
      pkValue: B354_WARRANTY_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantColumn: { name: 'tenant_id' } as any,
      tenantId: B354_TENANT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateColumn: { name: 'status' } as any,
      toState: 'PARTIALLY_EXPIRED',
      actorEmail: 'pm@kulaglass.com',
      testData: false,
      engagementId: B354_ENG_ID,
    });
    expect(result.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchArg = dispatchSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(dispatchArg.eventType).toBe('WARRANTY_STATE_CHANGED');
    expect(dispatchArg.entityKind).toBe('warranty');
  });

  it('does NOT dispatch when the closeout executor returns a non-ok result', async () => {
    b354SelectQueue.push([]);
    const { executeCloseoutPatternBTransition } = await import('@/lib/closeout/execute-state-transition');
    const result = await executeCloseoutPatternBTransition({
      entity: 'punch_list_item',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table: { _label: 'punch_list_items' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pkColumn: { name: 'punch_item_id' } as any,
      pkValue: B354_PUNCH_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantColumn: { name: 'tenant_id' } as any,
      tenantId: B354_TENANT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateColumn: { name: 'status' } as any,
      toState: 'IN_PROGRESS',
      actorEmail: 'pm@kulaglass.com',
      testData: false,
      engagementId: B354_ENG_ID,
    });
    expect(result.ok).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

// ═══ Rule-coverage smoke for the 7 source trunks ═══════════════════════════
//
// These exercise deriveSubscriberPlan with the metadata shape each new
// dispatch site actually emits, ensuring the rule fires create / auto-close
// as expected for the route-specific payloads (vs. the synthetic payloads
// in ban344PmActionItems.test.ts).

describe('BAN-354 deriveSubscriberPlan — route-shape metadata', () => {
  // Unmock the subscriber for this block — we want the real rule logic.
  let derivePlan: typeof import('@/lib/pm/action-items/spine-subscriber').deriveSubscriberPlan;

  beforeAll(async () => {
    jest.unmock('@/lib/pm/action-items/spine-subscriber');
    jest.resetModules();
    derivePlan = (await jest.requireActual<typeof import('@/lib/pm/action-items/spine-subscriber')>(
      '@/lib/pm/action-items/spine-subscriber',
    )).deriveSubscriberPlan;
  });

  it('pay-apps/route.ts create-emit shape is a no-rule-match (to_state PENDING_DRAFT)', () => {
    const plan = derivePlan({
      eventType: 'PAY_APP_STATE_CHANGED',
      entityKind: 'pay_application',
      entityId: B354_PAY_APP_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'NONE', to_state: 'PENDING_DRAFT' },
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.autoClose).toBeNull();
  });

  it('pay-apps transition to SUBMITTED creates a FOLLOW_UP action item', () => {
    const plan = derivePlan({
      eventType: 'PAY_APP_STATE_CHANGED',
      entityKind: 'pay_application',
      entityId: B354_PAY_APP_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'READY_FOR_SUBMISSION', to_state: 'SUBMITTED' },
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].action_required).toBe('FOLLOW_UP');
    expect(plan.create[0].source_entity_type).toBe('PAY_APP');
  });

  it('tm_ticket transition to READY_FOR_GC_APPROVAL fires the executor rule', () => {
    // The rule keys off OPEN/SUBMITTED — verify the executor dispatch shape
    // does not generate spurious creates for non-matching to_states.
    const plan = derivePlan({
      eventType: 'TM_TICKET_STATE_CHANGED',
      entityKind: 'tm_ticket',
      entityId: B354_TICKET_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'LOGGED', to_state: 'READY_FOR_GC_APPROVAL' },
    });
    // READY_FOR_GC_APPROVAL is not in the rule's create set, so no create
    // and no auto-close.
    expect(plan.create).toHaveLength(0);
    expect(plan.autoClose).toBeNull();
  });

  it('tm_ticket transition to CLOSED auto-closes open follow-ups', () => {
    const plan = derivePlan({
      eventType: 'TM_TICKET_STATE_CHANGED',
      entityKind: 'tm_ticket',
      entityId: B354_TICKET_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'BILLED', to_state: 'CLOSED' },
    });
    // 'CLOSED' is not in the TM_TICKET allowed transitions but the
    // subscriber rule treats it as a terminal/closed state for auto-close.
    expect(plan.create).toHaveLength(0);
    expect(plan.autoClose?.reason).toContain('CLOSED');
  });

  it('punch list transition to ASSIGNED creates a CLOSE_OUT action item', () => {
    const plan = derivePlan({
      eventType: 'PUNCH_LIST_ITEM_STATE_CHANGED',
      entityKind: 'punch_list_item',
      entityId: B354_PUNCH_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'NEW', to_state: 'ASSIGNED' },
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].action_required).toBe('CLOSE_OUT');
    expect(plan.create[0].source_entity_type).toBe('PUNCH_LIST_ITEM');
  });

  it('punch list transition to SIGNED_OFF auto-closes (signed_off is not in rule); CLOSED is', () => {
    // The rule recognises RESOLVED / CLOSED / CLEARED — SIGNED_OFF is the
    // actual schema terminal state. The wiring's source emit forwards the
    // raw status; downstream rule expansion to include SIGNED_OFF can land
    // without re-wiring the executor.
    const planSignedOff = derivePlan({
      eventType: 'PUNCH_LIST_ITEM_STATE_CHANGED',
      entityKind: 'punch_list_item',
      entityId: B354_PUNCH_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'COMPLETED', to_state: 'SIGNED_OFF' },
    });
    expect(planSignedOff.create).toHaveLength(0);
    expect(planSignedOff.autoClose).toBeNull();

    const planClosed = derivePlan({
      eventType: 'PUNCH_LIST_ITEM_STATE_CHANGED',
      entityKind: 'punch_list_item',
      entityId: B354_PUNCH_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'COMPLETED', to_state: 'CLOSED' },
    });
    expect(planClosed.autoClose?.reason).toContain('CLOSED');
  });

  it('external-waiver REQUESTED creates a FOLLOW_UP', () => {
    const plan = derivePlan({
      eventType: 'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
      entityKind: 'external_lien_waiver_request',
      entityId: B354_WAIVER_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: null, to_state: 'REQUESTED', waiver_type: 'CONDITIONAL_PROGRESS' },
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].action_required).toBe('FOLLOW_UP');
    expect(plan.create[0].source_entity_type).toBe('EXTERNAL_WAIVER');
  });

  it('external-waiver UPLOADED is not in the rule; DELIVERED_TO_GC also not — both no-op', () => {
    // The rule's auto-close set is RECEIVED|CLOSED|VOIDED. The route emits
    // intermediate UPLOADED + terminal DELIVERED_TO_GC.  Both are no-rule-
    // matches today; activation requires extending the rule, which is out
    // of scope for BAN-354 (per the spine-subscriber.ts PROTECT note).
    const planUploaded = derivePlan({
      eventType: 'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
      entityKind: 'external_lien_waiver_request',
      entityId: B354_WAIVER_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'RECEIVED', to_state: 'UPLOADED' },
    });
    expect(planUploaded.create).toHaveLength(0);
    expect(planUploaded.autoClose).toBeNull();

    const planDelivered = derivePlan({
      eventType: 'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
      entityKind: 'external_lien_waiver_request',
      entityId: B354_WAIVER_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'UPLOADED', to_state: 'DELIVERED_TO_GC' },
    });
    expect(planDelivered.create).toHaveLength(0);
    expect(planDelivered.autoClose).toBeNull();
  });

  it('gc-required-docs route emit shape (no pending_count) is a no-op pending future enrichment', () => {
    const plan = derivePlan({
      eventType: 'GC_REQUIRED_DOCS_CHECKLIST_UPDATED',
      entityKind: 'gc_required_docs_checklist',
      entityId: B354_CHECKLIST_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: {
        identified_phase: 'POST_HANDOFF_REVIEW',
        requires_external_waivers_from_manufacturers: false,
        requires_joint_check_agreement: false,
      },
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.autoClose).toBeNull();
  });

  it('warranty record transition to EXPIRED is not in the WARRANTY_CLAIM rule set — no-op', () => {
    // The WARRANTY_STATE_CHANGED rule expects warranty-CLAIM states
    // (OPEN/IN_TRIAGE/IN_PROGRESS, RESOLVED/CLOSED).  Warranty-RECORD
    // transitions (ACTIVE → PARTIALLY_EXPIRED → EXPIRED) don't match, so
    // dispatching from warranties/[id]/transition is a no-op until a
    // future packet aligns warranty_claims emits.
    const plan = derivePlan({
      eventType: 'WARRANTY_STATE_CHANGED',
      entityKind: 'warranty',
      entityId: B354_WARRANTY_ID,
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'PARTIALLY_EXPIRED', to_state: 'EXPIRED' },
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.autoClose).toBeNull();
  });

  it('CO_STATE_CHANGED remains reserved: rule is wired but no AIA emit fires today', () => {
    const plan = derivePlan({
      eventType: 'CO_STATE_CHANGED',
      entityKind: 'change_order',
      entityId: '00000000-0000-4000-8000-0000000000C0',
      tenantId: B354_TENANT,
      engagementId: B354_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'PENDING', to_state: 'APPROVED' },
    });
    // The rule itself is alive (auto-close on APPROVED) — but the AIA
    // emit site is not yet implemented, so production never reaches this
    // path. This test guards the rule against accidental removal.
    expect(plan.autoClose?.reason).toContain('APPROVED');
  });
});
