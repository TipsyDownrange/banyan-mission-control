/**
 * BAN-376 Customer Pipeline P2 — migration 0041 shape assertion.
 *
 * Parses the SQL text and asserts the table/column/constraint/index shape
 * to lock the schema against accidental drift. No DB connection.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  'db/migrations/0041_ban376_customer_pipeline_p2_inquiry_attachments.sql',
);

let sql: string;

beforeAll(() => {
  sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
});

describe('migration 0041 — inquiry_attachments', () => {
  it('creates the inquiry_attachments table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.inquiry_attachments/);
  });

  it.each([
    ['attachment_id', 'uuid PRIMARY KEY DEFAULT gen_random_uuid()'],
    ['tenant_id', 'uuid NOT NULL REFERENCES public.tenants (tenant_id)'],
    ['inquiry_id', 'uuid NOT NULL REFERENCES public.inquiries (inquiry_id) ON DELETE CASCADE'],
    ['attachment_kind', 'text NOT NULL'],
    ['drive_file_id', 'text NOT NULL'],
    ['original_filename', 'text NOT NULL'],
    ['mime_type', 'text'],
    ['size_bytes', 'integer'],
    ['created_at', 'timestamptz NOT NULL DEFAULT now()'],
  ])('declares column %s as %s', (col, decl) => {
    const escaped = decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${col}\\s+${escaped}`, 'i');
    expect(sql).toMatch(re);
  });

  it('enforces attachment_kind CHECK enum', () => {
    expect(sql).toMatch(/inquiry_attachments_kind_check/);
    expect(sql).toMatch(/attachment_kind IN \('EMAIL_BODY', 'EMAIL_ATTACHMENT'\)/);
  });

  it('enforces non-negative size_bytes', () => {
    expect(sql).toMatch(/inquiry_attachments_size_bytes_nonneg_check/);
    expect(sql).toMatch(/size_bytes IS NULL OR size_bytes >= 0/);
  });

  it('cascades on inquiry deletion', () => {
    expect(sql).toMatch(/REFERENCES public\.inquiries \(inquiry_id\) ON DELETE CASCADE/);
  });

  it('indexes tenant_id+inquiry_id+created_at', () => {
    expect(sql).toMatch(/inquiry_attachments_tenant_inquiry_idx/);
    expect(sql).toMatch(/ON public\.inquiry_attachments \(tenant_id, inquiry_id, created_at\)/);
  });

  it('indexes tenant_id+attachment_kind for kind-scoped reads', () => {
    expect(sql).toMatch(/inquiry_attachments_tenant_kind_idx/);
    expect(sql).toMatch(/ON public\.inquiry_attachments \(tenant_id, attachment_kind\)/);
  });

  it('comments the table per ADR-027', () => {
    expect(sql).toMatch(/COMMENT ON TABLE public\.inquiry_attachments IS/);
  });

  it('does not modify any earlier migration tables', () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.inquiries\b/);
    expect(sql).not.toMatch(/ALTER TABLE public\.inquiry_state_transitions\b/);
    expect(sql).not.toMatch(/ALTER TABLE public\.field_events\b/);
    expect(sql).not.toMatch(/event_type/);
  });

  it('does not emit Activity Spine events', () => {
    expect(sql).not.toMatch(/INSERT INTO.*field_events/i);
  });
});
