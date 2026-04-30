import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  getOrganizationGovernanceSheets,
  listOrganizationRelationships,
  saveOrganizationRelationship,
} from '@/lib/organizationGovernance';

function canUseOrganizations(session: { user?: { email?: string | null } } | null) {
  return !!session?.user?.email?.endsWith('@kulaglass.com');
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!canUseOrganizations(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  const session = await getServerSession();
  if (!canUseOrganizations(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const relationship = await saveOrganizationRelationship(getOrganizationGovernanceSheets(), {
      source_org_id: String(body.source_org_id || ''),
      target_org_id: String(body.target_org_id || ''),
      relationship_type: body.relationship_type,
      notes: body.notes,
      actor: session?.user?.email || 'system',
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
