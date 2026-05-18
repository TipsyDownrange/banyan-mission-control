/**
 * BAN-329 — TMTicketsSummaryCard
 *
 * Verifies counts-by-state, total/billed/unbilled rollups, date range
 * formatting, and the empty (no tickets) state.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TMTicketsSummaryCard from '../components/engagements/TMTicketsSummaryCard';
import type { TMTicket } from '../components/engagements/TMTicketsList';

function ticket(overrides: Partial<TMTicket>): TMTicket {
  return {
    ticket_id: overrides.ticket_id ?? 't-id',
    tm_auth_id: overrides.tm_auth_id ?? 'a-1',
    engagement_id: overrides.engagement_id ?? 'e-1',
    ticket_number: overrides.ticket_number ?? '001',
    work_date: overrides.work_date ?? '2026-04-01',
    description: overrides.description ?? 'Stub',
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

describe('BAN-329 TMTicketsSummaryCard', () => {
  it('renders empty state with zero counts and no date range', () => {
    const html = renderToStaticMarkup(<TMTicketsSummaryCard tickets={[]} />);
    expect(html).toContain('T&amp;M Tickets');
    expect(html).toContain('(0)');
    expect(html).toContain('No tickets yet');
    expect(html).toContain('$0');
  });

  it('rolls up total / billed / unbilled across mixed states', () => {
    const tickets: TMTicket[] = [
      ticket({ ticket_id: '1', ticket_total: '1000', status: 'DRAFT' }),
      ticket({ ticket_id: '2', ticket_total: '2500', status: 'BILLED' }),
      ticket({ ticket_id: '3', ticket_total: '500', status: 'PAID' }),
      ticket({ ticket_id: '4', ticket_total: '750', status: 'BILLABLE' }),
    ];
    const html = renderToStaticMarkup(<TMTicketsSummaryCard tickets={tickets} />);
    // total = 4750, billed = 3000 (BILLED + PAID), unbilled = 1750
    expect(html).toContain('$4,750');
    expect(html).toContain('$3,000');
    expect(html).toContain('$1,750');
    expect(html).toContain('(4)');
  });

  it('shows count chips for each non-zero state', () => {
    const tickets: TMTicket[] = [
      ticket({ ticket_id: '1', status: 'DRAFT', ticket_total: '100' }),
      ticket({ ticket_id: '2', status: 'DRAFT', ticket_total: '100' }),
      ticket({ ticket_id: '3', status: 'GC_APPROVED', ticket_total: '200' }),
    ];
    const html = renderToStaticMarkup(<TMTicketsSummaryCard tickets={tickets} />);
    expect(html).toContain('tm-state-count-DRAFT');
    expect(html).toContain('DRAFT · 2');
    expect(html).toContain('tm-state-count-GC_APPROVED');
    expect(html).toContain('GC APPROVED · 1');
    // States with zero count should not render chips
    expect(html).not.toContain('tm-state-count-REJECTED');
  });

  it('renders the work_date range across earliest and latest tickets', () => {
    const tickets: TMTicket[] = [
      ticket({ ticket_id: '1', work_date: '2026-02-15', ticket_total: '100' }),
      ticket({ ticket_id: '2', work_date: '2026-04-30', ticket_total: '100' }),
      ticket({ ticket_id: '3', work_date: '2026-03-10', ticket_total: '100' }),
    ];
    const html = renderToStaticMarkup(<TMTicketsSummaryCard tickets={tickets} />);
    expect(html).toContain('Feb 15, 2026');
    expect(html).toContain('Apr 30, 2026');
    expect(html).toContain(' – ');
  });

  it('uses the server-supplied summary when provided (no recompute)', () => {
    const tickets: TMTicket[] = [
      ticket({ ticket_id: '1', ticket_total: '99999', status: 'DRAFT' }),
    ];
    const html = renderToStaticMarkup(
      <TMTicketsSummaryCard
        tickets={tickets}
        summary={{
          total_count: 7,
          by_state: {
            DRAFT: 0, LOGGED: 0, READY_FOR_GC_APPROVAL: 0, GC_APPROVED: 0,
            DISPUTED: 0, BILLABLE: 0, BILLED: 0, PAID: 0, REJECTED: 0,
          },
          total_value_usd: 12345,
          billed_value_usd: 5000,
          unbilled_value_usd: 7345,
        }}
      />,
    );
    // server summary wins — header count is 7, not derived 1
    expect(html).toContain('(7)');
    expect(html).toContain('$12,345');
    expect(html).toContain('$5,000');
    expect(html).toContain('$7,345');
  });
});
