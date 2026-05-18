/**
 * BAN-337 Pay Apps v2b — POST /api/pay-apps/[id]/assemble-textura-bundle
 *
 * Bundles the per-pay-app Textura invoice CSV, the notarized PDF (from
 * notarization_sessions.signed_pdf_drive_id), and a v2c lien-waiver
 * placeholder file into a ZIP. Inserts a textura_submissions row with
 * submission_status='GENERATED' and the bundle drive ids.
 *
 * Test-project pay apps still get a bundle for verification, but the
 * Textura watermark (row 1) makes the CSV impossible to import to a live
 * Textura tenant accidentally.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { google } from 'googleapis';
import {
  db,
  pay_applications,
  pay_app_line_items,
  schedule_of_values,
  engagements,
  notarization_sessions,
  textura_submissions,
  users as usersTable,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { generateTexturaInvoiceCsv } from '@/lib/aia/textura-csv';
import { buildStoredZip } from '@/lib/aia/zip-store';
import {
  resolveEngagementDriveFolderId,
  ensurePayAppFolders,
  uploadBufferToDrive,
} from '@/lib/aia/drive-pay-app-folders';
import { getGoogleAuth } from '@/lib/gauth';

async function downloadDriveFile(driveFileId: string): Promise<Buffer> {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive.readonly']);
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(
    req,
    '/api/pay-apps/[id]/assemble-textura-bundle',
    'project:edit',
  );
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const lookup = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      pay_app_number: pay_applications.pay_app_number,
      engagement_id: pay_applications.engagement_id,
      is_test: engagements.is_test_project,
      kid: engagements.kid,
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

  // ── Build invoice CSV ──
  const lines = await db
    .select()
    .from(pay_app_line_items)
    .where(and(
      eq(pay_app_line_items.tenant_id, gate.tenantId),
      eq(pay_app_line_items.pay_app_id, id),
    ))
    .orderBy(pay_app_line_items.line_number);
  if (lines.length === 0) {
    return NextResponse.json({ error: 'pay app has no line items' }, { status: 422 });
  }

  const sovIds = lines.map((l) => l.sov_line_id).filter((x): x is string => !!x);
  const phaseMap = new Map<string, number>();
  if (sovIds.length > 0) {
    const sovRows = await db
      .select({
        sov_line_id: schedule_of_values.sov_line_id,
        textura_phase_code: schedule_of_values.textura_phase_code,
      })
      .from(schedule_of_values)
      .where(eq(schedule_of_values.tenant_id, gate.tenantId));
    for (const r of sovRows) {
      if (r.sov_line_id && r.textura_phase_code !== null) {
        phaseMap.set(r.sov_line_id, r.textura_phase_code);
      }
    }
  }

  const csv = generateTexturaInvoiceCsv(
    lines.map((l) => ({
      item_number: l.sov_line_id && phaseMap.has(l.sov_line_id)
        ? phaseMap.get(l.sov_line_id)!
        : l.line_number,
      description: l.description,
      scheduled_value: l.scheduled_value,
      work_this_period: l.work_completed_this_period,
      material_stored_this_period: l.stored_materials,
      retention_held_this_period: l.retainage_held,
      request_previously_held: l.work_completed_previous,
    })),
    { is_test_project: !!payApp.is_test },
  );

  // ── Latest completed notarization (manual upload) ──
  const notarRow = await db
    .select({
      session_id: notarization_sessions.session_id,
      signed_pdf_drive_id: notarization_sessions.signed_pdf_drive_id,
      notarization_source: notarization_sessions.notarization_source,
    })
    .from(notarization_sessions)
    .where(and(
      eq(notarization_sessions.tenant_id, gate.tenantId),
      eq(notarization_sessions.pay_app_id, id),
      eq(notarization_sessions.state, 'COMPLETED'),
    ))
    .orderBy(desc(notarization_sessions.completed_at))
    .limit(1);
  const notar = notarRow[0];

  let notarizedPdfBuffer: Buffer | null = null;
  if (notar?.signed_pdf_drive_id) {
    try {
      notarizedPdfBuffer = await downloadDriveFile(notar.signed_pdf_drive_id);
    } catch (err) {
      return NextResponse.json(
        {
          error: 'failed to fetch notarized PDF from Drive',
          code: 'DRIVE_FETCH_FAILED',
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 502 },
      );
    }
  }

  // ── Build the ZIP ──
  const zipEntries = [
    {
      name: `pay-app-${payApp.pay_app_number}-textura-invoice.csv`,
      data: Buffer.from(csv, 'utf-8'),
    },
  ];
  if (notarizedPdfBuffer) {
    zipEntries.push({
      name: `pay-app-${payApp.pay_app_number}-notarized.pdf`,
      data: Buffer.from(notarizedPdfBuffer),
    });
  }
  zipEntries.push({
    name: 'lien-waivers/README.txt',
    data: Buffer.from(
      'Lien-waiver placeholders — populated in v2c (BAN-338).\r\n' +
        'See AIA v1.1 §10 (lien_waivers) for the waiver state machine.\r\n',
      'utf-8',
    ),
  });

  const zipBuffer = buildStoredZip(zipEntries);

  // ── Upload bundle to Drive Pay App folder ──
  const engFolderId = resolveEngagementDriveFolderId({ drive_folder_id: payApp.drive_folder_id });
  let bundleDriveId: string | null = null;
  let csvDriveId: string | null = null;

  if (engFolderId) {
    try {
      const folders = await ensurePayAppFolders(engFolderId, payApp.pay_app_number);
      const bundleName = `${id}-bundle.zip`;
      const csvName = `${id}-invoice.csv`;
      const bundleUpload = await uploadBufferToDrive(
        folders.textura_folder_id,
        bundleName,
        'application/zip',
        zipBuffer,
      );
      bundleDriveId = bundleUpload.drive_file_id;
      const csvUpload = await uploadBufferToDrive(
        folders.textura_folder_id,
        csvName,
        'text/csv',
        Buffer.from(csv, 'utf-8'),
      );
      csvDriveId = csvUpload.drive_file_id;
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

  // Resolve submitted_by user id (best-effort)
  let submittedBy: string | null = null;
  if (gate.actorEmail) {
    const u = await db
      .select({ id: usersTable.user_id })
      .from(usersTable)
      .where(eq(usersTable.email, gate.actorEmail))
      .limit(1);
    submittedBy = u[0]?.id ?? null;
  }

  const inserted = await db
    .insert(textura_submissions)
    .values({
      tenant_id: gate.tenantId,
      engagement_id: payApp.engagement_id,
      pay_app_id: id,
      bundle_drive_id: bundleDriveId,
      csv_drive_id: csvDriveId,
      notarized_pdf_drive_id: notar?.signed_pdf_drive_id ?? null,
      submission_status: 'GENERATED',
      submitted_by: submittedBy,
      created_by: submittedBy,
    })
    .returning({ submission_id: textura_submissions.submission_id });

  return NextResponse.json({
    ok: true,
    submission_id: inserted[0].submission_id,
    pay_app_id: id,
    bundle_drive_id: bundleDriveId,
    csv_drive_id: csvDriveId,
    notarized_pdf_drive_id: notar?.signed_pdf_drive_id ?? null,
    entries: zipEntries.map((e) => ({ name: e.name, size: e.data.length })),
    is_test_project: !!payApp.is_test,
  });
}
