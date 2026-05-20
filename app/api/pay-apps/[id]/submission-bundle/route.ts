/**
 * AIA Submission Packet Export v1 — GET /api/pay-apps/[id]/submission-bundle
 *
 * Read-only, ephemeral.  Assembles a direct-submission PDF (or ZIP) bundle
 * for non-Textura GCs.  No DB writes, no state transitions, no Activity
 * Spine emission — submit-direct keeps owning PAY_APP_SUBMITTED.  This
 * endpoint is the bundle generator only; the PM still presses Submit Direct
 * separately to record the email/handoff.
 *
 * State gate (per scope decision B): READY_FOR_SUBMISSION (primary) plus
 * SUBMITTED / ARCHITECT_CERTIFIED / GC_APPROVED for record-copy re-download.
 */

import { NextResponse } from 'next/server';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import {
  assembleSubmissionBundle,
  BundleSizeLimitError,
  InvalidPayAppStateError,
  PayAppNotFoundError,
  type SubmissionBundleFormat,
  PAY_APP_STATES_ALLOWED_FOR_BUNDLE,
} from '@/lib/aia/submission-bundle-assembler';

function parseFormat(value: string | null): SubmissionBundleFormat | { error: string } {
  if (value == null || value === '' || value === 'pdf') return 'pdf';
  if (value === 'zip') return 'zip';
  return { error: `unknown format "${value}" (allowed: pdf, zip)` };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const url = new URL(req.url);
  const formatParsed = parseFormat(url.searchParams.get('format'));
  if (typeof formatParsed === 'object') {
    return NextResponse.json({ error: formatParsed.error }, { status: 400 });
  }
  const format: SubmissionBundleFormat = formatParsed;

  try {
    const assembled = await assembleSubmissionBundle({
      payAppId: id,
      format,
      ctx: { tenantId: gate.tenantId, actorEmail: gate.actorEmail },
    });
    const ab = assembled.buffer.buffer.slice(
      assembled.buffer.byteOffset,
      assembled.buffer.byteOffset + assembled.buffer.byteLength,
    );
    return new NextResponse(ab as ArrayBuffer, {
      status: 200,
      headers: {
        'content-type': assembled.content_type,
        'content-disposition': `attachment; filename="${assembled.filename}"`,
        'x-pay-app-id': id,
        'x-bundle-format': format,
        'x-bundle-sections': String(assembled.sections.length),
      },
    });
  } catch (err) {
    if (err instanceof PayAppNotFoundError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 404 });
    }
    if (err instanceof InvalidPayAppStateError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          state: err.state,
          allowed_states: PAY_APP_STATES_ALLOWED_FOR_BUNDLE,
        },
        { status: 409 },
      );
    }
    if (err instanceof BundleSizeLimitError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          section: err.section,
          bytes: err.bytes,
          limit: err.limit,
        },
        { status: 413 },
      );
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(
      { error: `submission bundle assembly failed: ${message}` },
      { status: 500 },
    );
  }
}
