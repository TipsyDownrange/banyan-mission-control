import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { hawaiiNow } from '@/lib/hawaii-time';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
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

export interface MCEventPayload {
  wo_id: string;
  event_type: 'WO_DECLINED' | 'STATUS_CHANGED' | 'WO_CLOSED' | string;
  old_status?: string;
  new_status?: string;
  notes?: string;
  submitted_by?: string;
  origin?: 'office' | 'field' | 'system';
}

export async function emitMCEvent(payload: MCEventPayload): Promise<void> {
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
