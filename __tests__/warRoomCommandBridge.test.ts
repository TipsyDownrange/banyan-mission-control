import {
  WAR_ROOM_RECURRING_MISSIONS,
  buildWarRoomCommandBridgeData,
  buildWarRoomLinearDescription,
  buildWarRoomLinearIssuePayload,
  buildWarRoomLinearLabels,
  validateWarRoomTaskIntake,
} from '../lib/war-room/commandBridge';
import type { WarRoomIssue } from '../lib/war-room/types';

const baseIssue: WarRoomIssue = {
  id: 'BAN-180',
  title: 'War Room command bridge',
  url: 'https://linear.app/banyan-os/issue/BAN-180/war-room',
  status: 'Todo',
  statusType: 'unstarted',
  priority: 'High',
  priorityValue: 2,
  labels: ['Workflow: Needs Sean Answer', 'Risk: P1', 'Lane: Codex', 'Area: War Room'],
  repo: 'MC',
  lane: 'Codex',
  area: 'War Room',
  risk: 'P1',
  latestCommentSummary: 'Blocked on command approval.',
  updatedAt: '2026-05-07T22:58:00.000Z',
  completedAt: null,
};

describe('War Room command bridge', () => {
  it('validates safe intake and builds Linear payload metadata without external execution', () => {
    const result = validateWarRoomTaskIntake({
      title: 'Build War Room intake',
      description: 'Create safe task intake and routing surface.',
      priority: 'P1',
      risk: 'P1',
      scopeType: 'code',
      suggestedLane: 'codex',
      safetyFlags: {
        noExternalWrites: true,
        stagingOnly: true,
        needsApproval: true,
        productionSensitive: false,
      },
    }, 'sean@kulaglass.com');

    expect(result.ok).toBe(true);
    expect(result.intake?.requestedBy).toBe('sean@kulaglass.com');
    expect(buildWarRoomLinearLabels(result.intake!)).toEqual(expect.arrayContaining([
      'Area: War Room',
      'Lane: Codex',
      'Workflow: Intake',
      'Risk: P1',
      'Source: War Room',
    ]));

    const description = buildWarRoomLinearDescription(result.intake!);
    expect(description).toContain('No autonomous agent dispatch from War Room.');
    expect(description).toContain('No shell execution from the web UI.');

    expect(buildWarRoomLinearIssuePayload(result.intake!, 'team-1')).toMatchObject({
      teamId: 'team-1',
      title: 'Build War Room intake',
      priority: 2,
    });
  });

  it('rejects unsafe intake that disables the BAN-180.A no-external-writes guardrail', () => {
    const result = validateWarRoomTaskIntake({
      title: 'Unsafe task',
      description: 'Try to run a production external write.',
      safetyFlags: {
        noExternalWrites: false,
        stagingOnly: false,
        needsApproval: false,
        productionSensitive: true,
      },
    }, 'sean@kulaglass.com');

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'noExternalWrites must remain enabled for BAN-180.A',
      'productionSensitive intake must require approval',
    ]));
  });

  it('does not accept autonomous dispatch as an intake lane', () => {
    const result = validateWarRoomTaskIntake({
      title: 'Route this manually',
      description: 'Create a safe manual intake record without autonomous dispatch.',
      suggestedLane: 'auto',
      safetyFlags: {
        noExternalWrites: true,
        stagingOnly: true,
        needsApproval: true,
        productionSensitive: false,
      },
    }, 'sean@kulaglass.com');

    expect(result.ok).toBe(true);
    expect(result.intake?.suggestedLane).toBe('kai');
    expect(buildWarRoomLinearDescription(result.intake!)).toContain('- Suggested lane: Kai / Captain');
    expect(buildWarRoomLinearDescription(result.intake!)).toContain('No autonomous agent dispatch from War Room.');
  });

  it('keeps recurring missions visible but disabled and derives approval/receipt surfaces', () => {
    expect(WAR_ROOM_RECURRING_MISSIONS.map(mission => mission.enabled)).toEqual(WAR_ROOM_RECURRING_MISSIONS.map(() => false));

    const bridge = buildWarRoomCommandBridgeData([
      baseIssue,
      {
        ...baseIssue,
        id: 'BAN-181',
        status: 'Done',
        statusType: 'completed',
        labels: ['State: Evidence Missing'],
        completedAt: '2026-05-07T23:10:00.000Z',
      },
    ]);

    expect(bridge.approvalInbox.map(item => item.issueId)).toContain('BAN-180');
    expect(bridge.receipts.map(receipt => receipt.taskId)).toContain('BAN-181');
    expect(bridge.agents.length).toBeGreaterThanOrEqual(10);
    expect(bridge.agents.map(agent => agent.status)).toEqual(expect.arrayContaining([
      'working',
      'idle',
      'waiting-approval',
      'disabled',
    ]));
    expect(bridge.agents.map(agent => agent.title)).toEqual(expect.arrayContaining([
      'Captain / Kai',
      'Codex',
      'Claude',
      'Inspector / QA Officer',
      'Costmaster',
      'Ship Log / Scribe',
      'Safety Officer',
    ]));
    expect(bridge.crewLanes.map(lane => lane.quotaStatus)).toEqual(expect.arrayContaining(['manual', 'unknown']));
  });
});
