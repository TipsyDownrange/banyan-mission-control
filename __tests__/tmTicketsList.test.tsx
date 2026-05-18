/**
 * BAN-329 — TMTicketsList
 *
 * SSR smoke for the filter row + initial list rendering. Filter logic
 * is unit-tested at the SSR snapshot level (initial state) since the
 * component uses useState — interactive filter tests would require
 * a DOM environment + user-event which the BAN-322 leaf suites
 * deliberately don't pull in.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TMTicketsList, { type TMTicket } from '../components/engagements/TMTicketsList';
import { TM_TICKET_STATES } from '../lib/aia/state-transitions';

function ticket(overrides: Partial<TMTicket>): TMTicket {
  return {
    ticket_id: overrides.ticket_id ?? 't-1',
    tm_auth_id: overrides.tm_auth_id ?? 'a-1',
    engagement_id: overrides.engagement_id ?? 'e-1',
    ticket_number: overrides.ticket_number ?? '001',
    work_date: overrides.work_date ?? '2026-04-01',
    description: overrides.description ?? 'Stub scope',
    labor: overrides.labor ?? [],
    labor_total: overrides.labor_total ?? '0',
    materials: overrides.materials ?? [],
    materials_total: overrides.materials_total ?? '0',
    equipment: overrides.equipment ?? [],
    equipment_total: overrides.equipment_total ?? '0',
    ticket_total: overrides.ticket_total ?? '0',
    status: overrides.status ?? 'DRAFT',
    ...overrides,
  };
}

describe('BAN-329 TMTicketsList', () => {
  it('renders the canonical "no tickets yet" empty state when given zero tickets', () => {
    const html = renderToStaticMarkup(<TMTicketsList tickets={[]} />);
    expect(html).toContain('tm-tickets-empty');
    expect(html).toContain('No T&amp;M tickets yet');
    // filters should NOT render in the empty state
    expect(html).not.toContain('tm-tickets-filters');
  });

  it('renders filter chips for every code-actual state', () => {
    const tickets = [ticket({ ticket_id: '1' })];
    const html = renderToStaticMarkup(<TMTicketsList tickets={tickets} />);
    expect(html).toContain('tm-tickets-filters');
    for (const state of TM_TICKET_STATES) {
      expect(html).toContain(`tm-filter-state-${state}`);
    }
    // billable tri-toggle present
    expect(html).toContain('tm-filter-billable-all');
    expect(html).toContain('tm-filter-billable-billed');
    expect(html).toContain('tm-filter-billable-unbilled');
    // from/to date inputs present
    expect(html).toContain('tm-filter-from');
    expect(html).toContain('tm-filter-to');
  });

  it('renders one detail card per ticket in the initial (unfiltered) view', () => {
    const tickets: TMTicket[] = [
      ticket({ ticket_id: 'aaa', ticket_number: 'TM-001', description: 'Alpha' }),
      ticket({ ticket_id: 'bbb', ticket_number: 'TM-002', description: 'Beta' }),
      ticket({ ticket_id: 'ccc', ticket_number: 'TM-003', description: 'Gamma' }),
    ];
    const html = renderToStaticMarkup(<TMTicketsList tickets={tickets} />);
    expect(html).toContain('tm-ticket-card-aaa');
    expect(html).toContain('tm-ticket-card-bbb');
    expect(html).toContain('tm-ticket-card-ccc');
    expect(html).toContain('#TM-001');
    expect(html).toContain('Alpha');
    expect(html).toContain('#TM-002');
    expect(html).toContain('Beta');
    expect(html).toContain('3 of 3');
  });

  it('renders the filtered count display reflecting the initial set size', () => {
    const tickets: TMTicket[] = [
      ticket({ ticket_id: 'a' }),
      ticket({ ticket_id: 'b' }),
    ];
    const html = renderToStaticMarkup(<TMTicketsList tickets={tickets} />);
    expect(html).toContain('2 of 2');
  });
});
