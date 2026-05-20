/**
 * BAN-376 Customer Pipeline — /api/inquiries/[id]
 *
 *   GET    retrieve a single inquiry by inquiry_id
 *   PATCH  update editable fields (NOT state — use /transition for that)
 *
 * Tenant-scoped via passInquiryReadGate / passInquiryWriteGate.  State
 * changes are intentionally excluded from PATCH and routed through
 * /transition so every change writes an inquiry_state_transitions row.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  inquiries,
  INQUIRY_SOURCES,
  INQUIRY_FIRST_CONTACT_METHODS,
  INQUIRY_TYPE_INITIALS,
  INQUIRY_VALUE_BANDS,
  INQUIRY_ASSIGNED_ROLES,
  INQUIRY_CONVERSION_EVENTS,
} from '@/db';
import { passInquiryReadGate, passInquiryWriteGate } from '@/lib/inquiries/api-gate';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

const ENUM_FIELDS: Record<string, ReadonlyArray<string>> = {
  source: INQUIRY_SOURCES,
  first_contact_method: INQUIRY_FIRST_CONTACT_METHODS,
  inquiry_type_initial: INQUIRY_TYPE_INITIALS,
  estimated_value_band: INQUIRY_VALUE_BANDS,
  assigned_role: INQUIRY_ASSIGNED_ROLES,
  conversion_event: INQUIRY_CONVERSION_EVENTS,
};

const PATCHABLE_TEXT_FIELDS = [
  'source_detail',
  'source_evidence',
  'customer_name',
  'contact_name',
  'contact_email',
  'contact_phone',
  'inquiry_description',
  'inquiry_location',
  'inquiry_scope_initial',
  'notes',
  'conversion_evidence',
] as const;

const PATCHABLE_ID_FIELDS = [
  'customer_org_id',
  'first_contact_user_id',
] as const;

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passInquiryReadGate();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(inquiries)
    .where(and(eq(inquiries.tenant_id, gate.tenantId), eq(inquiries.inquiry_id, id)))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'inquiry not found' }, { status: 404 });
  }
  return NextResponse.json({ inquiry: rows[0] });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passInquiryWriteGate();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if ('state' in body) {
    return NextResponse.json(
      { error: 'state transitions must use POST /api/inquiries/[id]/transition' },
      { status: 400 },
    );
  }
  if ('inquiry_number' in body || 'tenant_id' in body || 'inquiry_id' in body) {
    return NextResponse.json({ error: 'immutable field in patch body' }, { status: 400 });
  }
  if ('converted_to_project_id' in body || 'converted_to_work_order_id' in body) {
    return NextResponse.json(
      { error: 'conversion fields must use POST /api/inquiries/[id]/convert-to-project or /convert-to-work-order' },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date() };

  for (const field of PATCHABLE_TEXT_FIELDS) {
    if (field in body) {
      const v = body[field];
      if (v === null) updates[field] = null;
      else if (typeof v === 'string') updates[field] = v;
      else return NextResponse.json({ error: `${field} must be a string` }, { status: 400 });
    }
  }
  for (const field of PATCHABLE_ID_FIELDS) {
    if (field in body) {
      const v = body[field];
      if (v === null || v === '') updates[field] = null;
      else if (typeof v === 'string') updates[field] = v;
      else return NextResponse.json({ error: `${field} must be a string id or null` }, { status: 400 });
    }
  }
  for (const [field, values] of Object.entries(ENUM_FIELDS)) {
    if (field in body) {
      const v = body[field];
      if (v === null || v === '') {
        updates[field] = null;
        continue;
      }
      if (typeof v !== 'string' || !values.includes(v)) {
        return NextResponse.json(
          { error: `invalid ${field}; expected one of ${values.join(', ')}` },
          { status: 400 },
        );
      }
      updates[field] = v;
    }
  }
  if ('is_test_project' in body) {
    if (typeof body.is_test_project !== 'boolean') {
      return NextResponse.json({ error: 'is_test_project must be boolean' }, { status: 400 });
    }
    updates.is_test_project = body.is_test_project;
  }
  if ('conversion_at' in body) {
    const v = body.conversion_at;
    if (v === null || v === '') updates.conversion_at = null;
    else if (typeof v === 'string') updates.conversion_at = new Date(v);
    else return NextResponse.json({ error: 'conversion_at must be ISO string or null' }, { status: 400 });
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'no patchable fields in body' }, { status: 400 });
  }

  const updated = await db
    .update(inquiries)
    .set(updates)
    .where(and(eq(inquiries.tenant_id, gate.tenantId), eq(inquiries.inquiry_id, id)))
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'inquiry not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, inquiry: updated[0] });
}
