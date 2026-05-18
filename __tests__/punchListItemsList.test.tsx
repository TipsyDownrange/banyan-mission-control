import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PunchListItemsList, {
  filterPunchListItems,
} from '../components/engagements/PunchListItemsList';
import type { PunchListItem } from '../components/engagements/PunchListItemDetailCard';

function mk(overrides: Partial<PunchListItem>): PunchListItem {
  return {
    punch_item_id: 'id-' + (overrides.item_number ?? 0),
    item_number: 1,
    source: 'FIELD_ISSUE',
    source_ref: null,
    description: 'desc',
    location: {},
    category: 'GLASS',
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
    ...overrides,
  };
}

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB   = '22222222-2222-2222-2222-222222222222';

const fixture: PunchListItem[] = [
  mk({ punch_item_id: 'i1', item_number: 1, status: 'NEW',         source: 'FIELD_ISSUE',           category: 'GLASS',      assigned_to: ALICE }),
  mk({ punch_item_id: 'i2', item_number: 2, status: 'IN_PROGRESS', source: 'SUBSTANTIAL_WALKTHROUGH', category: 'SEALANT',    assigned_to: BOB }),
  mk({ punch_item_id: 'i3', item_number: 3, status: 'COMPLETED',   source: 'GC_TRANSMITTAL',         category: 'HARDWARE',   assigned_to: ALICE }),
  mk({ punch_item_id: 'i4', item_number: 4, status: 'DISPUTED',    source: 'INTERNAL_QA',             category: 'GLASS',      assigned_to: null  }),
];

describe('BAN-328 filterPunchListItems (pure helper)', () => {
  it('returns all items when no filters are applied', () => {
    expect(filterPunchListItems(fixture, {
      statuses: new Set(), sources: new Set(), categories: new Set(), assignee: null,
    })).toHaveLength(4);
  });

  it('filters by status (multi-select OR)', () => {
    const out = filterPunchListItems(fixture, {
      statuses: new Set(['NEW', 'DISPUTED']),
      sources: new Set(), categories: new Set(), assignee: null,
    });
    expect(out.map((i) => i.item_number).sort()).toEqual([1, 4]);
  });

  it('filters by source (multi-select OR)', () => {
    const out = filterPunchListItems(fixture, {
      statuses: new Set(),
      sources: new Set(['FIELD_ISSUE']),
      categories: new Set(), assignee: null,
    });
    expect(out.map((i) => i.item_number)).toEqual([1]);
  });

  it('filters by category (multi-select OR)', () => {
    const out = filterPunchListItems(fixture, {
      statuses: new Set(), sources: new Set(),
      categories: new Set(['GLASS']),
      assignee: null,
    });
    expect(out.map((i) => i.item_number).sort()).toEqual([1, 4]);
  });

  it('filters by assignee user_id (single)', () => {
    const out = filterPunchListItems(fixture, {
      statuses: new Set(), sources: new Set(), categories: new Set(),
      assignee: ALICE,
    });
    expect(out.map((i) => i.item_number).sort()).toEqual([1, 3]);
  });

  it('filters by __unassigned__ sentinel', () => {
    const out = filterPunchListItems(fixture, {
      statuses: new Set(), sources: new Set(), categories: new Set(),
      assignee: '__unassigned__',
    });
    expect(out.map((i) => i.item_number)).toEqual([4]);
  });

  it('intersects multiple filter dimensions (AND across, OR within)', () => {
    const out = filterPunchListItems(fixture, {
      statuses: new Set(['NEW', 'IN_PROGRESS']),
      sources: new Set(),
      categories: new Set(['GLASS']),
      assignee: ALICE,
    });
    // status ∈ {NEW, IN_PROGRESS} AND category=GLASS AND assignee=ALICE → i1
    expect(out.map((i) => i.item_number)).toEqual([1]);
  });
});

describe('BAN-328 PunchListItemsList (rendering)', () => {
  it('renders one card per item and the filter group labels', () => {
    const html = renderToStaticMarkup(<PunchListItemsList items={fixture} />);
    expect(html).toContain('Status');
    expect(html).toContain('Source');
    expect(html).toContain('Category');
    expect(html).toContain('Assignee');
    // count summary
    expect(html).toContain('Showing 4 of 4 items');
    // 4 cards rendered (one per item_number)
    expect(html).toContain('#1');
    expect(html).toContain('#2');
    expect(html).toContain('#3');
    expect(html).toContain('#4');
  });

  it('renders an empty-filters message when items list is empty', () => {
    const html = renderToStaticMarkup(<PunchListItemsList items={[]} />);
    expect(html).toContain('Showing 0 of 0 items');
    expect(html).toContain('No items match the current filters.');
  });
});
