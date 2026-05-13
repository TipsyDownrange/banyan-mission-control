const mockGetGoogleAuth = jest.fn();
const mockAppend = jest.fn();

jest.mock('@/lib/gauth', () => ({ getGoogleAuth: mockGetGoogleAuth }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/hawaii-time', () => ({ hawaiiNow: jest.fn(() => '2026-05-12T09:00:00-10:00') }));
jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({ spreadsheets: { values: { append: mockAppend } } })),
  },
}));

describe('BAN-214 Packet 004 Activity Spine MC completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockGetGoogleAuth.mockReturnValue({});
  });

  it('emitMCEvent resolves even when the backing append fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAppend.mockRejectedValueOnce(new Error('sheets outage'));

    try {
      const { emitMCEvent } = await import('@/lib/events');
      await expect(emitMCEvent({
        wo_id: 'WO-26-9999',
        event_type: 'ESTIMATE_SAVED',
        submitted_by: 'pm@kulaglass.com',
        origin: 'office',
      })).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith('[emitMCEvent] non-blocking emit failed:', expect.objectContaining({
        wo_id: 'WO-26-9999',
        event_type: 'ESTIMATE_SAVED',
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('ActivityTimeline exposes config for all Packet 004 v1 and future-only event types', async () => {
    const timeline = await import('@/components/ActivityTimeline');
    const requiredV1 = [
      'INSTALL_STEP',
      'FIELD_ISSUE',
      'DAILY_LOG',
      'FIELD_MEASUREMENT',
      'PHOTO_ONLY',
      'NOTE',
      'TM_CAPTURE',
      'PUNCH_LIST',
      'SITE_VISIT',
      'TESTING',
      'WARRANTY_CALLBACK',
      'STATUS_CHANGED',
      'STAGE_ROLLED_BACK',
      'STAGE_SKIPPED_FORWARD',
      'WO_DECLINED',
      'VENDOR_QUOTE_ADDED',
      'ESTIMATE_SAVED',
      'QUOTE_GENERATED',
      'WORK_BREAKDOWN_ADDED',
      'JOB_FILE_UPLOADED',
    ];
    const futureOnly = ['MASTER_LIBRARY_ENTRY_RETIRED', 'MASTER_LIBRARY_TOGGLE_CHANGED'];

    expect(timeline.ACTIVITY_TIMELINE_V1_EVENT_TYPES).toEqual(requiredV1);
    for (const eventType of [...requiredV1, ...futureOnly]) {
      expect(timeline.EVENT_CONFIG[eventType]).toEqual(expect.objectContaining({
        icon: expect.any(String),
        color: expect.any(String),
        bg: expect.any(String),
        label: expect.any(String),
      }));
    }
    const filterKeys = timeline.ACTIVITY_TIMELINE_TYPE_GROUPS.flatMap((g: { pills: Array<{ key: string }> }) => g.pills.map(p => p.key));
    for (const eventType of [...requiredV1, ...futureOnly]) {
      expect(filterKeys).toContain(eventType);
    }
    expect(timeline.ACTIVITY_TIMELINE_TYPE_GROUPS.some((g: { label: string }) => g.label === 'Mission Control')).toBe(true);
  });

  it('ActivityTimeline exposes BG1 app event metadata and domain groups', async () => {
    const timeline = await import('@/components/ActivityTimeline');
    const bg1Events = [
      'ORG_CREATED',
      'ORG_UPDATED',
      'ORG_MERGED',
      'CONTACT_CREATED',
      'SITE_CREATED',
      'ENGAGEMENT_CREATED',
      'ENGAGEMENT_STATUS_CHANGED',
      'ROUTING_DECISION_ASSIGNED',
      'PM_HANDOFF_STATE_TRANSITIONED',
      'WORK_RECORD_CREATED',
      'WORK_RECORD_STATE_CHANGED',
      'BID_PROMOTED',
      'ESTIMATE_VERSION_FROZEN',
      'ESTIMATE_VERSION_ACCEPTED',
      'PROPOSAL_VERSION_FROZEN',
      'PROPOSAL_VERSION_ACCEPTED',
      'PRICING_EVIDENCE_ADDED',
    ];

    expect(timeline.ACTIVITY_TIMELINE_BG1_APP_EVENT_TYPES).toEqual(bg1Events);
    for (const eventType of bg1Events) {
      expect(timeline.EVENT_CONFIG[eventType]).toEqual(expect.objectContaining({
        display_label: expect.any(String),
        color_token: expect.any(String),
        render_branch: expect.any(Function),
        default_origin: expect.stringMatching(/^(field|office|system)$/),
      }));
      expect(timeline.EVENT_CONFIG[eventType].icon).toBeTruthy();
    }

    const groupLabels = timeline.ACTIVITY_TIMELINE_TYPE_GROUPS.map((g: { label: string }) => g.label);
    expect(groupLabels).toEqual(expect.arrayContaining(['Identity', 'Engagement', 'Work Record', 'Service WO', 'Field']));
  });
});
