import { NextResponse } from 'next/server';
import {
  getOrganizationGovernanceSheets,
  listOrganizationRelationships,
  saveOrganizationRelationship,
} from '@/lib/organizationGovernance';
import { passOrganizationsAuthGate, passOrganizationsWriteGate } from '@/lib/organizations/api-gate';

export async function GET(req: Request) {
  const gate = await passOrganizationsAuthGate(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('org_id') || '';
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 });

  try {
    const relationships = await listOrganizationRelationships(getOrganizationGovernanceSheets(), orgId);
    return NextResponse.json({ relationships });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await passOrganizationsWriteGate(req);
  if (!gate.ok) return gate.response;

  try {
    const body = await req.json();
    const relationship = await saveOrganizationRelationship(getOrganizationGovernanceSheets(), {
      source_org_id: String(body.source_org_id || ''),
      target_org_id: String(body.target_org_id || ''),
      relationship_type: body.relationship_type,
      notes: body.notes,
      actor: gate.actorEmail || 'system',
      relationship_id: body.relationship_id,
    });
    return NextResponse.json({ ok: true, relationship });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  return POST(req);
}
