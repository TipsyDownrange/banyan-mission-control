import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getWarRoomDashboardData } from '@/lib/war-room/data';

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase() || '';

  if (!session || !email.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await getWarRoomDashboardData();
  return NextResponse.json(data);
}
