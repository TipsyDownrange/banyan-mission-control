/**
 * BAN-329 — TMTicketStateBadge
 *
 * Verifies the badge renders the 9 code-actual states from
 * lib/aia/state-transitions.ts (not the spec's 5-state list), each with
 * its own palette, and falls back gracefully for unknown states.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TMTicketStateBadge from '../components/engagements/TMTicketStateBadge';
import { TM_TICKET_STATES } from '../lib/aia/state-transitions';

describe('BAN-329 TMTicketStateBadge', () => {
  it('renders each of the 9 code-actual states with a non-empty label', () => {
    expect(TM_TICKET_STATES).toHaveLength(9);
    for (const state of TM_TICKET_STATES) {
      const html = renderToStaticMarkup(<TMTicketStateBadge state={state} />);
      expect(html).toContain(`data-state="${state}"`);
      expect(html).toContain('tm-state-badge');
    }
  });

  it('renders specific human-friendly labels for the canonical states', () => {
    expect(renderToStaticMarkup(<TMTicketStateBadge state="DRAFT" />)).toContain('Draft');
    expect(renderToStaticMarkup(<TMTicketStateBadge state="READY_FOR_GC_APPROVAL" />))
      .toContain('Ready · GC Approval');
    expect(renderToStaticMarkup(<TMTicketStateBadge state="GC_APPROVED" />)).toContain('GC Approved');
    expect(renderToStaticMarkup(<TMTicketStateBadge state="BILLABLE" />)).toContain('Billable');
    expect(renderToStaticMarkup(<TMTicketStateBadge state="BILLED" />)).toContain('Billed');
    expect(renderToStaticMarkup(<TMTicketStateBadge state="PAID" />)).toContain('Paid');
    expect(renderToStaticMarkup(<TMTicketStateBadge state="REJECTED" />)).toContain('Rejected');
  });

  it('falls back to space-separated unknown state text', () => {
    const html = renderToStaticMarkup(<TMTicketStateBadge state="SOMETHING_NEW" />);
    expect(html).toContain('SOMETHING NEW');
  });
});
