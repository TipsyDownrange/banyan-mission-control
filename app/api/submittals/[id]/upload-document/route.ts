/**
 * BAN-340 PM-V1.0-A — POST /api/submittals/[id]/upload-document
 *
 * Attaches a Drive document reference to one of the three document arrays
 * on a submittal row:
 *   - submitted_documents       (PM-side submitted package)
 *   - review_comments_documents (markup / review comments)
 *   - approved_documents        (final approved copy)
 *
 * The actual Drive upload is performed client-side or by an upstream
 * service; this route persists the drive_file_id reference + (optional)
 * display label. No state-machine transition is triggered by upload.
 */

import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db, submittals } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';

const ROUTE_PATH = '/api/submittals/[id]/upload-document';
const CATEGORIES = {
  submitted: submittals.submitted_documents,
  review: submittals.review_comments_documents,
  approved: submittals.approved_documents,
} as const;

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { category?: string; drive_file_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const category = (body.category ?? '').trim();
  const driveFileId = (body.drive_file_id ?? '').trim();
  if (!(category in CATEGORIES)) {
    return NextResponse.json(
      { error: 'category must be one of submitted, review, approved' },
      { status: 400 },
    );
  }
  if (!driveFileId) {
    return NextResponse.json(
      { error: 'drive_file_id is required' },
      { status: 400 },
    );
  }

  const column =
    category === 'submitted'
      ? sql`submitted_documents`
      : category === 'review'
        ? sql`review_comments_documents`
        : sql`approved_documents`;

  const updated = await db
    .update(submittals)
    .set({
      // Append the new drive file id if not already present.
      ...(category === 'submitted'
        ? { submitted_documents: sql`CASE WHEN ${driveFileId} = ANY(${column}) THEN ${column} ELSE array_append(${column}, ${driveFileId}) END` }
        : category === 'review'
          ? { review_comments_documents: sql`CASE WHEN ${driveFileId} = ANY(${column}) THEN ${column} ELSE array_append(${column}, ${driveFileId}) END` }
          : { approved_documents: sql`CASE WHEN ${driveFileId} = ANY(${column}) THEN ${column} ELSE array_append(${column}, ${driveFileId}) END` }),
      updated_at: new Date(),
    })
    .where(
      and(
        eq(submittals.submittal_id, id),
        eq(submittals.tenant_id, gate.tenantId),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'submittal not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, submittal: updated[0] });
}
