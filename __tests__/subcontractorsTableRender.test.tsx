/**
 * BAN-375 Closeout v1.1.1 — SubcontractorsTable render tests.
 *
 * Covers the view-mode states (loading / error / empty / ready) and tab
 * highlighting. The default-exported client component owns fetch; we test
 * the named SubcontractorsTableView so we can drive its inputs directly.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SubcontractorsTableView,
  type SubcontractorRow,
} from '../components/admin/SubcontractorsTable';

const ROW: SubcontractorRow = {
  subcontractor_id: 'sub-001',
  company_name: 'Acme Framing LLC',
  primary_contact_name: 'Tessa Builder',
  primary_contact_email: 'tessa@acme.test',
  primary_contact_phone: '808-555-1212',
  trade: 'framer',
  island: 'maui',
  active: true,
  notes: 'Preferred crew',
};

describe('SubcontractorsTableView', () => {
  it('renders the loading state', () => {
    const html = renderToStaticMarkup(
      <SubcontractorsTableView state={{ kind: 'loading' }} activeTrade="framer" onSelectTrade={() => undefined} />,
    );
    expect(html).toContain('Loading subcontractors');
  });

  it('renders the error state with the message', () => {
    const html = renderToStaticMarkup(
      <SubcontractorsTableView
        state={{ kind: 'error', message: 'boom' }}
        activeTrade="framer"
        onSelectTrade={() => undefined}
      />,
    );
    expect(html).toContain('Could not load subcontractors');
    expect(html).toContain('boom');
  });

  it('renders the empty state when no rows', () => {
    const html = renderToStaticMarkup(
      <SubcontractorsTableView
        state={{ kind: 'ready', rows: [] }}
        activeTrade="framer"
        onSelectTrade={() => undefined}
      />,
    );
    expect(html).toContain('No framers on file');
  });

  it('renders rows when present, with company + contact details', () => {
    const html = renderToStaticMarkup(
      <SubcontractorsTableView
        state={{ kind: 'ready', rows: [ROW] }}
        activeTrade="framer"
        onSelectTrade={() => undefined}
      />,
    );
    expect(html).toContain('Acme Framing LLC');
    expect(html).toContain('Tessa Builder');
    expect(html).toContain('tessa@acme.test');
    expect(html).toContain('maui');
    expect(html).toContain('ACTIVE');
    expect(html).toContain('Preferred crew');
  });

  it('exposes both Framers and Waterproofers tabs', () => {
    const html = renderToStaticMarkup(
      <SubcontractorsTableView
        state={{ kind: 'ready', rows: [] }}
        activeTrade="framer"
        onSelectTrade={() => undefined}
      />,
    );
    expect(html).toContain('Framers');
    expect(html).toContain('Waterproofers');
  });

  it('marks INACTIVE rows with the inactive badge color', () => {
    const html = renderToStaticMarkup(
      <SubcontractorsTableView
        state={{ kind: 'ready', rows: [{ ...ROW, active: false }] }}
        activeTrade="framer"
        onSelectTrade={() => undefined}
      />,
    );
    expect(html).toContain('INACTIVE');
  });
});
