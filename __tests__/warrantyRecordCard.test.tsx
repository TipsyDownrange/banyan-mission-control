/**
 * BAN-375 Closeout v1.1 Phase 2 — WarrantyRecordCard render tests.
 *
 * Pure presentational component; verifies coverage start, status pill
 * variants, claim count fallback, and scope summary extraction from
 * jsonb shapes that mirror Closeout v1.1 §8.1 scope_warranties.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WarrantyRecordCard, { type WarrantyRow } from '../components/closeout/WarrantyRecordCard';

const BASE: WarrantyRow = {
  warranty_id: '11111111-1111-4111-8111-111111111111',
  tenant_id: '00000000-0000-4000-8000-000000000001',
  engagement_id: '22222222-2222-4222-8222-222222222222',
  start_date: '2026-05-01',
  scope_warranties: [
    { scope: 'Curtain wall', years: 1, description: 'Installation workmanship' },
    { scope: 'Storefront', years: 1 },
  ],
  status: 'ACTIVE',
};

describe('BAN-375 WarrantyRecordCard', () => {
  it('renders the warranty_id, coverage start, and Active status pill', () => {
    const html = renderToStaticMarkup(<WarrantyRecordCard warranty={BASE} />);
    expect(html).toContain('11111111-1111-4111-8111-111111111111');
    expect(html).toContain('2026-05-01');
    expect(html).toContain('Active');
    expect(html).toContain('Coverage start');
  });

  it('renders the Partially expired pill when status === PARTIALLY_EXPIRED', () => {
    const html = renderToStaticMarkup(
      <WarrantyRecordCard warranty={{ ...BASE, status: 'PARTIALLY_EXPIRED' }} />,
    );
    expect(html).toContain('Partially expired');
  });

  it('renders the Expired pill when status === EXPIRED', () => {
    const html = renderToStaticMarkup(
      <WarrantyRecordCard warranty={{ ...BASE, status: 'EXPIRED' }} />,
    );
    expect(html).toContain('Expired');
  });

  it('falls back to raw status when the enum value is unrecognized', () => {
    const html = renderToStaticMarkup(
      <WarrantyRecordCard warranty={{ ...BASE, status: 'WEIRD_NEW_VALUE' }} />,
    );
    expect(html).toContain('WEIRD_NEW_VALUE');
  });

  it('renders "—" for claim count when not provided', () => {
    const html = renderToStaticMarkup(<WarrantyRecordCard warranty={BASE} />);
    expect(html).toContain('data-testid="warranty-claim-count"');
    expect(html).toMatch(/data-testid="warranty-claim-count"[^>]*>—/);
  });

  it('renders the numeric claim count when provided (including 0)', () => {
    const zero = renderToStaticMarkup(
      <WarrantyRecordCard warranty={BASE} claimCount={0} />,
    );
    expect(zero).toMatch(/data-testid="warranty-claim-count"[^>]*>0/);

    const many = renderToStaticMarkup(
      <WarrantyRecordCard warranty={BASE} claimCount={3} />,
    );
    expect(many).toMatch(/data-testid="warranty-claim-count"[^>]*>3/);
  });

  it('summarises scope_warranties by joining the scope/name labels', () => {
    const html = renderToStaticMarkup(<WarrantyRecordCard warranty={BASE} />);
    expect(html).toContain('Curtain wall');
    expect(html).toContain('Storefront');
  });

  it('falls back to "— " when scope_warranties is empty', () => {
    const html = renderToStaticMarkup(
      <WarrantyRecordCard warranty={{ ...BASE, scope_warranties: [] }} />,
    );
    expect(html).toMatch(/Scope<\/div><div[^>]*>—/);
  });

  it('reports scope count when entries lack a name field', () => {
    const html = renderToStaticMarkup(
      <WarrantyRecordCard warranty={{ ...BASE, scope_warranties: [{ years: 1 }, { years: 1 }] }} />,
    );
    expect(html).toContain('2 scopes');
  });
});
