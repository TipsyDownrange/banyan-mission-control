/**
 * BAN-329 — TMTicketDetailCard
 *
 * Static-markup smoke for the always-visible header (collapsed state).
 * The body is conditionally rendered behind the expand toggle and is
 * exercised via the list/orchestrator tests where the controlled
 * component flow is in scope.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TMTicketDetailCard from '../components/engagements/TMTicketDetailCard';
import type { TMTicket } from '../components/engagements/TMTicketsList';

const baseTicket: TMTicket = {
  ticket_id: 'ticket-1',
  tm_auth_id: 'auth-1',
  engagement_id: 'eng-1',
  ticket_number: 'TM-26-0042',
  work_date: '2026-04-10',
  description: 'Patch grout on lanai stones',
  labor: [{ role: 'Mason', hours: 4, rate: 95, total: 380 }],
  labor_total: '380',
  materials: [{ description: 'Grout', quantity: 2, unit: 'bag', unit_cost: 38, total: 76 }],
  materials_total: '76',
  equipment: [],
  equipment_total: '0',
  ticket_total: '456',
  status: 'GC_APPROVED',
};

describe('BAN-329 TMTicketDetailCard', () => {
  it('renders the collapsed header with ticket number, scope, total, and state badge', () => {
    const html = renderToStaticMarkup(<TMTicketDetailCard ticket={baseTicket} />);
    expect(html).toContain('#TM-26-0042');
    expect(html).toContain('Patch grout on lanai stones');
    expect(html).toContain('$456');
    expect(html).toContain('Apr 10, 2026');
    expect(html).toContain('GC Approved');
    expect(html).toContain('aria-expanded="false"');
  });

  it('uses a fallback header label when description is missing', () => {
    const t: TMTicket = { ...baseTicket, description: null };
    const html = renderToStaticMarkup(<TMTicketDetailCard ticket={t} />);
    expect(html).toContain('T&amp;M ticket');
  });

  it('does not render the body in the SSR (collapsed) snapshot', () => {
    const html = renderToStaticMarkup(<TMTicketDetailCard ticket={baseTicket} />);
    expect(html).not.toContain('AUTHORIZATION');
    expect(html).not.toContain('LABOR');
    expect(html).not.toContain('SIGNOFF');
    expect(html).not.toContain('BILLED IN');
  });
});
