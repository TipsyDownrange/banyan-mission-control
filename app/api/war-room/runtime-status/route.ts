import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { buildWarRoomRuntimeHealth } from '@/lib/war-room/runtimeStatus';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase() || '';

  if (!session || !email.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let costData = null;
  try {
    const origin = new URL(req.url).origin;
    const response = await fetch(`${origin}/api/cost`, { cache: 'no-store' });
    costData = await response.json();
  } catch (error) {
    costData = {
      error: `cost route unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const runtimeHealth = await buildWarRoomRuntimeHealth({ costData });
  return NextResponse.json(runtimeHealth);
}
