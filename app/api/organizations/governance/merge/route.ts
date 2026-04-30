import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  buildOrganizationMergePreview,
  executeOrganizationMerge,
  getOrganizationGovernanceSheets,
} from '@/lib/organizationGovernance';

function canUseOrganizations(session: { user?: { email?: string | null } } | null) {
  return !!session?.user?.email?.endsWith('@kulaglass.com');
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!canUseOrganizations(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  const session = await getServerSession();
  if (!canUseOrganizations(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    if (body.preview_confirmed !== true) {
      return NextResponse.json({ error: 'Merge preview confirmation required before execution.' }, { status: 400 });
    }
    const result = await executeOrganizationMerge(
      getOrganizationGovernanceSheets(),
      String(body.source_org_id || ''),
      String(body.survivor_org_id || ''),
      session?.user?.email || 'system',
      String(body.notes || ''),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof Error && err.name === 'MergeBlockedError' ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
