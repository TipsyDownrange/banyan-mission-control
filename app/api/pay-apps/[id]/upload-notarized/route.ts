/**
 * BAN-337 Pay Apps v2b — POST /api/pay-apps/[id]/upload-notarized
 *
 * Amendment 1 PRIMARY notarization path: PM uploads a manually-notarized
 * PDF + notary metadata. Stores file in Drive, inserts a
 * notarization_sessions row (notarization_source=MANUAL_UPLOAD,
 * state=COMPLETED), transitions the pay app to READY_FOR_SUBMISSION, and
 * emits PAY_APP_NOTARIZED.
 *
 * Multipart body fields:
 *   file                          (PDF, required)
 *   notary_name                   (required)
 *   notary_state                  (required, 2-letter)
 *   notary_commission_expires     (YYYY-MM-DD, optional)
 *   notarization_date             (YYYY-MM-DD, optional — defaults to today)
 *   notarization_method           (IN_PERSON|REMOTE_ONLINE_PROOF|REMOTE_ONLINE_OTHER|MOBILE_NOTARY|OTHER)
 *   cost_usd                      (number, optional)
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  engagements,
  notarization_sessions,
  users as usersTable,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executePatternBTransition } from '@/lib/aia/execute-state-transition';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import {
  resolveEngagementDriveFolderId,
  ensurePayAppFolders,
  uploadBufferToDrive,
} from '@/lib/aia/drive-pay-app-folders';

const VALID_METHODS = new Set([
  'IN_PERSON',
  'REMOTE_ONLINE_PROOF',
  'REMOTE_ONLINE_OTHER',
  'MOBILE_NOTARY',
  'OTHER',
]);

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, '/api/pay-apps/[id]/upload-notarized', 'project:edit');
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'multipart form-data required' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required (PDF)' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'file exceeds 25MB' }, { status: 413 });
  }
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'file must be application/pdf' }, { status: 400 });
  }

  const notaryName = String(form.get('notary_name') ?? '').trim();
  const notaryState = String(form.get('notary_state') ?? '').trim().toUpperCase();
  if (!notaryName) return NextResponse.json({ error: 'notary_name is required' }, { status: 400 });
  if (!notaryState || notaryState.length !== 2) {
    return NextResponse.json({ error: 'notary_state must be a 2-letter code' }, { status: 400 });
  }
  const method = String(form.get('notarization_method') ?? '').trim().toUpperCase();
  if (!method || !VALID_METHODS.has(method)) {
    return NextResponse.json(
      { error: `notarization_method must be one of ${[...VALID_METHODS].join(', ')}` },
      { status: 400 },
    );
  }
  const commissionExpiresRaw = String(form.get('notary_commission_expires') ?? '').trim();
  const notarizationDateRaw = String(form.get('notarization_date') ?? '').trim();
  const costRaw = String(form.get('cost_usd') ?? '').trim();

  // Lookup pay app + engagement
  const lookup = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      pay_app_number: pay_applications.pay_app_number,
      state: pay_applications.state,
      engagement_id: pay_applications.engagement_id,
      is_test: engagements.is_test_project,
      drive_folder_id: engagements.drive_folder_id,
    })
    .from(pay_applications)
    .innerJoin(engagements, eq(pay_applications.engagement_id, engagements.engagement_id))
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (lookup.length === 0) {
    return NextResponse.json({ error: 'pay app not found' }, { status: 404 });
  }
  const payApp = lookup[0];

  // Only PENDING_DRAFT / READY_FOR_NOTARIZATION can advance via manual upload.
  if (payApp.state !== 'READY_FOR_NOTARIZATION' && payApp.state !== 'PENDING_DRAFT') {
    return NextResponse.json(
      {
        error: `pay app must be in PENDING_DRAFT or READY_FOR_NOTARIZATION to upload notarized PDF (current: ${payApp.state})`,
        code: 'INVALID_STATE',
      },
      { status: 409 },
    );
  }

  // Drive upload — best-effort; if no engagement folder, store a synthetic id
  // so the row still records the upload for non-prod / pre-link engagements.
  let signedPdfDriveId: string | null = null;
  const engFolderId = resolveEngagementDriveFolderId({
    drive_folder_id: payApp.drive_folder_id,
  });
  if (engFolderId) {
    try {
      const folders = await ensurePayAppFolders(engFolderId, payApp.pay_app_number);
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = `${id}-notarized.pdf`;
      const uploaded = await uploadBufferToDrive(
        folders.notarized_folder_id,
        filename,
        'application/pdf',
        buffer,
      );
      signedPdfDriveId = uploaded.drive_file_id;
    } catch (err) {
      return NextResponse.json(
        {
          error: 'Drive upload failed',
          code: 'DRIVE_UPLOAD_FAILED',
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 502 },
      );
    }
  }

  // Resolve uploaded_by user id (best effort)
  let uploadedBy: string | null = null;
  if (gate.actorEmail) {
    const u = await db
      .select({ id: usersTable.user_id })
      .from(usersTable)
      .where(eq(usersTable.email, gate.actorEmail))
      .limit(1);
    uploadedBy = u[0]?.id ?? null;
  }

  // Transaction: insert notarization_sessions + emit + transition pay app.
  try {
    const sessionRow = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(notarization_sessions)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: payApp.engagement_id,
          target_kind: 'PAY_APP',
          pay_app_id: id,
          notarization_source: 'MANUAL_UPLOAD',
          provider: 'MANUAL',
          state: 'COMPLETED',
          notary_name: notaryName,
          notary_state: notaryState,
          notary_commission_expires: commissionExpiresRaw || null,
          notarization_date: notarizationDateRaw || new Date().toISOString().slice(0, 10),
          notarization_method: method,
          signed_pdf_drive_id: signedPdfDriveId,
          uploaded_by: uploadedBy,
          cost_amount: costRaw ? String(Number(costRaw).toFixed(2)) : null,
          completed_at: new Date(),
        })
        .returning({
          session_id: notarization_sessions.session_id,
          completed_at: notarization_sessions.completed_at,
        });

      const session = inserted[0];

      await emitActivitySpineEvent(tx, {
        event_type: 'PAY_APP_NOTARIZED',
        scope_entity_type: 'project',
        scope_entity_id: payApp.engagement_id,
        entity_kind: 'pay_application',
        entity_id: id,
        notes: notaryName,
        test_data: !!payApp.is_test,
        metadata: {
          notarization_source: 'MANUAL_UPLOAD',
          notarization_session_id: session.session_id,
          notary_name: notaryName,
          notary_state: notaryState,
          notarization_method: method,
          signed_pdf_drive_id: signedPdfDriveId,
          actor: gate.actorEmail,
        },
      });

      return session;
    });

    // State transition (separate tx — the executor opens its own).
    const transition = await executePatternBTransition({
      entity: 'pay_application',
      table: pay_applications,
      pkColumn: pay_applications.pay_app_id,
      pkValue: id,
      tenantColumn: pay_applications.tenant_id,
      tenantId: gate.tenantId,
      stateColumn: pay_applications.state,
      toState: 'READY_FOR_SUBMISSION',
      reason: 'Manual notarization upload completed',
      actorEmail: gate.actorEmail,
      testData: !!payApp.is_test,
      engagementId: payApp.engagement_id,
    });

    if (!transition.ok) {
      return NextResponse.json(
        {
          ok: true,
          notarization_session_id: sessionRow.session_id,
          warning: `Notarization recorded but state transition failed: ${transition.message}`,
          code: transition.code,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      notarization_session_id: sessionRow.session_id,
      notarization_source: 'MANUAL_UPLOAD',
      signed_pdf_drive_id: signedPdfDriveId,
      state: transition.to_state,
      from_state: transition.from_state,
      event_id: transition.event_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
