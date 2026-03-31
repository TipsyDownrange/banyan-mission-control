import { NextResponse } from 'next/server';

// In production this would query the OpenClaw SQLite sessions DB
// For now returns structured placeholder so the UI renders correctly
export async function GET() {
  return NextResponse.json({
    entries: [],
    note: 'Live data requires OpenClaw session DB access — connect Mac mini bridge to enable',
  });
}
