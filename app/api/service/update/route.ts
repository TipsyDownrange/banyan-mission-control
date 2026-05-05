import { hawaiiNow } from '@/lib/hawaii-time';
import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { checkPermission } from '@/lib/permissions';
import { fireAndForgetCustomerUpdate } from '@/lib/updateCustomerRecord';
import { normalizePhone, normalizeEmail, normalizeName, normalizeContactList, resolveWorkOrderIsland } from '@/lib/normalize';
import { emitMCEvent } from '@/lib/events';
import { invalidateCache } from '@/app/api/service/route';
import { getBackendSheetId } from '@/lib/backend-config';
import { upsertCrosswalkEntry } from '@/lib/entityCrosswalk';
import { buildDispatchRow, validateDispatchRow } from '@/lib/dispatch-schedule';
import { isCompletionRowComplete } from '@/lib/step-completion';

const BACKEND_SHEET_ID = getBackendSheetId();
const TAB = 'Service_Work_Orders';

// Column index map (0-based, must match migration HEADERS)
const COL_IDX: Record<string, number> = {
  wo_id:           0,
  wo_number:       1,
  name:            2,
  description:     3,
  status:          4,
  island:          5,
  area_of_island:  6,
  address:         7,
  contact_person:  8,
  contact_title:   9,
  contact_phone:   10,
  contact_email:   11,
  customer_name:   12,
  system_type:     13,
  assigned_to:     14,
  date_received:   15,
  due_date:        16,
  scheduled_date:  17,
  start_date:      18,
  hours_estimated: 19,
  hours_actual:    20,
  men_required:    21,
  comments:        22,
  folder_url:      23,
  quote_total:     24,
  quote_status:    25,
  created_at:      26, // AA
  updated_at:      27, // AB
  source:          28, // AC
  // QBO invoice fields (actual sheet positions)
  qbo_invoice_id:  26, // AA
  invoice_number:  27, // AB
  invoice_total:   28, // AC
  invoice_balance: 29, // AD
  invoice_date:    30, // AE
  // BanyanOS invoicing tracker (AF-AO)
  deposit_status:      31, // AF
  deposit_amount:      32, // AG
  deposit_invoice_num: 33, // AH
  deposit_sent_date:   34, // AI
  deposit_paid_date:   35, // AJ
  final_status:        36, // AK
  final_amount:        37, // AL
  final_invoice_num:   38, // AM
  final_sent_date:     39, // AN
  final_paid_date:     40, // AO
  invoices_json:       41, // AP
  org_id:              42, // AQ — Phase 2: FK to Organizations
  customer_id:         43, // AR — GC-D053: FK to Customers table
  legacy_flag:         44, // AS — GC-D053: pre-GC-D053 backfill marker
  requires_org_assignment: 46, // AU — identity follow-up flag for missing org_id
};

function colLetter(idx: number): string {
  // 0-based index → spreadsheet column letter (A, B, ... Z, AA, ...)
  let result = '';
  let n = idx;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}


async function deriveWOStatus(
  sheets: ReturnType<typeof google.sheets>,
  woId: string,
): Promise<'new' | 'estimated' | 'in_progress' | 'completed'> {
  const normalizedWoId = (woId || '').trim();
  const strippedWoId = normalizedWoId.replace(/^WO-/i, '');

  const [plansRes, stepsRes, completionsRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: 'Install_Plans!A2:G5000',
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: 'Install_Steps!A2:P5000',
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: 'Step_Completions!A2:J5000',
    }),
  ]);

  const planIds = new Set(
    (plansRes.data.values || [])
      .filter((row) => {
        const jobId = (row[1] || '').trim();
        return jobId === normalizedWoId || jobId === strippedWoId;
      })
      .map((row) => row[0] || '')
      .filter(Boolean),
  );

  if (planIds.size === 0) return 'new';

  const steps = (stepsRes.data.values || []).filter((row) => planIds.has(row[1] || ''));
  if (steps.length === 0) return 'new';

  const stepIds = new Set(steps.map((row) => row[0] || '').filter(Boolean));
  const completions = (completionsRes.data.values || []).filter((row) => stepIds.has(row[1] || ''));
  if (completions.length === 0) return 'estimated';

  const completeStepIds = new Set<string>();
  for (const row of completions) {
    const stepId = row[1] || '';
    if (stepId && isCompletionRowComplete(row)) {
      completeStepIds.add(stepId);
    }
  }

  const completedSteps = steps.filter((row) => completeStepIds.has(row[0] || '')).length;
  if (completedSteps === 0) return 'estimated';
  if (completedSteps === steps.length) return 'completed';
  return 'in_progress';
}

// PATCH — update an existing WO row by wo_id or wo_number
// Body: { woId?, woNumber?, stage?, status?, assignedTo?, description?,
//         scheduledDate?, startDate?, notes?, hoursEstimated?, hoursActual?,
//         men?, contactPhone?, contactEmail?, contactPerson?, folderUrl?, island? }
export async function PATCH(req: Request) {
  // BAN-40: dual-auth — FA server-to-server (X-Internal-Key) OR browser session (wo:edit)
  let actorEmail: string;
  const incomingKey = req.headers.get('X-Internal-Key');
  if (incomingKey !== null) {
    const envKey = process.env.INTERNAL_API_KEY || '';
    if (!envKey || incomingKey.trim() !== envKey.trim()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    actorEmail = 'field-app-service@internal';
  } else {
    const { allowed, email: sessionEmail } = await checkPermission(req, 'wo:edit');
    if (!allowed) return NextResponse.json({ error: 'Forbidden: wo:edit required' }, { status: 403 });
    actorEmail = sessionEmail || '';
  }

  try {
    const body = await req.json();
    const { woId, woNumber, stage, status } = body;
    const reason: string = body.reason || '';

    if (!woId && !woNumber) {
      return NextResponse.json({ error: 'woId or woNumber required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch all rows to find the target
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: `${TAB}!A2:AU5000`,
    });

    const rows = res.data.values || [];
    let targetRowIdx = -1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as string[];
      const rowWoId = (row[COL_IDX.wo_id] || '').trim();
      const rowWoNum = (row[COL_IDX.wo_number] || '').trim();
      if (woId && rowWoId === woId) { targetRowIdx = i; break; }
      // Also match if woNumber is actually the full wo_id (e.g. "WO-26-8289" passed as woNumber)
      if (woNumber && rowWoId === woNumber) { targetRowIdx = i; break; }
      if (woNumber && (rowWoNum === woNumber || rowWoId === `WO-${woNumber}`)) {
        targetRowIdx = i;
        break;
      }
    }

    if (targetRowIdx === -1) {
      return NextResponse.json(
        { error: `WO not found: ${woId || woNumber}` },
        { status: 404 }
      );
    }

    // Sheet row number: data starts at row 2 (header is row 1)
    const sheetRow = targetRowIdx + 2;
    const now = hawaiiNow();
    const resolvedWoId = (woId || rows[targetRowIdx]?.[COL_IDX.wo_id] || '').trim();

    // Snapshot pre-write values for GC-D037 either-both-or-neither rollback
    const oldStatus    = ((rows[targetRowIdx] as string[])?.[COL_IDX.status]     || '').trim();
    const oldUpdatedAt = ((rows[targetRowIdx] as string[])?.[COL_IDX.updated_at] || '').trim();
    const oldScheduledDate = ((rows[targetRowIdx] as string[])?.[COL_IDX.scheduled_date] || '').trim();
    const oldOrgId = ((rows[targetRowIdx] as string[])?.[COL_IDX.org_id] || '').trim();
    const currentCustomerId = ((rows[targetRowIdx] as string[])?.[COL_IDX.customer_id] || '').trim();
    const requestedOrgId = body.org_id !== undefined ? String(body.org_id).trim() : '';

    if (requestedOrgId && oldOrgId && requestedOrgId !== oldOrgId) {
      return NextResponse.json(
        { error: `WO already has org_id "${oldOrgId}"; refusing to overwrite with "${requestedOrgId}".` },
        { status: 409 }
      );
    }

    // Build field updates
    const updates: { col: string; value: string }[] = [];

    const fieldMap: Record<string, string> = {
      status:          'status',
      assignedTo:      'assigned_to',
      description:     'description',
      scheduledDate:    'scheduled_date',
      startDate:       'start_date',
      notes:           'comments',
      // camelCase (legacy frontend compat)
      contactPhone:    'contact_phone',
      contactEmail:    'contact_email',
      contactPerson:   'contact_person',
      contactTitle:    'contact_title',
      customerName:    'customer_name',
      // snake_case (WODetailPanel new fields)
      contact_phone:   'contact_phone',
      contact_email:   'contact_email',
      contact_person:  'contact_person',
      customer_name:   'customer_name',
      folderUrl:       'folder_url',
      island:          'island',
      areaOfIsland:    'area_of_island',
      area_of_island:  'area_of_island',
      quoteTotal:      'quote_total',
      quoteStatus:     'quote_status',
      // Invoicing tracker fields
      deposit_status:      'deposit_status',
      deposit_amount:      'deposit_amount',
      deposit_invoice_num: 'deposit_invoice_num',
      deposit_sent_date:   'deposit_sent_date',
      deposit_paid_date:   'deposit_paid_date',
      final_status:        'final_status',
      final_amount:        'final_amount',
      final_invoice_num:   'final_invoice_num',
      final_sent_date:     'final_sent_date',
      final_paid_date:     'final_paid_date',
      invoices_json:        'invoices_json',
      org_id:              'org_id',
      customer_id:         'customer_id',
      requires_org_assignment: 'requires_org_assignment',
    };

    // Handle stage → status mapping (legacy frontend compat)
    const stageToStatus: Record<string, string> = {
      lead:               'lead',
      quote:              'quote',
      quoted:             'quoted',
      accepted:           'accepted',
      approved:           'approved',
      deposit_received:   'deposit_received',
      materials_ordered:  'materials_ordered',
      materials_received: 'materials_received',
      ready_to_schedule:  'ready_to_schedule',
      scheduled:          'scheduled',
      in_progress:        'in_progress',
      // PM "Complete" stage button — field/QA work done, before admin closeout.
      // Doctrine: work_complete = work done; closed = PM admin closeout.
      work_complete:      'work_complete',
      // Legacy synonym safety: callers sometimes send "completed". Treat as
      // work_complete (not closed) so PM can still take an explicit close step.
      completed:          'work_complete',
      closed:             'closed',
      lost:               'lost',
    };

    // BAN-105: Field App sends 'qa-complete' as the QA / Install Complete handoff.
    // Map it to the canonical MC pipeline value before any status resolution logic.
    const FA_TO_MC_STATUS: Record<string, string> = {
      'qa-complete': 'work_complete',
    };
    const rawRequestedStatus = status || (stage ? stageToStatus[stage] : undefined);
    const requestedStatus = rawRequestedStatus ? (FA_TO_MC_STATUS[rawRequestedStatus] ?? rawRequestedStatus) : rawRequestedStatus;
    let resolvedStatus = requestedStatus;
    // 'closed', 'lost', and 'work_complete' are explicit PM decisions — never override with derived status
    const EXPLICIT_STATUSES = new Set(['closed', 'lost', 'work_complete', 'deposit_received', 'materials_ordered', 'materials_received', 'ready_to_schedule']);
    if (requestedStatus && !EXPLICIT_STATUSES.has(requestedStatus) && resolvedWoId) {
      const derivedStatus = await deriveWOStatus(sheets, resolvedWoId);
      const normalizedRequestedStatus = requestedStatus === 'completed' ? 'closed' : requestedStatus;
      const normalizedDerivedStatus = derivedStatus === 'completed' ? 'closed' : derivedStatus;
      const stepStatusValues = new Set(['new', 'estimated', 'in_progress', 'completed', 'closed']);
      if (stepStatusValues.has(normalizedRequestedStatus) && normalizedRequestedStatus !== normalizedDerivedStatus) {
        resolvedStatus = normalizedDerivedStatus;
      }
    }

    if (resolvedStatus) {
      updates.push({
        col: colLetter(COL_IDX.status),
        value: resolvedStatus,
      });
    }

    const requestedScheduledDate = typeof body.scheduledDate === 'string' ? body.scheduledDate.trim() : '';
    const effectiveScheduledDate = requestedScheduledDate || oldScheduledDate;
    if (requestedStatus === 'scheduled' && !effectiveScheduledDate) {
      return NextResponse.json(
        { error: 'scheduled_date is required before moving a work order to Scheduled.' },
        { status: 400 }
      );
    }

    // Normalize fields that need canonical formatting
    const PHONE_FIELDS = new Set(['contactPhone', 'contact_phone']);
    const EMAIL_FIELDS = new Set(['contactEmail', 'contact_email']);
    const NAME_FIELDS = new Set(['customerName', 'customer_name', 'contactPerson', 'contact_person']);

    // Map all other fields
    for (const [bodyKey, colKey] of Object.entries(fieldMap)) {
      if (bodyKey === 'status') continue; // handled above
      if (body[bodyKey] !== undefined) {
        let val = String(body[bodyKey]);
        // Normalize on write
        if (PHONE_FIELDS.has(bodyKey)) val = normalizePhone(val);
        else if (EMAIL_FIELDS.has(bodyKey)) val = normalizeEmail(val);
        else if (bodyKey === 'contactPerson' || bodyKey === 'contact_person') val = normalizeContactList(val);
        else if (NAME_FIELDS.has(bodyKey)) val = normalizeName(val);
        if (bodyKey === 'island') val = resolveWorkOrderIsland(val);
        if (bodyKey === 'scheduledDate' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) val = val.slice(0, 16);
        updates.push({
          col: colLetter(COL_IDX[colKey]),
          value: val,
        });
      }
    }

    if (body.org_id !== undefined && body.requires_org_assignment === undefined) {
      updates.push({
        col: colLetter(COL_IDX.requires_org_assignment),
        value: String(!String(body.org_id).trim()),
      });
    }

    // Always update updated_at
    updates.push({
      col: colLetter(COL_IDX.updated_at),
      value: now,
    });

    if (updates.length === 1) {
      // Only updated_at — nothing else changed
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // GC-D053: validate customer_id if present in PATCH body
    if (body.customer_id !== undefined) {
      const custValidRes = await sheets.spreadsheets.values.get({
        spreadsheetId: BACKEND_SHEET_ID,
        range: 'Customers!A:N',
      });
      const custRows = custValidRes.data.values || [];
      const custHeaders = (custRows[0] || []) as string[];
      const cidIdx = custHeaders.indexOf('Customer_ID');
      if (cidIdx < 0) {
        return NextResponse.json(
          { error: 'Customers table missing Customer_ID column — GC-D053' },
          { status: 500 }
        );
      }
      const customerExists = custRows.slice(1).some(
        r => (r[cidIdx] || '').trim() === String(body.customer_id).trim()
      );
      if (!customerExists) {
        return NextResponse.json(
          { error: `customer_id "${body.customer_id}" not found in Customers table — GC-D053 MANDATORY` },
          { status: 400 }
        );
      }
    }

    // Write each updated cell individually (avoids range conflicts)
    const requests = updates.map(({ col, value }) => ({
      range: `${TAB}!${col}${sheetRow}`,
      values: [[value]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: BACKEND_SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: requests,
      },
    });

    if (requestedOrgId && !oldOrgId && currentCustomerId) {
      await upsertCrosswalkEntry(sheets, {
        customer_id: currentCustomerId,
        org_id: requestedOrgId,
        source: 'repair_panel',
        confidence: '1',
        updated_at: now,
      });
    }

    invalidateCache();

    // ─── GC-D037: emit MC event for status transitions (either-both-or-neither) ─
    if (resolvedStatus && resolvedStatus !== oldStatus) {
      const eventType =
        resolvedStatus === 'lost'   ? 'WO_DECLINED'    :
        resolvedStatus === 'closed' ? 'WO_CLOSED'      : 'STATUS_CHANGED';
      try {
        await emitMCEvent({
          wo_id:        resolvedWoId,
          event_type:   eventType,
          old_status:   oldStatus,
          new_status:   resolvedStatus,
          notes:        reason,
          submitted_by: actorEmail,
          origin:       'office',
        });
      } catch {
        // Compensating write — roll back status + updated_at (GC-D037 §5)
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: BACKEND_SHEET_ID,
          requestBody: {
            valueInputOption: 'RAW',
            data: [
              { range: `${TAB}!${colLetter(COL_IDX.status)}${sheetRow}`,     values: [[oldStatus]] },
              { range: `${TAB}!${colLetter(COL_IDX.updated_at)}${sheetRow}`, values: [[oldUpdatedAt]] },
            ],
          },
        });
        return NextResponse.json({ error: 'Event emit failed; status write rolled back.' }, { status: 500 });
      }
    }

    // ─── Acceptance trigger: write bid_hours to Install_Steps ────────────────
    if (resolvedStatus === 'approved') {
      try {
        const acceptedWoId = woId || rows[targetRowIdx]?.[COL_IDX.wo_id] || '';
        const estimateRes = await fetch(
          `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/service/estimate?wo=${encodeURIComponent(acceptedWoId)}`,
          { headers: { 'x-internal': '1' } }
        );
        const estimateJson = await estimateRes.json();
        const estimateData = estimateJson.data;

        if (estimateData && !estimateData.locked_at) {
          const wbRes = await fetch(
            `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/work-breakdown/${encodeURIComponent(acceptedWoId)}`,
            { headers: { 'x-internal': '1' } }
          );
          const wbJson = await wbRes.json();
          const installSteps: Array<{ install_step_id: string; step_name: string }> = wbJson.steps || [];
          const laborLines: Array<{ install_step_id?: string; hours: string; description: string; rate: string; custom?: boolean }> =
            estimateData.labor || [];

          // Get current Install_Steps sheet data
          const stepsSheetRes = await sheets.spreadsheets.values.get({
            spreadsheetId: BACKEND_SHEET_ID,
            range: 'Install_Steps!A2:P5000',
          });
          const stepRows = stepsSheetRes.data.values || [];

          // Build set of install_step_ids present in estimate
          const estimateStepIds = new Set(
            laborLines.filter(l => l.install_step_id).map(l => l.install_step_id!)
          );

          // Build set of all install_step_ids for this WO
          const woStepIds = new Set(installSteps.map(s => s.install_step_id));

          const stepUpdates: { range: string; values: string[][] }[] = [];

          for (const laborLine of laborLines) {
            if (laborLine.install_step_id) {
              // Update bid_hours on existing Install_Step
              const rowIdx = stepRows.findIndex(r => r[0] === laborLine.install_step_id);
              if (rowIdx !== -1) {
                const sheetRowNum = rowIdx + 2;
                const existing = stepRows[rowIdx];
                while (existing.length < 16) existing.push('');
                existing[13] = String(parseFloat(laborLine.hours) || 0);
                stepUpdates.push({
                  range: `Install_Steps!A${sheetRowNum}:P${sheetRowNum}`,
                  values: [existing.slice(0, 16)],
                });
              }
            } else if (laborLine.custom) {
              // Create new Install_Step for custom labor line
              // Find the install_plan_id for this WO (use first plan)
              const plansRes2 = await sheets.spreadsheets.values.get({
                spreadsheetId: BACKEND_SHEET_ID,
                range: 'Install_Plans!A2:G5000',
              });
              const planRows = plansRes2.data.values || [];
              const woPlan = planRows.find(r => r[1] === acceptedWoId || r[1] === acceptedWoId.replace(/^WO-/i, ''));
              const planId = woPlan ? woPlan[0] : '';
              if (planId) {
                const nextSeq = installSteps.length + 1;
                const newStepId = `IS-CUSTOM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                await sheets.spreadsheets.values.append({
                  spreadsheetId: BACKEND_SHEET_ID,
                  range: 'Install_Steps!A:P',
                  valueInputOption: 'RAW',
                  requestBody: {
                    values: [[newStepId, planId, nextSeq, laborLine.description, parseFloat(laborLine.hours) || 0, '', 'N', '', '', '', '', '', '', String(parseFloat(laborLine.hours) || 0), '', '']],
                  },
                });
              }
            }
          }

          // Delete Install_Steps that were removed from the estimate
          for (const step of installSteps) {
            if (!estimateStepIds.has(step.install_step_id) && woStepIds.has(step.install_step_id)) {
              const rowIdx = stepRows.findIndex(r => r[0] === step.install_step_id);
              if (rowIdx !== -1) {
                const sheetRowNum = rowIdx + 2;
                stepUpdates.push({
                  range: `Install_Steps!A${sheetRowNum}:P${sheetRowNum}`,
                  values: [['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']],
                });
              }
            }
          }

          // Batch write bid_hours updates
          if (stepUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId: BACKEND_SHEET_ID,
              requestBody: {
                valueInputOption: 'RAW',
                data: stepUpdates,
              },
            });
          }

          // Lock the estimate by writing locked_at to Carls_Method
          const lockedData = { ...estimateData, locked_at: now };
          await fetch(
            `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/service/estimate`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal': '1' },
              body: JSON.stringify({ woId: acceptedWoId, data: lockedData }),
            }
          );
        }
      } catch (acceptErr) {
        console.error('[acceptance-trigger] Failed to write bid_hours:', acceptErr);
        // Non-fatal — WO status update already succeeded
      }
    }

    // ─── BAN-42 Gate 2: Dispatch_Schedule A:S / 19-column sync ─────────────────
    const { scheduledDate, assignedTo } = body;
    const resolvedWoNumber = woNumber || rows[targetRowIdx]?.[COL_IDX.wo_number] || woId;
    const woName = rows[targetRowIdx]?.[COL_IDX.name] || '';
    const woIsland = body.island || rows[targetRowIdx]?.[COL_IDX.island] || '';
    const dispatchDate = typeof scheduledDate === 'string' && scheduledDate.includes('T')
      ? scheduledDate.slice(0, 10)
      : scheduledDate;

    type ScheduleSyncStatus = 'not_requested' | 'skipped' | 'created' | 'updated' | 'failed';
    let scheduleSyncResult: { status: ScheduleSyncStatus; slot_id?: string; warning?: string } =
      { status: 'not_requested' };

    if (dispatchDate && assignedTo) {
      const fieldSheetId = process.env.FIELD_BACKEND_SHEET_ID;
      if (!fieldSheetId) {
        // BAN-42: FIELD_BACKEND_SHEET_ID must be set in Vercel for dispatch sync to run.
        scheduleSyncResult = { status: 'skipped', warning: 'FIELD_BACKEND_SHEET_ID is not configured' };
        console.error('[schedule-sync] FIELD_BACKEND_SHEET_ID is not set — dispatch sync skipped');
      } else {
        const slotId = `SVC-${resolvedWoNumber}-${dispatchDate}`;
        const displayName = woName || `Service WO ${resolvedWoNumber}`;
        const createdBy = actorEmail || 'service/update';

        try {
          const existingRes = await sheets.spreadsheets.values.get({
            spreadsheetId: fieldSheetId,
            range: 'Dispatch_Schedule!A2:S5000',
          });
          const existingRows = (existingRes.data.values || []) as string[][];
          const rowIndex = existingRows.findIndex(r => r[0] === slotId);

          if (rowIndex < 0) {
            // Create: build a full 19-column row
            const newRow = buildDispatchRow({
              slot_id: slotId,
              date: dispatchDate,
              kID: `SVC-${resolvedWoNumber}`,
              project_name: displayName,
              island: woIsland,
              men_required: String(body.men || '1'),
              hours_estimated: body.hoursEstimated || '',
              assigned_crew: assignedTo,
              created_by: createdBy,
              status: 'filled',
            });
            const validation = validateDispatchRow(newRow);
            if (!validation.valid) {
              console.error('[schedule-sync] Row validation failed:', validation.errors);
              scheduleSyncResult = { status: 'failed', slot_id: slotId, warning: 'Row validation failed' };
            } else {
              await sheets.spreadsheets.values.append({
                spreadsheetId: fieldSheetId,
                range: 'Dispatch_Schedule!A:S',
                valueInputOption: 'RAW',
                requestBody: { values: [newRow] },
              });
              scheduleSyncResult = { status: 'created', slot_id: slotId };
            }
          } else {
            // Update: rebuild full A:S row, preserving Field App columns this route does not own.
            // Field App columns: confirmations(10/K), work_type(11/L), notes(12/M),
            // start_time(13/N), end_time(14/O), step_ids(15/P), hours_actual(16/Q),
            // focus_step_ids(18/S).
            const existing19 = [...existingRows[rowIndex]];
            while (existing19.length < 19) existing19.push('');

            const updatedRow = buildDispatchRow({
              slot_id: slotId,
              date: dispatchDate,
              kID: `SVC-${resolvedWoNumber}`,
              project_name: displayName,
              island: woIsland,
              men_required: body.men !== undefined ? String(body.men) : (existing19[5] || '1'),
              hours_estimated: body.hoursEstimated || existing19[6] || '',
              assigned_crew: assignedTo,
              created_by: existing19[8] || createdBy,
              status: 'filled',
              confirmations: existing19[10] || '',
              work_type: existing19[11] || '',
              notes: existing19[12] || '',
              start_time: existing19[13] || '',
              end_time: existing19[14] || '',
              step_ids: existing19[15] || '',
              hours_actual: existing19[16] || '',
              focus_step_ids: existing19[18] || '',
            });
            const validation = validateDispatchRow(updatedRow);
            if (!validation.valid) {
              console.error('[schedule-sync] Row validation failed:', validation.errors);
              scheduleSyncResult = { status: 'failed', slot_id: slotId, warning: 'Row validation failed' };
            } else {
              await sheets.spreadsheets.values.update({
                spreadsheetId: fieldSheetId,
                range: `Dispatch_Schedule!A${rowIndex + 2}:S${rowIndex + 2}`,
                valueInputOption: 'RAW',
                requestBody: { values: [updatedRow] },
              });
              scheduleSyncResult = { status: 'updated', slot_id: slotId };
            }
          }
        } catch (err) {
          console.error('[schedule-sync] Failed to write to Dispatch_Schedule:', err);
          scheduleSyncResult = { status: 'failed', slot_id: slotId, warning: 'Schedule sync failed; see server logs' };
        }
      }
    }

    // Write-back customer data to Customer DB (fire-and-forget)
    const custName = body.customerName || body.customer_name;
    const custPhone = body.contactPhone || body.contact_phone;
    const custEmail = body.contactEmail || body.contact_email;
    const custPerson = body.contactPerson || body.contact_person;
    const custIsland = body.island;
    if (custName || custPhone || custEmail) {
      fireAndForgetCustomerUpdate({
        name: custName,
        phone: custPhone,
        email: custEmail,
        primaryContact: custPerson,
        island: custIsland,
        source: 'wo_update',
      });
    }

    return NextResponse.json({ ok: true, sheetRow, woId: woId || resolvedWoNumber, schedule_sync: scheduleSyncResult });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
