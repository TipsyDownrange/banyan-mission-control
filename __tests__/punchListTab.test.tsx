import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PunchListTab, { PunchListTabView } from '../components/engagements/PunchListTab';
import type { PunchListItem } from '../components/engagements/PunchListItemDetailCard';

const ENG = {
  engagement_id: 'eng-1',
  kid: 'PRJ-26-0007',
  is_test_project: false,
};

const ITEM: PunchListItem = {
  punch_item_id: 'p1',
  item_number: 1,
  source: 'FIELD_ISSUE',
  source_ref: null,
  description: 'Touch up paint at frame',
  location: { floor: '1' },
  category: 'FINISH',
  responsible_party: 'KULA',
  photos_required: false,
  photo_evidence: [],
  assigned_to: null,
  due_date: null,
  status: 'NEW',
  completion_evidence: {},
  signoff_evidence: {},
  dispute_reason: null,
  dispute_resolution: null,
};

const EMPTY_SUMMARY = {
  total: 0,
  by_status: {
    NEW: 0, ASSIGNED: 0, IN_PROGRESS: 0, COMPLETED: 0,
    SIGNED_OFF: 0, DISPUTED: 0, DEFERRED_TO_WARRANTY: 0,
  },
  photos_present_count: 0,
};

describe('BAN-328 PunchListTab orchestrator', () => {
  it('renders the loading state on initial SSR (useEffect has not fired)', () => {
    const html = renderToStaticMarkup(<PunchListTab kID="PRJ-26-0007" />);
    expect(html).toContain('Loading punch list…');
  });

  it('renders the error state via PunchListTabView', () => {
    const html = renderToStaticMarkup(
      <PunchListTabView state={{ kind: 'error', message: 'boom' }} kID="PRJ-26-0007" />,
    );
    expect(html).toContain('Could not load punch list');
    expect(html).toContain('boom');
  });

  it('renders the kID-not-in-Postgres empty state when kIDFound is false', () => {
    const html = renderToStaticMarkup(
      <PunchListTabView
        state={{
          kind: 'ready',
          payload: { kIDFound: false, engagement: null, items: [], summary: EMPTY_SUMMARY },
        }}
        kID="PRJ-99-9999"
      />,
    );
    expect(html).toContain('isn');
    expect(html).toContain('Postgres closeout system');
    expect(html).toContain('PRJ-99-9999');
  });

  it('renders the zero-items empty state when engagement exists but list is empty', () => {
    const html = renderToStaticMarkup(
      <PunchListTabView
        state={{
          kind: 'ready',
          payload: { kIDFound: true, engagement: ENG, items: [], summary: EMPTY_SUMMARY },
        }}
        kID="PRJ-26-0007"
      />,
    );
    expect(html).toContain('No punch list items yet');
    // summary card still rendered, total = 0
    expect(html).toContain('Punch List Summary');
  });

  it('renders the full surface (summary + list) when items are present', () => {
    const html = renderToStaticMarkup(
      <PunchListTabView
        state={{
          kind: 'ready',
          payload: {
            kIDFound: true,
            engagement: ENG,
            items: [ITEM],
            summary: { ...EMPTY_SUMMARY, total: 1, by_status: { ...EMPTY_SUMMARY.by_status, NEW: 1 } },
          },
        }}
        kID="PRJ-26-0007"
      />,
    );
    expect(html).toContain('Punch List Summary');
    expect(html).toContain('Touch up paint at frame');
    expect(html).toContain('#1');
  });

  it('renders the TEST PROJECT pill when engagement.is_test_project is true', () => {
    const html = renderToStaticMarkup(
      <PunchListTabView
        state={{
          kind: 'ready',
          payload: {
            kIDFound: true,
            engagement: { ...ENG, is_test_project: true },
            items: [],
            summary: EMPTY_SUMMARY,
          },
        }}
        kID="PRJ-26-0007"
      />,
    );
    expect(html).toContain('TEST PROJECT');
  });

  it('does NOT render a GC formal signoff banner (deferred per BAN-332)', () => {
    const html = renderToStaticMarkup(
      <PunchListTabView
        state={{
          kind: 'ready',
          payload: {
            kIDFound: true,
            engagement: ENG,
            items: [ITEM],
            summary: { ...EMPTY_SUMMARY, total: 1, by_status: { ...EMPTY_SUMMARY.by_status, NEW: 1 } },
          },
        }}
        kID="PRJ-26-0007"
      />,
    );
    expect(html).not.toMatch(/gc formal signoff/i);
    expect(html).not.toMatch(/formally signed off/i);
  });
});
