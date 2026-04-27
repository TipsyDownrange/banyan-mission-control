import { buildWarRoomDispatchPrompt, canPrepareWarRoomDispatch, warRoomDispatchPromptSections } from '../lib/war-room/dispatchPrompt';
import type { WarRoomIssue } from '../lib/war-room/types';

const readyIssue: WarRoomIssue = {
  id: 'BAN-52',
  title: 'MC: enable War Room Prepare Dispatch prompt generation',
  url: 'https://linear.app/banyan-os/issue/BAN-52/mc-enable-war-room-prepare-dispatch-prompt-generation',
  status: 'Todo',
  statusType: 'unstarted',
  priority: 'Urgent',
  priorityValue: 1,
  labels: ['Workflow: Ready for Codex', 'Risk: P1', 'Type: Build', 'Repo: MC', 'Lane: Codex', 'Area: Mission Control'],
  repo: 'MC',
  lane: 'Codex',
  area: 'Mission Control',
  risk: 'P1',
  latestCommentSummary: 'Generate a paste-ready Codex prompt inside BanyanOS.',
  updatedAt: '2026-04-27T21:15:07.236Z',
  completedAt: null,
};

describe('War Room dispatch prompt', () => {
  it('generates all required dispatch sections with issue metadata', () => {
    const prompt = buildWarRoomDispatchPrompt(readyIssue);

    for (const section of warRoomDispatchPromptSections()) {
      expect(prompt).toContain(`${section}:`);
    }

    expect(prompt).toContain('Linear issue: BAN-52');
    expect(prompt).toContain('Repo: MC');
    expect(prompt).toContain('Lane: Codex');
    expect(prompt).toContain('Risk: P1');
    expect(prompt).toContain('Workflow: Ready for Codex');
    expect(prompt).toContain('Generate a paste-ready Codex prompt inside BanyanOS.');
  });

  it('only enables prompt preparation for complete Ready for Codex issues that are not done', () => {
    expect(canPrepareWarRoomDispatch(readyIssue)).toBe(true);
    expect(canPrepareWarRoomDispatch({ ...readyIssue, labels: ['Risk: P1'] })).toBe(false);
    expect(canPrepareWarRoomDispatch({ ...readyIssue, status: 'Done', statusType: 'completed' })).toBe(false);
    expect(canPrepareWarRoomDispatch({ ...readyIssue, url: '' })).toBe(false);
  });
});
