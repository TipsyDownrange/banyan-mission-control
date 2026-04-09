import { hawaiiNow } from '@/lib/hawaii-time';
import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { checkPermission } from '@/lib/permissions';
import { fireAndForgetCustomerUpdate } from '@/lib/updateCustomerRecord';
import { normalizePhone, normalizeEmail, normalizeName } from '@/lib/normalize';
import { deriveWorkOrderStatus } from '@/lib/service-status';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
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
  // QBO invoice fields — AD through AH
  qbo_invoice_id:  29, // AD
  invoice_number:  30, // AE
  invoice_total:   31, // AF
  invoice_balance: 32, // AG
  invoice_date:    33, // AH
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

// PATCH — update an existing WO row by wo_id or wo_number
// Body: { woId?, woNumber?, stage?, status?, assignedTo?, description?,
//         scheduledDate?, startDate?, notes?, hoursEstimated?, hoursActual?,
//         men?, contactPhone?, contactEmail?, contactPerson?, folderUrl?, island? }
export async function PATCH(req: Request) {
  // Permission check — wo:edit required (Joey, Nate, Sean, Jody)
  const { allowed } = await checkPermission(req, 'wo:edit');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: wo:edit required' }, { status: 403 });

  try {
    const body = await req.json();
    const { woId, woNumber, stage, status } = body;

    if (!woId && !woNumber) {
      return NextResponse.json({ error: 'woId or woNumber required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch all rows to find the target
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: `${TAB}!A2:AC5000`,
    });

    const rows = res.data.values || [];
    let targetRowIdx = -1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as string[];
      const rowWoId = (row[COL_IDX.wo_id] || '').trim();
      const rowWoNum = (row[COL_IDX.wo_number] || '').trim();
      if (woId && rowWoId === woId) { targetRowIdx = i; break; }
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

    // Build field updates
    const updates: { col: string; value: string }[] = [];

    const fieldMap: Record<string, string> = {
      status:          'status',
      assignedTo:      'assigned_to',
      description:     'description',
      // ORPHAN cols 16,17,19,20,21 — frozen, do not write
      // scheduledDate (col 17), hoursEstimated (col 19), hoursActual (col 20), men_required (col 21) removed
      // due_date (col 16) never accepted from UI
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
    };

    // Handle stage → status mapping (legacy frontend compat)
    const stageToStatus: Record<string, string> = {
      lead:        'lead',
      quote:       'quote',
      quoted:      'quoted',
      accepted:    'accepted',
      approved:    'approved',
      scheduled:   'scheduled',
      in_progress: 'in_progress',
      closed:      'closed',
      lost:        'lost',
    };

    const requestedStatus = status || (stage ? stageToStatus[stage] : undefined);
    let resolvedStatus = requestedStatus;

    // WO status is derived server-side from Install_Steps + Step_Completions.
    // Manual status values from the client are ignored whenever they conflict with actual step state.
    if (requestedStatus !== 'lost') {
      const rowWoId = (rows[targetRowIdx]?.[COL_IDX.wo_id] || '').trim();
      const rowWoNumber = (rows[targetRowIdx]?.[COL_IDX.wo_number] || '').trim();
      resolvedStatus = await deriveWorkOrderStatus({
        woId: woId || rowWoId,
        woNumber: woNumber || rowWoNumber,
        sheets,
      });
    }

    if (resolvedStatus) {
      updates.push({
        col: colLetter(COL_IDX.status),
        value: resolvedStatus,
      });
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
        else if (NAME_FIELDS.has(bodyKey)) val = normalizeName(val);
        updates.push({
          col: colLetter(COL_IDX[colKey]),
          value: val,
        });
      }
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

    // ─── Acceptance trigger: write bid_hours to Install_Steps ────────────────
    if (requestedStatus === 'approved') {
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

    // If this is a dispatch update (scheduledDate + assignedTo both provided),
    // also write to Dispatch_Schedule for the field crew calendar
    const { scheduledDate, assignedTo } = body;
    const resolvedWoNumber = woNumber || rows[targetRowIdx]?.[COL_IDX.wo_number] || woId;
    const woName = rows[targetRowIdx]?.[COL_IDX.name] || '';
    const woIsland = body.island || rows[targetRowIdx]?.[COL_IDX.island] || '';

    if (scheduledDate && assignedTo) {
      try {
        const fieldSheetId = process.env.FIELD_BACKEND_SHEET_ID;
        if (fieldSheetId) {
          const slotId = `SVC-${resolvedWoNumber}-${scheduledDate}`;
          const menRequired = body.men || '1';
          const displayName = woName || `Service WO ${resolvedWoNumber}`;

          const existing = await sheets.spreadsheets.values.get({
            spreadsheetId: fieldSheetId,
            range: 'Dispatch_Schedule!A2:J5000',
          });
          const existingRows = existing.data.values || [];
          const alreadyExists = existingRows.some(r => r[0] === slotId);

          if (!alreadyExists) {
            await sheets.spreadsheets.values.append({
              spreadsheetId: fieldSheetId,
              range: 'Dispatch_Schedule!A:J',
              valueInputOption: 'RAW',
              requestBody: {
                values: [[
                  slotId, scheduledDate, `SVC-${resolvedWoNumber}`,
                  displayName, woIsland, menRequired,
                  body.hoursEstimated || '', assignedTo,
                  'Joey Ritthaler', 'filled',
                ]],
              },
            });
          } else {
            const rowIndex = existingRows.findIndex(r => r[0] === slotId);
            if (rowIndex >= 0) {
              await sheets.spreadsheets.values.update({
                spreadsheetId: fieldSheetId,
                range: `Dispatch_Schedule!H${rowIndex + 2}:J${rowIndex + 2}`,
                valueInputOption: 'RAW',
                requestBody: { values: [[assignedTo, 'Joey Ritthaler', 'filled']] },
              });
            }
          }
        }
      } catch {
        console.error('[schedule-sync] Failed to write to Dispatch_Schedule');
      }
    }

    // Write-back customer data to Customer DB (fire-and-forget)
    const custName = body.customerName || body.customer_name;
    const custPhone = body.contactPhone || body.contact_phone;
    const custEmail = body.contactEmail || body.contact_email;
    const custPerson = body.contactPerson || body.contact_person;
    const custIsland = body.island;
    const custAddress = body.address;
    if (custName || custPhone || custEmail) {
      fireAndForgetCustomerUpdate({
        name: custName,
        phone: custPhone,
        email: custEmail,
        primaryContact: custPerson,
        island: custIsland,
        address: custAddress,
        source: 'wo_update',
      });
    }

    return NextResponse.json({ ok: true, sheetRow, woId: woId || resolvedWoNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
