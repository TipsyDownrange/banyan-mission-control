/**
 * BAN-375 Closeout v1.1 Phase 2 — GET /api/closeout/warranties/{id}/warranty-letter
 *
 * Streams a generated Installer Warranty Certificate PDF for the
 * warranty record identified by the path id. Mirrors the Notice of
 * Completion pattern (app/api/closeout/notices-of-completion/route.ts):
 * write-permission gate, tenant-scoped lookup with engagement join,
 * 404 on miss. PDF body is produced from the existing template at
 * lib/pdf-warranty.tsx (`generateWarrantyPDF`) so the visual contract
 * matches the existing Drive deliverable.
 *
 * No Activity Spine emission: the canonical 34-value event enum
 * locked by BAN-293 has no WARRANTY_LETTER_GENERATED entry, and the
 * dispatch forbids introducing one. WARRANTY_STATE_CHANGED is
 * bounded to the warranty status lifecycle per §8.7 (PR 1) and is
 * not co-fired by a letter read.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, warranties, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { generateWarrantyPDF, type WarrantyData } from '@/lib/pdf-warranty';

const ROUTE_PATH = '/api/closeout/warranties/[id]/warranty-letter';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addYearsIso(start: string, years: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

interface ScopeWarrantyEntry {
  scope?: unknown;
  name?: unknown;
  system_type?: unknown;
  description?: unknown;
  years?: unknown;
}

function extractSystemTypes(scope: unknown): string[] {
  if (!Array.isArray(scope)) return [];
  const out: string[] = [];
  for (const entry of scope) {
    if (entry && typeof entry === 'object') {
      const e = entry as ScopeWarrantyEntry;
      const v = (typeof e.scope === 'string' && e.scope)
        || (typeof e.name === 'string' && e.name)
        || (typeof e.system_type === 'string' && e.system_type);
      if (typeof v === 'string' && v.trim()) out.push(v.trim());
    }
  }
  return out;
}

function extractScopeDescription(scope: unknown): string {
  if (!Array.isArray(scope)) return '';
  const parts: string[] = [];
  for (const entry of scope) {
    if (entry && typeof entry === 'object') {
      const e = entry as ScopeWarrantyEntry;
      if (typeof e.description === 'string' && e.description.trim()) {
        parts.push(e.description.trim());
      }
    }
  }
  return parts.join(' ');
}

function extractWorkmanshipYears(scope: unknown): number {
  if (!Array.isArray(scope)) return 1;
  for (const entry of scope) {
    if (entry && typeof entry === 'object') {
      const e = entry as ScopeWarrantyEntry;
      if (typeof e.years === 'number' && Number.isFinite(e.years) && e.years > 0) {
        return Math.floor(e.years);
      }
    }
  }
  return 1;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  const lookup = await db
    .select({
      warranty_id: warranties.warranty_id,
      engagement_id: warranties.engagement_id,
      start_date: warranties.start_date,
      scope_warranties: warranties.scope_warranties,
      status: warranties.status,
      kid: engagements.kid,
      drive_folder_id: engagements.drive_folder_id,
      metadata: engagements.metadata,
    })
    .from(warranties)
    .innerJoin(
      engagements,
      eq(warranties.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(warranties.warranty_id, id),
        eq(warranties.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (lookup.length === 0) {
    return NextResponse.json(
      { error: `warranty ${id} not found` },
      { status: 404 },
    );
  }

  const row = lookup[0];
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const projectName = typeof metadata.project_name === 'string' ? metadata.project_name : row.kid;
  const ownerName = typeof metadata.owner_name === 'string' ? metadata.owner_name : '—';
  const ownerAddress = typeof metadata.owner_address === 'string' ? metadata.owner_address : '—';
  const substantialCompletionDate = typeof metadata.substantial_completion_date === 'string'
    ? metadata.substantial_completion_date
    : row.start_date;
  const signedByName = typeof metadata.warranty_signed_by_name === 'string'
    ? metadata.warranty_signed_by_name
    : 'Sean Daniels';
  const signedByTitle = typeof metadata.warranty_signed_by_title === 'string'
    ? metadata.warranty_signed_by_title
    : 'President, Kula Glass Company, Inc.';

  const workmanshipYears = extractWorkmanshipYears(row.scope_warranties);
  const systemTypes = extractSystemTypes(row.scope_warranties);
  const scopeDescription = extractScopeDescription(row.scope_warranties)
    || 'Installation workmanship as detailed in the substantial completion certificate.';
  const warrantyEndDate = addYearsIso(row.start_date, workmanshipYears);

  const data: WarrantyData = {
    warranty_number: `WAR-${String(row.warranty_id).slice(0, 8).toUpperCase()}`,
    issue_date: todayIso(),
    project_name: projectName,
    kID: row.kid,
    owner_name: ownerName,
    owner_address: ownerAddress,
    system_types: systemTypes,
    scope_description: scopeDescription,
    workmanship_years: workmanshipYears,
    substantial_completion_date: substantialCompletionDate,
    warranty_start_date: row.start_date,
    warranty_end_date: warrantyEndDate,
    signed_by: { name: signedByName, title: signedByTitle },
  };

  const pdfBuffer = await generateWarrantyPDF(data);
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${data.warranty_number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
