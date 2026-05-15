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
  entity_type:       8,  // I — BG1 Slice B: entity_type for non-WO emits
  notes:             28, // AC
  rationale:         33, // AH — BG1 Slice B: ADR-038 rationale capture
  origin:            34, // AI — BAN-41: moved from AG (AG is affected_count)
};

export type MCEventOrigin = 'office' | 'field' | 'system';

// Canonical EventType list — single source of truth for what MC may emit.
// BG1 Slice B adds 9 new types (5 emitted this dispatch + 4 declared-but-
// unemitted; the 4 engagement events are emitted from app/api/engagements
// in Dispatch #3 once those routes exist). EVENT_CONFIG render branches +
// TypeFilter UX coverage are explicitly deferred to a later dispatch per
// the BG1 Slice B scope contract.
export type MCEventType =
  // Pre-BG1 service-WO events (unchanged)
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
  // BG1 Slice B (Packet 004 W2) — 9 new EventTypes
  | 'ORG_CREATED'
  | 'ORG_UPDATED'
  | 'ORG_MERGED'
  | 'CONTACT_CREATED'
  | 'SITE_CREATED'
  | 'ENGAGEMENT_CREATED'              // emit deferred to Dispatch #3
  | 'ENGAGEMENT_STATUS_CHANGED'       // emit deferred to Dispatch #3
  | 'ROUTING_DECISION_ASSIGNED'       // emit deferred to Dispatch #3
  | 'PM_HANDOFF_STATE_TRANSITIONED'   // emit deferred to Dispatch #3
  | 'WORK_RECORD_CREATED'
  | 'WORK_RECORD_STATE_CHANGED'
  | 'BID_PROMOTED'
  | 'ESTIMATE_VERSION_FROZEN'
  | 'ESTIMATE_VERSION_ACCEPTED'
  | 'PROPOSAL_VERSION_FROZEN'
  | 'PROPOSAL_VERSION_ACCEPTED'
  | 'PRICING_EVIDENCE_ADDED'
  | string;

// Entity type (Sheets column I). 'work_order' is the implicit legacy default
// for the existing 12 emit sites that pass wo_id without entity_type.
export type MCEventEntityType =
  | 'work_order'
  | 'organization'
  | 'contact'
  | 'site'
  | 'engagement'
  | 'work_record'
  | 'bid'
  | 'estimate'
  | 'proposal'
  | 'pricing_evidence';

export interface MCEventPayload {
  /** Legacy WO emit path. Set wo_id when target entity is a service WO. */
  wo_id?: string;
  /**
   * Generalized entity reference (BG1 Slice B). Used for ORG/CONTACT/SITE/
   * ENGAGEMENT events. Falls back to wo_id for legacy callers so the 12
   * existing emit sites continue to work without changes.
   */
  entity_kid?: string;
  entity_type?: MCEventEntityType;
  event_type: MCEventType;
  old_status?: string;
  new_status?: string;
  notes?: string;
  submitted_by?: string;
  origin?: MCEventOrigin;
  /** ADR-038 rationale — required for routing decisions + state transitions. */
  rationale?: string;
}

async function appendMCEvent(payload: MCEventPayload): Promise<void> {
  const {
    wo_id, entity_kid, entity_type,
    event_type, old_status, new_status,
    notes, submitted_by, origin = 'office', rationale,
  } = payload;

  const targetKid = entity_kid ?? wo_id ?? '';
  const resolvedEntityType: MCEventEntityType = entity_type ?? (wo_id ? 'work_order' : 'work_order');

  const now = hawaiiNow();
  const eventId = `MC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // 35-element row (A–AI) — blanks for all unused columns
  const row = new Array(35).fill('');
  row[COL.event_id]          = eventId;
  row[COL.target_kID]        = targetKid;
  row[COL.event_type]        = event_type;
  row[COL.event_occurred_at] = now;
  row[COL.event_recorded_at] = now;
  row[COL.performed_by]      = submitted_by || '';
  row[COL.recorded_by]       = submitted_by || '';
  row[COL.source_system]     = 'mission-control';
  row[COL.entity_type]       = resolvedEntityType;
  row[COL.notes]             = notes || (old_status && new_status ? `${old_status} → ${new_status}` : '');
  row[COL.rationale]         = rationale || '';
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
 *
 * BG1 Slice B: payload generalized to accept entity_kid + entity_type for non-WO
 * emit sites. Legacy wo_id callers keep working unchanged — wo_id is used as
 * the target_kID fallback when entity_kid is absent.
 *
 * Future Postgres field_events cutover (Packet 005.5 territory): swap this
 * function's Sheets append for a Drizzle insert. Public signature stays stable.
 */
export async function emitMCEvent(payload: MCEventPayload): Promise<void> {
  try {
    await appendMCEvent(payload);
  } catch (err) {
    console.warn('[emitMCEvent] non-blocking emit failed:', {
      wo_id: payload.wo_id,
      entity_kid: payload.entity_kid,
      entity_type: payload.entity_type,
      event_type: payload.event_type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
