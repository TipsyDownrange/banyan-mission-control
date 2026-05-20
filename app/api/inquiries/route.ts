/**
 * BAN-376 Customer Pipeline — /api/inquiries
 *
 *   POST   create a new inquiry (Quick Capture)
 *   GET    list inquiries with filters (state, source, assignee, date range)
 *          Default filter excludes terminal states (LOST + CONVERTED) and
 *          is_test_project=true per spec §17.
 *
 * Activity Spine emission is explicitly DEFERRED for P0+1 per dispatch.
 * Audit captured to inquiry_state_transitions instead.
 */

import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import {
  db,
  inquiries,
  inquiry_state_transitions,
  INQUIRY_SOURCES,
  INQUIRY_FIRST_CONTACT_METHODS,
  INQUIRY_TYPE_INITIALS,
  INQUIRY_VALUE_BANDS,
  INQUIRY_ASSIGNED_ROLES,
  INQUIRY_STATES,
  type InquirySource,
  type InquiryFirstContactMethod,
  type InquiryTypeInitial,
  type InquiryValueBand,
  type InquiryAssignedRole,
  type InquiryState,
} from '@/db';
import { passInquiryReadGate, passInquiryWriteGate } from '@/lib/inquiries/api-gate';
import { nextInquiryNumber, suggestAssignedRole } from '@/lib/inquiries/helpers';

const DEFAULT_OPEN_STATES: InquiryState[] = ['NEW', 'IN_DISCUSSION', 'QUOTED'];

function isInList<T extends string>(value: unknown, list: ReadonlyArray<T>): value is T {
  return typeof value === 'string' && (list as ReadonlyArray<string>).includes(value);
}

export async function POST(req: Request) {
  const gate = await passInquiryWriteGate();
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  if (!customerName) {
    return NextResponse.json({ error: 'customer_name is required' }, { status: 400 });
  }

  if (!isInList(body.source, INQUIRY_SOURCES)) {
    return NextResponse.json(
      { error: `invalid source; expected one of ${INQUIRY_SOURCES.join(', ')}` },
      { status: 400 },
    );
  }
  const source: InquirySource = body.source;

  const contactEmail = typeof body.contact_email === 'string' ? body.contact_email.trim() : '';
  const contactPhone = typeof body.contact_phone === 'string' ? body.contact_phone.trim() : '';
  if (!contactEmail && !contactPhone) {
    return NextResponse.json(
      { error: 'at least one of contact_email or contact_phone is required' },
      { status: 400 },
    );
  }

  const typeInitial: InquiryTypeInitial =
    isInList(body.inquiry_type_initial, INQUIRY_TYPE_INITIALS)
      ? body.inquiry_type_initial
      : 'UNCLEAR';

  const valueBand: InquiryValueBand =
    isInList(body.estimated_value_band, INQUIRY_VALUE_BANDS)
      ? body.estimated_value_band
      : 'UNKNOWN';

  let firstContactMethod: InquiryFirstContactMethod | null = null;
  if ('first_contact_method' in body && body.first_contact_method !== null) {
    if (!isInList(body.first_contact_method, INQUIRY_FIRST_CONTACT_METHODS)) {
      return NextResponse.json(
        { error: `invalid first_contact_method; expected one of ${INQUIRY_FIRST_CONTACT_METHODS.join(', ')}` },
        { status: 400 },
      );
    }
    firstContactMethod = body.first_contact_method;
  }

  let assignedRole: InquiryAssignedRole | null = null;
  if ('assigned_role' in body && body.assigned_role !== null && body.assigned_role !== '') {
    if (!isInList(body.assigned_role, INQUIRY_ASSIGNED_ROLES)) {
      return NextResponse.json(
        { error: `invalid assigned_role; expected one of ${INQUIRY_ASSIGNED_ROLES.join(', ')}` },
        { status: 400 },
      );
    }
    assignedRole = body.assigned_role;
  } else {
    // Suggest a role if one isn't provided.  Manual override always wins; the
    // suggestion only fills a blank.
    assignedRole = suggestAssignedRole(source, valueBand);
  }

  const inquiryNumber = await nextInquiryNumber(gate.tenantId);

  const assignedToUserId = typeof body.assigned_to_user_id === 'string' && body.assigned_to_user_id
    ? body.assigned_to_user_id
    : null;
  const firstContactUserId = typeof body.first_contact_user_id === 'string' && body.first_contact_user_id
    ? body.first_contact_user_id
    : null;
  const customerOrgId = typeof body.customer_org_id === 'string' && body.customer_org_id
    ? body.customer_org_id
    : null;
  const isTest = body.is_test_project === true;

  const inserted = await db
    .insert(inquiries)
    .values({
      tenant_id: gate.tenantId,
      inquiry_number: inquiryNumber,
      source,
      source_detail: typeof body.source_detail === 'string' ? body.source_detail : null,
      source_evidence: typeof body.source_evidence === 'string' ? body.source_evidence : null,
      first_contact_user_id: firstContactUserId,
      first_contact_at: firstContactMethod ? new Date() : null,
      first_contact_method: firstContactMethod,
      customer_name: customerName,
      customer_org_id: customerOrgId,
      contact_name: typeof body.contact_name === 'string' ? body.contact_name : null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      inquiry_type_initial: typeInitial,
      inquiry_description: typeof body.inquiry_description === 'string' ? body.inquiry_description : null,
      inquiry_location: typeof body.inquiry_location === 'string' ? body.inquiry_location : null,
      inquiry_scope_initial: typeof body.inquiry_scope_initial === 'string' ? body.inquiry_scope_initial : null,
      estimated_value_band: valueBand,
      assigned_to_user_id: assignedToUserId,
      assigned_at: assignedToUserId ? new Date() : null,
      assigned_role: assignedRole,
      state: 'NEW',
      state_changed_at: new Date(),
      notes: typeof body.notes === 'string' ? body.notes : null,
      is_test_project: isTest,
    })
    .returning();

  const row = inserted[0];

  // Audit the initial state — null → NEW — so the transition log always has a
  // head entry for every inquiry.  Stands in for Activity Spine emission per
  // dispatch (deferred to P0+1.5 behind G2 ADR amendment).
  await db.insert(inquiry_state_transitions).values({
    tenant_id: gate.tenantId,
    inquiry_id: row.inquiry_id,
    from_state: null,
    to_state: 'NEW',
    changed_by: null,
    reason: 'initial capture',
  });

  return NextResponse.json({ ok: true, inquiry: row }, { status: 201 });
}

export async function GET(req: Request) {
  const gate = await passInquiryReadGate();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);

  const stateParam = url.searchParams.getAll('state');
  const filterStates: InquiryState[] = stateParam.length > 0
    ? stateParam.filter((s): s is InquiryState => (INQUIRY_STATES as ReadonlyArray<string>).includes(s))
    : DEFAULT_OPEN_STATES;
  if (stateParam.length > 0 && filterStates.length === 0) {
    return NextResponse.json({ error: 'no valid state filter values supplied' }, { status: 400 });
  }

  const sourceParam = url.searchParams.get('source');
  const assigneeParam = url.searchParams.get('assigned_to_user_id');
  const fromParam = url.searchParams.get('created_from');
  const toParam = url.searchParams.get('created_to');
  const includeTest = url.searchParams.get('include_test_data') === 'true';

  if (sourceParam && !(INQUIRY_SOURCES as ReadonlyArray<string>).includes(sourceParam)) {
    return NextResponse.json({ error: `invalid source filter: ${sourceParam}` }, { status: 400 });
  }

  const conditions = [
    eq(inquiries.tenant_id, gate.tenantId),
    inArray(inquiries.state, filterStates),
  ];
  if (sourceParam) conditions.push(eq(inquiries.source, sourceParam));
  if (assigneeParam) conditions.push(eq(inquiries.assigned_to_user_id, assigneeParam));
  if (fromParam) conditions.push(gte(inquiries.created_at, new Date(fromParam)));
  if (toParam) conditions.push(lte(inquiries.created_at, new Date(toParam)));
  if (!includeTest) conditions.push(eq(inquiries.is_test_project, false));

  const rows = await db
    .select()
    .from(inquiries)
    .where(and(...conditions))
    .orderBy(desc(inquiries.created_at), asc(inquiries.inquiry_number));

  return NextResponse.json({ items: rows, total: rows.length });
}
