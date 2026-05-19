import { NextResponse } from 'next/server';
import { buildWarRoomRuntimeHealth } from '@/lib/war-room/runtimeStatus';
import { passWarRoomGate } from '@/lib/war-room/api-gate';

export async function GET(req: Request) {
  const gate = await passWarRoomGate(req);
  if (!gate.ok) return gate.response;

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
