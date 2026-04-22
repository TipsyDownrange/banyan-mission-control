export const EVENT_TYPE_LABELS: Record<string, string> = {
  DAILY_LOG:         'Daily Report',
  FIELD_ISSUE:       'Field Issue',
  TM_CAPTURE:        'T&M Ticket',
  FIELD_MEASUREMENT: 'Field Measurement',
  INSTALL_STEP:      'Install Step',
  PHOTO_ONLY:        'Standalone Photo',
  PUNCH_LIST:        'Punch List Item',
};

export interface PhotoAttribution {
  parent_event_id?:    string;
  parent_event_type?:  string;
  submitted_by_user_id?: string;
  submitted_by_name?:  string;
  submitted_at?:       string;
  target_kID?:         string;
  location_group?:     string;
  unit_reference?:     string;
}

export interface PhotoEntry {
  drive_file_id: string;
  filename:      string;
  attribution?:  PhotoAttribution;
}

function fmtHST(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
      month: 'short', day: 'numeric', year: 'numeric',
      timeZone: 'Pacific/Honolulu',
    }) + ' HST';
  } catch { return iso; }
}

export function formatAttributionCaption(attribution: PhotoAttribution | null | undefined): string {
  if (!attribution) return 'Attribution unavailable (pre-WT-018 upload)';
  const eventLabel = EVENT_TYPE_LABELS[attribution.parent_event_type || ''] || attribution.parent_event_type || 'Event';
  const time  = attribution.submitted_at ? fmtHST(attribution.submitted_at) : '—';
  const scope = [attribution.location_group, attribution.unit_reference].filter(Boolean).join(', ') || '—';
  const by    = attribution.submitted_by_name || attribution.submitted_by_user_id || '—';
  return `Attached to: ${eventLabel} at ${time} on ${scope} by ${by}`;
}
