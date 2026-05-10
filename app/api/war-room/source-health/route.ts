import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { buildWarRoomSourceHealthSnapshot } from '@/lib/war-room/sourceHealth';

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase() || '';

  if (!session || !email.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot = await buildWarRoomSourceHealthSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    const nowIso = new Date().toISOString();
    return NextResponse.json({
      generatedAt: nowIso,
      environment: 'unknown',
      sources: [{
        source: 'war_room_runtime',
        label: 'Source Health Snapshot Builder',
        status: 'unknown',
        authority: 'non_authoritative',
        freshness: 'unknown',
        freshnessLabel: 'Snapshot builder failed before source cards could be assembled.',
        lastCheckedAt: nowIso,
        summary: error instanceof Error ? error.message : String(error),
        details: ['Fail-safe response only; no writes or remediation actions were attempted.'],
        isFallback: false,
        checkedChannels: [],
        unverifiedChannels: ['source_health_snapshot_builder'],
      }],
      conflicts: [],
    }, { status: 200 });
  }
}
