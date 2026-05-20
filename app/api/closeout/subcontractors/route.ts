/**
 * BAN-375 Closeout v1.1.1 Phase 1 — GET / POST /api/closeout/subcontractors
 *
 * Tenant-scoped subs catalog (Sean delta 2). Trade is locked at app + db
 * CHECK to ('framer','waterproofer') per Sean directive (Scheduling Spine
 * alignment); the broader punch_trade enum applies to punch_list_items, not
 * to the subs catalog itself.
 *
 * Permissions:
 *   - GET (list): project:view (any role that can read project surfaces)
 *   - POST (create): business:admin (super_admin via admin:all + business_admin)
 *
 * Filters (GET):
 *   ?trade=framer|waterproofer
 *   ?island=maui|oahu|big_island|kauai|lanai|molokai
 *   ?active=true|false  (default: only active)
 */

import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, subcontractors } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/closeout/subcontractors';

const ALLOWED_TRADES = ['framer', 'waterproofer'] as const;
const ALLOWED_ISLANDS = ['maui', 'oahu', 'big_island', 'kauai', 'lanai', 'molokai'] as const;

interface CreateBody {
  company_name?: string;
  primary_contact_name?: string;
  primary_contact_email?: string;
  primary_contact_phone?: string;
  trade?: string;
  island?: string;
  active?: boolean;
  notes?: string;
}

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const tradeFilter = url.searchParams.get('trade');
  const islandFilter = url.searchParams.get('island');
  const activeParam = url.searchParams.get('active');

  const filters = [eq(subcontractors.tenant_id, gate.tenantId)];
  if (tradeFilter) {
    if (!(ALLOWED_TRADES as readonly string[]).includes(tradeFilter)) {
      return NextResponse.json(
        { error: `trade must be one of ${ALLOWED_TRADES.join(', ')}` },
        { status: 400 },
      );
    }
    filters.push(eq(subcontractors.trade, tradeFilter));
  }
  if (islandFilter) {
    if (!(ALLOWED_ISLANDS as readonly string[]).includes(islandFilter)) {
      return NextResponse.json(
        { error: `island must be one of ${ALLOWED_ISLANDS.join(', ')}` },
        { status: 400 },
      );
    }
    filters.push(eq(subcontractors.island, islandFilter));
  }
  if (activeParam === null || activeParam === 'true') {
    filters.push(eq(subcontractors.active, true));
  } else if (activeParam === 'false') {
    filters.push(eq(subcontractors.active, false));
  }

  const rows = await db
    .select()
    .from(subcontractors)
    .where(and(...filters))
    .orderBy(asc(subcontractors.company_name));

  return NextResponse.json({ subcontractors: rows });
}

export async function POST(req: Request) {
  // Hard gate: business:admin (super_admin via admin:all also passes).
  const gate = await passAiaApiGate(req, ROUTE_PATH, 'business:admin');
  if (!gate.ok) return gate.response;

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const companyName = (body.company_name ?? '').trim();
  const trade = (body.trade ?? '').trim();
  if (!companyName) {
    return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
  }
  if (!trade) {
    return NextResponse.json({ error: 'trade is required' }, { status: 400 });
  }
  if (!(ALLOWED_TRADES as readonly string[]).includes(trade)) {
    return NextResponse.json(
      { error: `trade must be one of ${ALLOWED_TRADES.join(', ')}`, code: 'INVALID_TRADE' },
      { status: 400 },
    );
  }
  const island = (body.island ?? '').trim();
  if (island && !(ALLOWED_ISLANDS as readonly string[]).includes(island)) {
    return NextResponse.json(
      { error: `island must be one of ${ALLOWED_ISLANDS.join(', ')}`, code: 'INVALID_ISLAND' },
      { status: 400 },
    );
  }

  const inserted = await db
    .insert(subcontractors)
    .values({
      tenant_id: gate.tenantId,
      company_name: companyName,
      primary_contact_name: body.primary_contact_name ?? null,
      primary_contact_email: body.primary_contact_email ?? null,
      primary_contact_phone: body.primary_contact_phone ?? null,
      trade,
      island: island || null,
      active: body.active ?? true,
      notes: body.notes ?? null,
    })
    .returning();

  return NextResponse.json({ ok: true, subcontractor: inserted[0] }, { status: 201 });
}
