/**
 * GET /api/build-state
 * Fetches banyanos_build_state.json from Drive and returns hydrated BuildTimelineData.
 * File identified by BUILD_STATE_FILE_ID env var.
 * Read-only. No writes.
 */
import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

export async function GET() {
  const fileId = process.env.BUILD_STATE_FILE_ID;
  if (!fileId) {
    return NextResponse.json({ ok: false, error: 'BUILD_STATE_FILE_ID env var not set' }, { status: 500 });
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

    // Compute derived fields from task state
    const phases: Array<{ phase_number: number; status: string; tasks: Array<{ done: boolean }> }> = parsed.phases || [];
    const allTasks = phases.flatMap((p) => p.tasks || []);
    const doneTasks = allTasks.filter((t) => t.done).length;
    const overall_pct_complete = allTasks.length > 0 ? Math.round((doneTasks / allTasks.length) * 100) : 0;

    // Current phase: first in_progress, else first not_started after last complete
    let current_phase_number = 0;
    const inProgress = phases.find((p) => p.status === 'in_progress');
    if (inProgress) {
      current_phase_number = inProgress.phase_number;
    } else {
      const notStarted = phases.find((p) => p.status === 'not_started');
      if (notStarted) current_phase_number = notStarted.phase_number;
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...parsed,
        overall_pct_complete,
        current_phase_number,
      },
    });
  } catch (err) {
    console.error('[/api/build-state] fetch error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
