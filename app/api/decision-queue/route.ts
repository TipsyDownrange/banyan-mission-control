/**
 * GET /api/decision-queue
 * Fetches banyanos_decision_queue.json from Drive and returns DecisionQueueData.
 * File identified by DECISION_QUEUE_FILE_ID env var.
 * Read-only. Fresh read per GC-D021.
 */
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

export async function GET() {
  const fileId = process.env.DECISION_QUEUE_FILE_ID;
  if (!fileId) {
    return NextResponse.json({ ok: false, error: 'DECISION_QUEUE_FILE_ID env var not set' }, { status: 500 });
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive.readonly']);
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'text' }
    );

    const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const parsed = JSON.parse(raw);

    // Recompute counts from live decision array
    const decisions = parsed.decisions || [];
    const open_count = decisions.filter((d: { status: string }) => d.status === 'open').length;
    const deferred_count = decisions.filter((d: { status: string }) => d.status === 'deferred').length;
    const discussing_count = decisions.filter((d: { status: string }) => d.status === 'discussing').length;
    const resolved_count = decisions.filter((d: { status: string }) => d.status === 'resolved').length;

    return NextResponse.json({
      ok: true,
      data: { ...parsed, open_count, deferred_count, discussing_count, resolved_count },
    });
  } catch (err) {
    console.error('[/api/decision-queue] fetch error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
