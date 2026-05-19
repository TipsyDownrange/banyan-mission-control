import { NextResponse } from 'next/server';
import {
  buildOrganizationMergePreview,
  executeOrganizationMerge,
  getOrganizationGovernanceSheets,
} from '@/lib/organizationGovernance';
import { emitMCEvent } from '@/lib/events';
import { passOrganizationsAuthGate, passOrganizationsWriteGate } from '@/lib/organizations/api-gate';

export async function GET(req: Request) {
  const gate = await passOrganizationsAuthGate(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const sourceOrgId = searchParams.get('source_org_id') || '';
  const survivorOrgId = searchParams.get('survivor_org_id') || '';

  try {
    const sheets = getOrganizationGovernanceSheets();
    const preview = await buildOrganizationMergePreview(sheets, sourceOrgId, survivorOrgId);
    return NextResponse.json({ preview });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await passOrganizationsWriteGate(req);
  if (!gate.ok) return gate.response;
  const actorEmail = gate.actorEmail;

  try {
    const body = await req.json();
    if (body.preview_confirmed !== true) {
      return NextResponse.json({ error: 'Merge preview confirmation required before execution.' }, { status: 400 });
    }
    const sourceOrgId = String(body.source_org_id || '');
    const survivorOrgId = String(body.survivor_org_id || '');
    const result = await executeOrganizationMerge(
      getOrganizationGovernanceSheets(),
      sourceOrgId,
      survivorOrgId,
      actorEmail || 'system',
      String(body.notes || ''),
    );
    await emitMCEvent({
      entity_kid: survivorOrgId,
      entity_type: 'organization',
      event_type: 'ORG_MERGED',
      submitted_by: actorEmail || undefined,
      origin: 'office',
      notes: `merged ${sourceOrgId} → ${survivorOrgId}`,
      rationale: String(body.notes || ''),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof Error && err.name === 'MergeBlockedError' ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
