/**
 * POST /api/decision-queue/resolve
 * Body: { decision_id, resolution, rationale, direct_order_text }
 * Reads current JSON, updates decision, writes back to Drive.
 * Resolved entries are NEVER deleted — immutable audit trail.
 */
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { Readable } from 'stream';

type DecisionResolution = 'approved' | 'approved_amended' | 'rejected' | 'deferred' | 'overridden' | 'rerouted';
type DecisionStatus = 'open' | 'deferred' | 'discussing' | 'resolved';

function statusFromResolution(resolution: DecisionResolution): DecisionStatus {
  if (resolution === 'deferred') return 'deferred';
  return 'resolved';
}

export async function POST(req: Request) {
  const fileId = process.env.DECISION_QUEUE_FILE_ID;
  if (!fileId) {
    return NextResponse.json({ ok: false, error: 'DECISION_QUEUE_FILE_ID env var not set' }, { status: 500 });
  }

  let body: { decision_id: string; resolution: DecisionResolution; rationale?: string; direct_order_text?: string; status?: DecisionStatus };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }); }

  const { decision_id, resolution, rationale, direct_order_text, status: explicitStatus } = body;
  if (!decision_id) return NextResponse.json({ ok: false, error: 'decision_id required' }, { status: 400 });

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive']);
    const drive = google.drive({ version: 'v3', auth });

    // Read current file
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'text' }
    );
    const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const data = JSON.parse(raw);

    // Find decision
    const idx = (data.decisions || []).findIndex((d: { decision_id: string }) => d.decision_id === decision_id);
    if (idx === -1) return NextResponse.json({ ok: false, error: `Decision ${decision_id} not found` }, { status: 404 });

    const existing = data.decisions[idx];

    // 409 — cannot re-resolve an already-resolved decision
    if (!explicitStatus && existing.status === 'resolved') {
      return NextResponse.json({ ok: false, error: `Decision ${decision_id} is already resolved` }, { status: 409 });
    }

    // 400 — overridden / rerouted require a direct order
    if ((resolution === 'overridden' || resolution === 'rerouted') && !direct_order_text?.trim()) {
      return NextResponse.json({ ok: false, error: 'direct_order_text is required for overridden and rerouted resolutions' }, { status: 400 });
    }

    // If this is a status-only update (discussing), just update status
    if (explicitStatus === 'discussing') {
      data.decisions[idx] = { ...existing, status: 'discussing' };
    } else {
      // Full resolution — immutable after this point
      const now = new Date().toISOString();
      const finalResolution = resolution === 'approved' && direct_order_text?.trim()
        ? 'approved_amended'
        : resolution;
      const newStatus = statusFromResolution(finalResolution);

      data.decisions[idx] = {
        ...existing,
        status: newStatus,
        resolution: finalResolution,
        resolution_timestamp: now,
        resolution_by: 'Sean Daniels',
        rationale: rationale || null,
        direct_order_text: direct_order_text || null,
      };
    }

    data.last_updated = new Date().toISOString();

    // Recompute counts
    data.open_count = data.decisions.filter((d: { status: string }) => d.status === 'open').length;
    data.deferred_count = data.decisions.filter((d: { status: string }) => d.status === 'deferred').length;
    data.resolved_count = data.decisions.filter((d: { status: string }) => d.status === 'resolved').length;

    // Write back to Drive
    const updated = JSON.stringify(data, null, 2);
    await drive.files.update({
      fileId,
      media: { mimeType: 'application/json', body: Readable.from(updated) },
      supportsAllDrives: true,
      fields: 'id,modifiedTime',
    });

    return NextResponse.json({ ok: true, data: data.decisions[idx] });
  } catch (err) {
    console.error('[/api/decision-queue/resolve] error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
