import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { hawaiiNow } from '@/lib/hawaii-time';
import { getBackendSheetId } from './backend-config';

const SHEET_ID = getBackendSheetId();
const TAB = 'Field_Events_V1';

// Field_Events_V1 column indices (0-based, A=0)
const COL = {
  event_id:          0,  // A
  target_kID:        1,  // B
  event_type:        2,  // C
  event_occurred_at: 3,  // D
  event_recorded_at: 4,  // E
  performed_by:      5,  // F
  recorded_by:       6,  // G
  source_system:     7,  // H
  notes:             28, // AC
  origin:            34, // AI — BAN-41: moved from AG (AG is affected_count)
};

export type MCEventOrigin = 'office' | 'field' | 'system';

export type MCEventType =
  | 'STATUS_CHANGED'
  | 'STAGE_ROLLED_BACK'
  | 'STAGE_SKIPPED_FORWARD'
  | 'WO_DECLINED'
  | 'VENDOR_QUOTE_ADDED'
  | 'ESTIMATE_SAVED'
  | 'QUOTE_GENERATED'
  | 'WORK_BREAKDOWN_ADDED'
  | 'JOB_FILE_UPLOADED'
  | 'WO_CLOSED'
  | string;

export interface MCEventPayload {
  wo_id: string;
  event_type: MCEventType;
  old_status?: string;
  new_status?: string;
  notes?: string;
  submitted_by?: string;
  origin?: MCEventOrigin;
}

async function appendMCEvent(payload: MCEventPayload): Promise<void> {
  const {
    wo_id, event_type, old_status, new_status,
    notes, submitted_by, origin = 'office',
  } = payload;

  const now = hawaiiNow();
  const eventId = `MC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // 35-element row (A–AI) — blanks for all unused columns
  const row = new Array(35).fill('');
  row[COL.event_id]          = eventId;
  row[COL.target_kID]        = wo_id;
  row[COL.event_type]        = event_type;
  row[COL.event_occurred_at] = now;
  row[COL.event_recorded_at] = now;
  row[COL.performed_by]      = submitted_by || '';
  row[COL.recorded_by]       = submitted_by || '';
  row[COL.source_system]     = 'mission-control';
  row[COL.notes]             = notes || (old_status && new_status ? `${old_status} → ${new_status}` : '');
  row[COL.origin]            = origin;

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

/**
 * Best-effort Mission Control event emitter. Activity Spine writes must never
 * make the user-facing mutation fail; callers can await this for ordering, but
 * emit errors are swallowed after logging.
 */
export async function emitMCEvent(payload: MCEventPayload): Promise<void> {
  try {
    await appendMCEvent(payload);
  } catch (err) {
    console.warn('[emitMCEvent] non-blocking emit failed:', {
      wo_id: payload.wo_id,
      event_type: payload.event_type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
