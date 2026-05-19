import { NextResponse } from 'next/server';
import { getWarRoomDashboardData } from '@/lib/war-room/data';
import { passWarRoomGate } from '@/lib/war-room/api-gate';

export async function GET(req: Request) {
  const gate = await passWarRoomGate(req);
  if (!gate.ok) return gate.response;

  const data = await getWarRoomDashboardData();
  return NextResponse.json(data);
}
