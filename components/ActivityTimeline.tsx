'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { formatAttributionCaption, type PhotoEntry } from '@/lib/photo-attribution';
import {
  Activity,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  GitMerge,
  Handshake,
  MapPin,
  RefreshCcw,
  Repeat2,
  Rocket,
  Route,
  Snowflake,
  Tags,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from '@/components/design-system';

// ─── Types ────────────────────────────────────────────────────

type LightboxPhoto = {
  fileId:   string;
  filename: string;
  caption:  string;
};

type FieldEvent = {
  event_id: string;
  target_kID: string;
  event_type: string;
  event_occurred_at: string;
  event_recorded_at: string;
  performed_by: string;
  recorded_by: string;
  source_system: string;
  evidence_ref: string;
  evidence_type: string;
  location_group: string;
  unit_reference: string;
  qa_step_code: string;
  qa_status: string;
  issue_category: string;
  severity: string;
  blocking_flag: string;
  assigned_to: string;
  assigned_role: string;
  responsible_party: string;
  auto_flag: string;
  manpower_count: string;
  work_performed: string;
  delays_blockers: string;
  materials_received: string;
  inspections_visitors: string;
  weather_context: string;
  notes: string;
  environment: string;
  source_version: string;
  is_valid: string;
  issue_status: string;
  affected_count: string;
  hours_lost: string;
  field_issue_pdf_ref?: string;
};

// ─── Config ───────────────────────────────────────────────────

export const ACTIVITY_TIMELINE_V1_EVENT_TYPES = [
  // Field App / shared v1 event types
  'INSTALL_STEP',
  'FIELD_ISSUE',
  'DAILY_LOG',
  'FIELD_MEASUREMENT',
  'PHOTO_ONLY',
  'NOTE',
  'TM_CAPTURE',
  'PUNCH_LIST',
  'SITE_VISIT',
  'TESTING',
  'WARRANTY_CALLBACK',
  // Mission Control Packet 004 event types
  'STATUS_CHANGED',
  'STAGE_ROLLED_BACK',
  'STAGE_SKIPPED_FORWARD',
  'WO_DECLINED',
  'VENDOR_QUOTE_ADDED',
  'ESTIMATE_SAVED',
  'QUOTE_GENERATED',
  'WORK_BREAKDOWN_ADDED',
  'JOB_FILE_UPLOADED',
] as const;

export const ACTIVITY_TIMELINE_BG1_APP_EVENT_TYPES = [
  'ORG_CREATED',
  'ORG_UPDATED',
  'ORG_MERGED',
  'CONTACT_CREATED',
  'SITE_CREATED',
  'ENGAGEMENT_CREATED',
  'ENGAGEMENT_STATUS_CHANGED',
  'ROUTING_DECISION_ASSIGNED',
  'PM_HANDOFF_STATE_TRANSITIONED',
  'WORK_RECORD_CREATED',
  'WORK_RECORD_STATE_CHANGED',
  'BID_PROMOTED',
  'ESTIMATE_VERSION_FROZEN',
  'ESTIMATE_VERSION_ACCEPTED',
  'PROPOSAL_VERSION_FROZEN',
  'PROPOSAL_VERSION_ACCEPTED',
  'PRICING_EVIDENCE_ADDED',
] as const;

export const ACTIVITY_TIMELINE_FUTURE_EVENT_TYPES = [
  'MASTER_LIBRARY_ENTRY_RETIRED',
  'MASTER_LIBRARY_TOGGLE_CHANGED',
] as const;

type ActivityTimelineEventType =
  | typeof ACTIVITY_TIMELINE_V1_EVENT_TYPES[number]
  | typeof ACTIVITY_TIMELINE_BG1_APP_EVENT_TYPES[number]
  | typeof ACTIVITY_TIMELINE_FUTURE_EVENT_TYPES[number]
  | 'EMAIL_SENT'
  | 'QA_COMPLETE'
  | 'CREW_DEMOBILIZED'
  | 'WO_CLOSED';

type ActivityEventRenderBranchProps = {
  event: FieldEvent;
  description: string | null;
};

function Bg1RenderBranch({ event, description }: ActivityEventRenderBranchProps): React.ReactElement {
  const summary = description || event.notes || 'No additional event detail recorded.';
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, color: '#334155', lineHeight: 1.5 }}>
      {summary}
    </div>
  );
}

export const IdentityEventBranch = Bg1RenderBranch;
export const EngagementEventBranch = Bg1RenderBranch;
export const WorkRecordEventBranch = Bg1RenderBranch;

type EventDomainGroup = 'Identity' | 'Engagement' | 'Work Record' | 'Service WO' | 'Field';
type EventOrigin = 'field' | 'office' | 'system';
type EventConfig = {
  icon: string | LucideIcon;
  color: string;
  bg: string;
  label: string;
  display_label?: string;
  color_token?: string;
  domain_group?: EventDomainGroup;
  default_origin?: EventOrigin;
  render_branch?: React.ComponentType<ActivityEventRenderBranchProps>;
};

export const EVENT_CONFIG: Record<string, EventConfig> = {
  INSTALL_STEP:      { icon: '✅', color: '#1d4ed8', bg: 'rgba(29,78,216,0.08)',  label: 'Step Complete' },
  FIELD_ISSUE:       { icon: '🚨', color: '#dc2626', bg: 'rgba(220,38,38,0.08)',  label: 'Issue' },
  DAILY_LOG:         { icon: '📋', color: '#15803d', bg: 'rgba(21,128,61,0.08)',  label: 'Daily Report' },
  FIELD_MEASUREMENT: { icon: '📏', color: '#0891b2', bg: 'rgba(8,145,178,0.08)', label: 'Measurement' },
  PHOTO_ONLY:        { icon: '📸', color: 'var(--bos-color-ink-disabled)', bg: 'rgba(100,116,139,0.08)', label: 'Photo' },
  NOTE:              { icon: '📝', color: 'var(--bos-color-ink-disabled)', bg: 'rgba(100,116,139,0.08)', label: 'Note' },
  TM_CAPTURE:        { icon: '⏱️', color: '#92400e', bg: 'rgba(146,64,14,0.08)', label: 'T&M' },
  PUNCH_LIST:        { icon: '🔧', color: '#d97706', bg: 'rgba(217,119,6,0.08)', label: 'Punch List' },
  SITE_VISIT:        { icon: '👁️', color: '#0369a1', bg: 'rgba(3,105,161,0.08)', label: 'Site Visit' },
  TESTING:           { icon: '🧪', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: 'Test' },
  WARRANTY_CALLBACK: { icon: '🔁', color: '#0f766e', bg: 'rgba(15,118,110,0.08)', label: 'Warranty' },
  STATUS_CHANGED:        { icon: '🔄', color: '#2563eb', bg: 'rgba(37,99,235,0.08)', label: 'Status Changed' },
  STAGE_ROLLED_BACK:     { icon: '↩️', color: '#b45309', bg: 'rgba(180,83,9,0.08)', label: 'Stage Rolled Back' },
  STAGE_SKIPPED_FORWARD: { icon: '⏩', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: 'Stage Skipped Forward' },
  WO_DECLINED:           { icon: '🚫', color: '#be123c', bg: 'rgba(190,18,60,0.08)', label: 'WO Declined' },
  VENDOR_QUOTE_ADDED:    { icon: '🏷️', color: '#0e7490', bg: 'rgba(14,116,144,0.08)', label: 'Vendor Quote' },
  ESTIMATE_SAVED:        { icon: '💾', color: '#047857', bg: 'rgba(4,120,87,0.08)', label: 'Estimate Saved' },
  QUOTE_GENERATED:       { icon: '📄', color: '#0369a1', bg: 'rgba(3,105,161,0.08)', label: 'Quote Generated' },
  WORK_BREAKDOWN_ADDED:  { icon: '🧱', color: '#4f46e5', bg: 'rgba(79,70,229,0.08)', label: 'Work Breakdown' },
  JOB_FILE_UPLOADED:     { icon: '📎', color: '#475569', bg: 'rgba(71,85,105,0.08)', label: 'Job File Uploaded' },
  ORG_CREATED:           { icon: Building2, color: '#0f766e', bg: 'rgba(15,118,110,0.08)', label: 'Org Created', display_label: 'Org Created', color_token: 'teal', domain_group: 'Identity', render_branch: IdentityEventBranch, default_origin: 'office' },
  ORG_UPDATED:           { icon: RefreshCcw, color: '#0e7490', bg: 'rgba(14,116,144,0.08)', label: 'Org Updated', display_label: 'Org Updated', color_token: 'cyan', domain_group: 'Identity', render_branch: IdentityEventBranch, default_origin: 'office' },
  ORG_MERGED:            { icon: GitMerge, color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: 'Org Merged', display_label: 'Org Merged', color_token: 'violet', domain_group: 'Identity', render_branch: IdentityEventBranch, default_origin: 'office' },
  CONTACT_CREATED:       { icon: UserPlus, color: '#0369a1', bg: 'rgba(3,105,161,0.08)', label: 'Contact Created', display_label: 'Contact Created', color_token: 'sky', domain_group: 'Identity', render_branch: IdentityEventBranch, default_origin: 'office' },
  SITE_CREATED:          { icon: MapPin, color: '#2563eb', bg: 'rgba(37,99,235,0.08)', label: 'Address Created', display_label: 'Address Created', color_token: 'blue', domain_group: 'Identity', render_branch: IdentityEventBranch, default_origin: 'office' },
  ENGAGEMENT_CREATED:    { icon: Handshake, color: '#0f766e', bg: 'rgba(15,118,110,0.08)', label: 'Engagement Created', display_label: 'Engagement Created', color_token: 'teal', domain_group: 'Engagement', render_branch: EngagementEventBranch, default_origin: 'office' },
  ENGAGEMENT_STATUS_CHANGED: { icon: Activity, color: '#2563eb', bg: 'rgba(37,99,235,0.08)', label: 'Engagement Status', display_label: 'Engagement Status Changed', color_token: 'blue', domain_group: 'Engagement', render_branch: EngagementEventBranch, default_origin: 'office' },
  ROUTING_DECISION_ASSIGNED: { icon: Route, color: '#b45309', bg: 'rgba(180,83,9,0.08)', label: 'Routing Decision', display_label: 'Routing Decision Assigned', color_token: 'amber', domain_group: 'Engagement', render_branch: EngagementEventBranch, default_origin: 'office' },
  PM_HANDOFF_STATE_TRANSITIONED: { icon: ClipboardCheck, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)', label: 'PM Handoff', display_label: 'PM Handoff State Transitioned', color_token: 'indigo', domain_group: 'Engagement', render_branch: EngagementEventBranch, default_origin: 'office' },
  WORK_RECORD_CREATED:   { icon: FileCheck2, color: '#0f766e', bg: 'rgba(15,118,110,0.08)', label: 'Work Record Created', display_label: 'Work Record Created', color_token: 'teal', domain_group: 'Work Record', render_branch: WorkRecordEventBranch, default_origin: 'system' },
  WORK_RECORD_STATE_CHANGED: { icon: Repeat2, color: '#2563eb', bg: 'rgba(37,99,235,0.08)', label: 'Work State Changed', display_label: 'Work Record State Changed', color_token: 'blue', domain_group: 'Work Record', render_branch: WorkRecordEventBranch, default_origin: 'system' },
  BID_PROMOTED:          { icon: Rocket, color: '#15803d', bg: 'rgba(21,128,61,0.08)', label: 'Bid Promoted', display_label: 'Bid Promoted', color_token: 'green', domain_group: 'Work Record', render_branch: WorkRecordEventBranch, default_origin: 'office' },
  ESTIMATE_VERSION_FROZEN: { icon: Snowflake, color: '#0369a1', bg: 'rgba(3,105,161,0.08)', label: 'Estimate Frozen', display_label: 'Estimate Version Frozen', color_token: 'sky', domain_group: 'Work Record', render_branch: WorkRecordEventBranch, default_origin: 'office' },
  ESTIMATE_VERSION_ACCEPTED: { icon: CheckCircle2, color: '#15803d', bg: 'rgba(21,128,61,0.08)', label: 'Estimate Accepted', display_label: 'Estimate Version Accepted', color_token: 'green', domain_group: 'Work Record', render_branch: WorkRecordEventBranch, default_origin: 'office' },
  PROPOSAL_VERSION_FROZEN: { icon: Snowflake, color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: 'Proposal Frozen', display_label: 'Proposal Version Frozen', color_token: 'violet', domain_group: 'Work Record', render_branch: WorkRecordEventBranch, default_origin: 'office' },
  PROPOSAL_VERSION_ACCEPTED: { icon: CheckCircle2, color: '#15803d', bg: 'rgba(21,128,61,0.08)', label: 'Proposal Accepted', display_label: 'Proposal Version Accepted', color_token: 'green', domain_group: 'Work Record', render_branch: WorkRecordEventBranch, default_origin: 'office' },
  PRICING_EVIDENCE_ADDED: { icon: Tags, color: '#0e7490', bg: 'rgba(14,116,144,0.08)', label: 'Pricing Evidence', display_label: 'Pricing Evidence Added', color_token: 'cyan', domain_group: 'Work Record', render_branch: WorkRecordEventBranch, default_origin: 'office' },
  MASTER_LIBRARY_ENTRY_RETIRED: { icon: '🗄️', color: 'var(--bos-color-ink-disabled)', bg: 'rgba(100,116,139,0.08)', label: 'Master Library Retired' },
  MASTER_LIBRARY_TOGGLE_CHANGED: { icon: '🎛️', color: 'var(--bos-color-ink-disabled)', bg: 'rgba(100,116,139,0.08)', label: 'Master Library Toggle' },
  EMAIL_SENT:        { icon: '📧', color: '#059669', bg: 'rgba(5,150,105,0.08)',   label: 'Email Sent' },
  QA_COMPLETE:       { icon: '🔍', color: '#7e22ce', bg: 'rgba(126,34,206,0.08)', label: 'QA Check' },
  CREW_DEMOBILIZED:  { icon: '🚛', color: '#b91c1c', bg: 'rgba(185,28,28,0.08)', label: 'Crew Demobilized' },
  WO_CLOSED:         { icon: '🔒', color: '#334155', bg: 'rgba(51,65,85,0.08)', label: 'WO Closed' },
};

export const ACTIVITY_TIMELINE_TYPE_GROUPS: { label: string; pills: { key: TypeFilter; label: string }[] }[] = [
  { label: 'Identity', pills: [
    { key: 'ORG_CREATED', label: 'Org Created' },
    { key: 'ORG_UPDATED', label: 'Org Updated' },
    { key: 'ORG_MERGED', label: 'Org Merged' },
    { key: 'CONTACT_CREATED', label: 'Contact' },
    { key: 'SITE_CREATED', label: 'Address' },
  ] },
  { label: 'Engagement', pills: [
    { key: 'ENGAGEMENT_CREATED', label: 'Created' },
    { key: 'ENGAGEMENT_STATUS_CHANGED', label: 'Status' },
    { key: 'ROUTING_DECISION_ASSIGNED', label: 'Routing' },
    { key: 'PM_HANDOFF_STATE_TRANSITIONED', label: 'PM Handoff' },
  ] },
  { label: 'Work Record', pills: [
    { key: 'WORK_RECORD_CREATED', label: 'Created' },
    { key: 'WORK_RECORD_STATE_CHANGED', label: 'State' },
    { key: 'BID_PROMOTED', label: 'Bid Promoted' },
    { key: 'ESTIMATE_VERSION_FROZEN', label: 'Estimate Frozen' },
    { key: 'ESTIMATE_VERSION_ACCEPTED', label: 'Estimate Accepted' },
    { key: 'PROPOSAL_VERSION_FROZEN', label: 'Proposal Frozen' },
    { key: 'PROPOSAL_VERSION_ACCEPTED', label: 'Proposal Accepted' },
    { key: 'PRICING_EVIDENCE_ADDED', label: 'Pricing Evidence' },
  ] },
  { label: 'Field', pills: [
    { key: 'INSTALL_STEP', label: 'QA Step' },
    { key: 'FIELD_ISSUE', label: 'Issue' },
    { key: 'DAILY_LOG', label: 'Daily Report' },
    { key: 'FIELD_MEASUREMENT', label: 'Measurement' },
    { key: 'PHOTO_ONLY', label: 'Photo' },
    { key: 'NOTE', label: 'Note' },
    { key: 'TM_CAPTURE', label: 'T&M' },
    { key: 'PUNCH_LIST', label: 'Punch List' },
    { key: 'SITE_VISIT', label: 'Site Visit' },
    { key: 'TESTING', label: 'Test' },
    { key: 'WARRANTY_CALLBACK', label: 'Warranty' },
    { key: 'QA_COMPLETE', label: 'QA' },
    { key: 'CREW_DEMOBILIZED', label: 'Crew Demob' },
  ] },
  { label: 'Service WO', pills: [
    { key: 'STATUS_CHANGED', label: 'Status' },
    { key: 'STAGE_ROLLED_BACK', label: 'Rollback' },
    { key: 'STAGE_SKIPPED_FORWARD', label: 'Skip Forward' },
    { key: 'WO_DECLINED', label: 'Declined' },
    { key: 'VENDOR_QUOTE_ADDED', label: 'Vendor Quote' },
    { key: 'ESTIMATE_SAVED', label: 'Estimate' },
    { key: 'QUOTE_GENERATED', label: 'Quote' },
    { key: 'WORK_BREAKDOWN_ADDED', label: 'WBS' },
    { key: 'JOB_FILE_UPLOADED', label: 'File' },
    { key: 'EMAIL_SENT', label: 'Emails' },
    { key: 'WO_CLOSED', label: 'Closed' },
  ] },
  { label: 'Future', pills: [
    { key: 'MASTER_LIBRARY_ENTRY_RETIRED', label: 'ML Retired' },
    { key: 'MASTER_LIBRARY_TOGGLE_CHANGED', label: 'ML Toggle' },
  ] },
  // Back-compat marker for BAN-214 tests; Service WO is the BG1 domain label.
  { label: 'Mission Control', pills: [] },
];


const ISSUE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  OPEN:     { label: 'Open',     color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
  RESOLVED: { label: 'Resolved', color: '#15803d', bg: 'rgba(21,128,61,0.1)' },
  CLOSED:   { label: 'Closed',   color: 'var(--bos-color-ink-disabled)', bg: 'rgba(100,116,139,0.1)' },
};

type TypeFilter = 'ALL' | ActivityTimelineEventType;
type DateFilter = 'today' | '7d' | '30d' | 'all';

type NoteFilePayload = {
  fileName: string;
  mimeType?: string;
  destinationSubfolder?: string;
  driveUrl?: string;
};

// ─── Helpers ──────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[d.getDay()];
    const monthName = months[d.getMonth()];
    const date = d.getDate();
    let hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${dayName} ${monthName} ${date} · ${hours}:${mins} ${ampm}`;
  } catch {
    return iso;
  }
}

function isTmSubmittedMetaEvent(event: FieldEvent): boolean {
  if (event.event_type !== 'TM_CAPTURE') return false;
  try {
    const parsed = JSON.parse(event.notes || '{}') as { meta_event?: unknown };
    return parsed.meta_event === 'TM_SUBMITTED';
  } catch {
    return false;
  }
}

function getDateBoundary(filter: DateFilter): string | null {
  if (filter === 'all') return null;
  const now = new Date();
  if (filter === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  const days = filter === '7d' ? 7 : 30;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

function parseNoteFilePayload(notes: string): NoteFilePayload | null {
  try {
    const parsed = JSON.parse(notes || '');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const payload = parsed as Record<string, unknown>;
    if (typeof payload.file_name !== 'string') {
      return null;
    }
    const fileName = payload.file_name.trim();
    if (!fileName) return null;
    if ('drive_url' in payload && typeof payload.drive_url !== 'string') return null;
    return {
      fileName,
      mimeType: typeof payload.mime_type === 'string' ? payload.mime_type.trim() : undefined,
      destinationSubfolder: typeof payload.destination_subfolder === 'string'
        ? payload.destination_subfolder.trim()
        : undefined,
      driveUrl: typeof payload.drive_url === 'string' ? payload.drive_url.trim() : undefined,
    };
  } catch {
    return null;
  }
}

function safeExternalHref(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function driveFileHref(fileId: string | undefined): string | null {
  const trimmed = fileId?.trim();
  if (!trimmed || !/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return `https://drive.google.com/file/d/${trimmed}/view`;
}

function iconForMimeType(mimeType: string | undefined): string {
  if (!mimeType) return '📎';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType.includes('sheet')) return '📊';
  return '📎';
}

function NoteFileChip({ payload }: { payload: NoteFilePayload }) {
  const href = safeExternalHref(payload.driveUrl);
  const content = (
    <>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{iconForMimeType(payload.mimeType)}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {payload.fileName}
        </span>
        {payload.destinationSubfolder && (
          <span style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', fontWeight: 700 }}>
            → {payload.destinationSubfolder}
          </span>
        )}
      </span>
    </>
  );
  const sharedStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 460,
    padding: '7px 10px',
    borderRadius: 8,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    color: href ? '#0369a1' : '#334155',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
  };

  if (!href) {
    return <div style={sharedStyle}>{content}</div>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      style={sharedStyle}
    >
      {content}
    </a>
  );
}

// ─── Event Card ───────────────────────────────────────────────

export function EventCard({ event, onResolved, userMap }: { event: FieldEvent; onResolved: (id: string) => void; userMap: UserMap }) {
  // Resolve user ID to display name
  const resolveUser = (raw: string) => {
    if (!raw) return '';
    return userMap[raw] || userMap[raw.toLowerCase()] || raw;
  };
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [pdfState, setPdfState] = useState<'idle'|'generating'|'done'|'error'>('idle');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Build lightbox photo array: prefer Lane A notes JSON shape, fall back to evidence_ref
  const lightboxPhotos: LightboxPhoto[] = (() => {
    try {
      const parsed = JSON.parse(event.notes || '{}');
      const photos = parsed.photos as PhotoEntry[] | undefined;
      if (Array.isArray(photos) && photos.length > 0 && photos[0]?.drive_file_id) {
        return photos.map(p => ({
          fileId:   p.drive_file_id,
          filename: p.filename,
          caption:  formatAttributionCaption(p.attribution),
        }));
      }
    } catch { /* not JSON — fall through */ }
    if (!event.evidence_ref) return [];
    return event.evidence_ref.split(',').map(s => s.trim()).filter(Boolean).map(id => ({
      fileId:   id,
      filename: `photo_${id.slice(0, 8)}.jpg`,
      caption:  'Attribution unavailable (pre-WT-018 upload)',
    }));
  })();

  // DRIFT-MC-024: NOTE events with [CREW_DEMOBILIZED] prefix are legacy demob events
  // emitted before the field app sent the correct event_type.
  const effectiveEventType = (event.event_type === 'NOTE' && event.notes?.startsWith('[CREW_DEMOBILIZED]'))
    ? 'CREW_DEMOBILIZED'
    : event.event_type;
  const cfg = EVENT_CONFIG[effectiveEventType] || EVENT_CONFIG.NOTE;

  // For FIELD_ISSUE resolved state — use orange badge
  const isIssueResolved = event.event_type === 'FIELD_ISSUE' && event.issue_status === 'RESOLVED';
  const iconColor = isIssueResolved ? '#d97706' : cfg.color;
  const iconBg = isIssueResolved ? 'rgba(217,119,6,0.1)' : cfg.bg;
  const IconComponent = typeof cfg.icon === 'string' ? null : cfg.icon;
  const iconText = typeof cfg.icon === 'string' ? cfg.icon : null;
  const RenderBranch = cfg.render_branch;

  // For FIELD_MEASUREMENT: show a one-line summary from parsed JSON; hide raw JSON
  let measureSummary: string | null = null;
  if (event.event_type === 'FIELD_MEASUREMENT') {
    try {
      const p = JSON.parse(event.notes);
      const f = (p.fields || {}) as Record<string, string>;
      const dim = [f.width && `${f.width}"W`, f.height && `${f.height}"H`, f.depth && `${f.depth}"D`].filter(Boolean).join(' × ');
      const parts = [p.system_type, dim, p.capture_tool].filter(Boolean);
      measureSummary = parts.join(' · ');
    } catch { measureSummary = null; }
  }
  let punchPreview: string | null = null;
  if (event.event_type === 'PUNCH_LIST') {
    try {
      const p = JSON.parse(event.notes);
      if (p.description) {
        const d = String(p.description);
        punchPreview = `Punch: ${d.length > 60 ? d.slice(0, 60) + '…' : d}`;
      }
    } catch {}
  }
  let tmPreview: string | null = null;
  if (event.event_type === 'TM_CAPTURE') {
    try {
      const p = JSON.parse(event.notes);
      const parts = [p.crew != null ? `${p.crew} crew` : null, p.hours_estimated ? `${p.hours_estimated}h` : null].filter(Boolean);
      if (parts.length) tmPreview = `T&M: ${parts.join(', ')}`;
    } catch {}
  }
  let emailSentPreview: string | null = null;
  if (event.event_type === 'EMAIL_SENT') {
    try {
      const p = JSON.parse(event.notes);
      if (p.subject) emailSentPreview = String(p.subject);
    } catch {}
  }
  let dailyLogPreview: string | null = null;
  if (event.event_type === 'DAILY_LOG') {
    const directWork = event.work_performed.trim();
    if (directWork) {
      dailyLogPreview = directWork;
    } else {
      try {
        const p = JSON.parse(event.notes);
        const parsedWork = typeof p.work_performed === 'string' ? p.work_performed.trim() : '';
        if (parsedWork) {
          dailyLogPreview = parsedWork.length > 120 ? parsedWork.slice(0, 119) + '…' : parsedWork;
        } else if (typeof p.crew_on_site === 'string' && p.crew_on_site.trim()) {
          const firstLine = typeof p.user_notes === 'string'
            ? p.user_notes.split(/\r?\n/).map((line: string) => line.trim()).find(Boolean) || ''
            : '';
          dailyLogPreview = firstLine
            ? `${p.crew_on_site.trim()} crew — ${firstLine}`
            : `${p.crew_on_site.trim()} crew`;
        } else {
          dailyLogPreview = 'Daily Report';
        }
      } catch {
        dailyLogPreview = 'Daily Report';
      }
    }
  }
  let qaPreview: string | null = null;
  if (event.event_type === 'QA_COMPLETE') {
    try {
      const p = JSON.parse(event.notes);
      const s = typeof p.qa_status === 'string' ? p.qa_status.toUpperCase() : (event.qa_status?.toUpperCase() || 'PASS');
      qaPreview = `QA ${s} — tap to expand`;
    } catch { qaPreview = event.qa_status ? `QA ${event.qa_status.toUpperCase()}` : 'QA Check — tap to expand'; }
  }
  let demobPreview: string | null = null;
  if (effectiveEventType === 'CREW_DEMOBILIZED') {
    const raw = event.notes || '';
    const stripped = raw.startsWith('[CREW_DEMOBILIZED]') ? raw.slice(18).trimStart() : raw;
    const firstLine = stripped.split('\n')[0].trim();
    demobPreview = firstLine || 'Crew demobilized from site';
  }
  const noteFilePayload = effectiveEventType !== 'CREW_DEMOBILIZED'
    ? parseNoteFilePayload(event.notes)
    : null;
  const description = event.event_type === 'DAILY_LOG'
    ? dailyLogPreview
    : event.event_type === 'FIELD_MEASUREMENT'
      ? (measureSummary ?? 'Measurement data — tap to expand') // summary line; hidden when expanded below
    : event.event_type === 'PUNCH_LIST'
      ? (punchPreview ?? event.notes)
    : event.event_type === 'TM_CAPTURE'
      ? (tmPreview ?? event.notes)
  : event.event_type === 'EMAIL_SENT'
      ? (emailSentPreview ?? event.notes)
  : event.event_type === 'QA_COMPLETE'
      ? (qaPreview ?? 'QA Check — tap to expand') // hidden when expanded; structured block takes over
  : effectiveEventType === 'CREW_DEMOBILIZED'
      ? (demobPreview ?? 'Crew demobilized from site')
  : noteFilePayload
      ? null
      : event.notes;

  const locationPill = [event.location_group, event.unit_reference].filter(Boolean).join(' · ');

  const issueStatus = ISSUE_STATUS_CONFIG[event.issue_status] || null;
  const hasFieldIssuePdfRef = event.event_type === 'FIELD_ISSUE'
    ? Boolean(event.field_issue_pdf_ref?.trim())
    : false;
  const fieldIssuePdfHref = event.event_type === 'FIELD_ISSUE'
    ? driveFileHref(event.field_issue_pdf_ref)
    : null;
  const showFieldIssueGeneratePdf = event.event_type === 'FIELD_ISSUE' && !hasFieldIssuePdfRef;
  const showDailyLogPdf = event.event_type === 'DAILY_LOG';
  const showPdfGenerationAction = showFieldIssueGeneratePdf || showDailyLogPdf;

  async function handleResolve() {
    if (resolving) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/events/${event.event_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_status: 'RESOLVED' }),
      });
      if (res.ok) {
        onResolved(event.event_id);
      }
    } finally {
      setResolving(false);
    }
  }

  function handleNestedToggle(e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded(value => !value);
  }

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: expanded ? '#fafafa' : 'white',
        borderRadius: 14,
        border: `1.5px solid ${expanded ? iconColor + '44' : iconColor + '22'}`,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: 'pointer',
    }}>
      {/* Top row: icon badge + meta */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Icon badge */}
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, border: `1px solid ${iconColor}22`,
        }}>
          {IconComponent ? <IconComponent size={18} strokeWidth={2.4} color={iconColor} /> : iconText}
        </div>

        {/* Meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
              color: iconColor, background: iconBg,
              padding: '2px 8px', borderRadius: 999, border: `1px solid ${iconColor}22`,
            }}>
              {cfg.label}
            </span>

            {/* Issue status badge */}
            {event.event_type === 'FIELD_ISSUE' && issueStatus && (
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: issueStatus.color, background: issueStatus.bg,
                padding: '2px 8px', borderRadius: 999, border: `1px solid ${issueStatus.color}33`,
              }}>
                {issueStatus.label}
              </span>
            )}

            {/* Location pill */}
            {locationPill && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: 'var(--bos-color-ink-disabled)',
                background: '#f1f5f9', padding: '2px 8px', borderRadius: 999,
                border: '1px solid #e2e8f0',
              }}>
                📍 {locationPill}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', fontWeight: 600 }}>
              {formatTimestamp(event.event_occurred_at)}
            </span>
            {event.performed_by && (
              <>
                <span style={{ fontSize: 10, color: '#cbd5e1' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>
                  {resolveUser(event.performed_by)}
                </span>
              </>
            )}
          </div>
        </div>

        {fieldIssuePdfHref && (
          <a
            href={fieldIssuePdfHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(3,105,161,0.22)',
              background: '#f0f9ff',
              color: '#0369a1',
              fontSize: 11,
              fontWeight: 800,
              textDecoration: 'none',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            View PDF
          </a>
        )}

        {/* PDF generation button — FIELD_ISSUE only when no stored PDF exists; DAILY_LOG unchanged */}
        {showPdfGenerationAction && (
          <button
            title={showFieldIssueGeneratePdf ? 'Generate PDF' : 'Regenerate PDF'}
            onClick={async e => {
              e.stopPropagation();
              if (pdfState === 'generating') return;
              setPdfState('generating');
              try {
                const isIssue = event.event_type === 'FIELD_ISSUE';
                const url = isIssue
                  ? '/api/field-issue/pdf'
                  : '/api/daily-report/pdf?json=true';
                const body = isIssue
                  ? { event_id: event.event_id }
                  : { kid: event.target_kID, event_id: event.event_id, store_to_drive: true };
                const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (res.ok) {
                  setPdfState('done');
                  setTimeout(() => setPdfState('idle'), 2000);
                } else {
                  setPdfState('error');
                  setTimeout(() => setPdfState('idle'), 3000);
                }
              } catch { setPdfState('error'); setTimeout(() => setPdfState('idle'), 3000); }
            }}
            style={{
              height: 28,
              width: showFieldIssueGeneratePdf ? 'auto' : 28,
              padding: showFieldIssueGeneratePdf ? '0 10px' : 0,
              borderRadius: 7, border: '1px solid #e2e8f0', background: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: pdfState==='generating'?'default':'pointer',
              fontSize: 13, flexShrink: 0, color: pdfState==='done' ? '#15803d' : pdfState==='error' ? '#dc2626' : 'var(--bos-color-ink-disabled)',
              fontWeight: showFieldIssueGeneratePdf ? 800 : undefined,
              whiteSpace: 'nowrap',
            }}>
            {showFieldIssueGeneratePdf
              ? pdfState === 'generating' ? 'Generating...'
                : pdfState === 'done' ? 'PDF generated'
                : pdfState === 'error' ? 'PDF failed'
                : 'Generate PDF'
              : pdfState === 'generating' ? <span style={{ fontSize:10, animation:'spin 0.8s linear infinite', display:'inline-block' }}>⟳</span>
                : pdfState === 'done' ? '✓'
                : pdfState === 'error' ? '✗'
                : <span style={{ fontSize:9, fontWeight:700 }}>📄 PDF</span>}
          </button>
        )}

        {/* Resolve button for open issues */}
        {event.event_type === 'FIELD_ISSUE' && event.issue_status === 'OPEN' && (
          <button
            onClick={handleResolve}
            disabled={resolving}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 800,
              background: resolving ? '#f1f5f9' : 'rgba(21,128,61,0.1)',
              color: resolving ? 'var(--bos-color-ink-tertiary)' : '#15803d',
              border: '1px solid rgba(21,128,61,0.2)',
              cursor: resolving ? 'default' : 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}>
            {resolving ? '…' : '✓ Resolve'}
          </button>
        )}
      </div>

      {/* Description */}
      {/* Hide description for FIELD_MEASUREMENT and QA_COMPLETE when expanded — structured blocks take over */}
      {noteFilePayload && (
        <NoteFileChip payload={noteFilePayload} />
      )}
      {description && !(expanded && event.event_type === 'FIELD_MEASUREMENT' && measureSummary !== null) && !(expanded && event.event_type === 'QA_COMPLETE') && (
        <div>
          <div
            onClick={handleNestedToggle}
            style={{
              fontSize: 13, color: '#334155', lineHeight: 1.5,
              cursor: description.length > 120 ? 'pointer' : 'default',
              display: '-webkit-box',
              WebkitLineClamp: expanded ? 'unset' : 2,
              WebkitBoxOrient: 'vertical',
              overflow: expanded ? 'visible' : 'hidden',
            } as React.CSSProperties}
          >
            {description}
          </div>
          {description.length > 120 && (
            <button
              onClick={handleNestedToggle}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 700, color: '#0369a1', cursor: 'pointer', marginTop: 2 }}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {expanded && RenderBranch && ACTIVITY_TIMELINE_BG1_APP_EVENT_TYPES.includes(effectiveEventType as typeof ACTIVITY_TIMELINE_BG1_APP_EVENT_TYPES[number]) && (
        <RenderBranch event={event} description={description} />
      )}

      {/* Structured expansion per event type */}
      {expanded && !RenderBranch && (() => {
        const kv = (label: string, value: string | undefined, badge?: string): React.ReactElement | null => value ? (
          <div key={label} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--bos-color-ink-tertiary)', fontWeight: 600, minWidth: 110 }}>{label}</span>
            {badge
              ? <span style={{ padding: '1px 7px', borderRadius: 999, background: badge === 'HIGH' ? '#fef2f2' : badge === 'LOW' ? '#f0fdfa' : '#fffbeb', color: badge === 'HIGH' ? '#b91c1c' : badge === 'LOW' ? '#0f766e' : '#92400e', fontSize: 11, fontWeight: 800 }}>{value}</span>
              : <span style={{ color: '#0f172a', fontWeight: 600 }}>{value}</span>}
          </div>
        ) : null;

        if (event.event_type === 'FIELD_ISSUE') {
          const affectedCount = Number(event.affected_count);
          const hoursLost = Number(event.hours_lost);
          const hasDelayClaim = affectedCount > 0 || hoursLost > 0;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: '#fef2f2', borderRadius: 10, border: '1px solid rgba(220,38,38,0.15)' }}>
              {kv('Severity', event.severity, event.severity)}
              {kv('Blocking', event.blocking_flag === 'TRUE' ? 'Yes — work stopped' : 'No')}
              {kv('Category', event.issue_category)}
              {kv('Responsible', event.responsible_party)}
              {kv('Status', event.issue_status)}
              {event.delays_blockers && kv('Impact', event.delays_blockers)}
              {hasDelayClaim ? (
                <div style={{ marginTop: 4, padding: '6px 8px', background: 'rgba(220,38,38,0.06)', borderRadius: 6, border: '1px solid rgba(220,38,38,0.12)' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#dc2626', marginBottom: 3 }}>Delay Claim</div>
                  <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>
                    {[
                      affectedCount > 0 ? `${affectedCount} opening${affectedCount !== 1 ? 's' : ''} affected` : null,
                      hoursLost > 0 ? `${hoursLost}h lost` : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
              ) : null}
            </div>
          );
        }

        if (event.event_type === 'FIELD_MEASUREMENT') {
          let parsed: Record<string, unknown> = {};
          let isJson = false;
          try { parsed = JSON.parse(event.notes); isJson = true; } catch {}
          const fields = (parsed.fields || {}) as Record<string, string | boolean>;
          const CRITICAL_MEASUREMENT_FIELDS = ['panel_config','hinge_side','glass_thickness','mounting_type','accessibility','substrate','obstruction'];
          const KNOWN_FIELDS = new Set(['unit_reference','capture_tool','width','height','depth','qty','glass_type','glass_thickness','condition','accessibility','panel_config','hinge_side','mounting_type','substrate','obstruction','location_detail','measured_by']);
          const extra = Object.entries(fields).filter(([k]) => !KNOWN_FIELDS.has(k));
          const dim = [fields.width && `${fields.width}"W`, fields.height && `${fields.height}"H`, fields.depth && `${fields.depth}"D`].filter(Boolean).join(' × ');
          const measuredBy = String(parsed.measured_by || fields.measured_by || event.performed_by || '').trim();
          const captureToolStr = String(fields.capture_tool || parsed.capture_tool || '').trim();
          const captureBadge = (() => {
            if (/flexijet|total station/i.test(captureToolStr)) return { label: 'High accuracy', bg: '#f0fdf4', color: '#15803d' };
            if (/leica|disto/i.test(captureToolStr)) return { label: 'Pro', bg: '#eff6ff', color: '#1d4ed8' };
            if (/tape measure/i.test(captureToolStr)) return { label: 'Manual', bg: '#fffbeb', color: '#92400e' };
            return null;
          })();
          const calloutMeta: Record<string, { icon: string; label: string; implication: string }> = {
            panel_config:   { icon: '⬜', label: 'Panel Config',    implication: '→ framing layout' },
            hinge_side:     { icon: '🔄', label: 'Hinge Side',      implication: '→ swing direction' },
            glass_thickness:{ icon: '🔷', label: 'Glass Thickness', implication: '→ glass spec' },
            mounting_type:  { icon: '🔩', label: 'Mounting Type',   implication: '→ attachment method' },
            accessibility:  { icon: '♿', label: 'Accessibility',   implication: '→ equipment reservation' },
            substrate:      { icon: '🧱', label: 'Substrate',       implication: '→ anchor spec required' },
            obstruction:    { icon: '⚠️', label: 'Obstruction',     implication: '→ may trigger RFI/CO' },
          };
          const obstructionVal = String(fields.obstruction || '').trim();
          const hasObstruction = obstructionVal && obstructionVal.toLowerCase() !== 'none';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: 'rgba(8,145,178,0.05)', borderRadius: 10, border: '1px solid rgba(8,145,178,0.15)' }}>
              {isJson ? (
                <>
                  {/* Header row: system type + date + measured by */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#0891b2' }}>{String(parsed.system_type || 'Measurement')} · {parsed.captured_at ? new Date(String(parsed.captured_at)).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}</div>
                    {measuredBy && <div style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Measured by: {measuredBy}</div>}
                  </div>
                  {/* Obstruction pricing gap alert */}
                  {hasObstruction && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8 }}>
                      <span style={{ fontSize: 14 }}>⚠️</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Obstruction flagged: {obstructionVal} — may trigger RFI/CO</span>
                    </div>
                  )}
                  {/* Location */}
                  {(fields.unit_reference || fields.location_detail) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--bos-color-ink-disabled)' }}>Location</div>
                      {kv('Unit / Opening', fields.unit_reference ? String(fields.unit_reference) : undefined)}
                      {kv('Location Detail', fields.location_detail ? String(fields.location_detail) : undefined)}
                    </div>
                  )}
                  {/* Dimensions */}
                  {dim && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--bos-color-ink-disabled)' }}>Dimensions</div>
                      {kv('Size', dim)}
                      {fields.qty && kv('Qty', String(fields.qty))}
                    </div>
                  )}
                  {/* Critical enum callout cards */}
                  {CRITICAL_MEASUREMENT_FIELDS.some(k => fields[k]) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--bos-color-ink-disabled)' }}>Field Specs</div>
                      {CRITICAL_MEASUREMENT_FIELDS.map(k => {
                        const val = fields[k];
                        if (!val) return null;
                        const meta = calloutMeta[k];
                        const valStr = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
                        return (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(8,145,178,0.2)', borderLeft: '3px solid #0891b2', background: 'rgba(8,145,178,0.04)' }}>
                            <span style={{ fontSize: 14 }}>{meta.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--bos-color-ink-disabled)' }}>{meta.label}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{valStr}</div>
                            </div>
                            <div style={{ fontSize: 11, color: '#0891b2', fontWeight: 600, whiteSpace: 'nowrap' }}>{meta.implication}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Capture tool + other details */}
                  {(captureToolStr || fields.glass_type || fields.condition) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--bos-color-ink-disabled)' }}>Details</div>
                      {captureToolStr && (
                        <div style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
                          <span style={{ color: 'var(--bos-color-ink-tertiary)', fontWeight: 600, minWidth: 110 }}>Capture Tool</span>
                          <span style={{ color: '#0f172a', fontWeight: 600 }}>{captureToolStr}</span>
                          {captureBadge && <span style={{ padding: '1px 7px', borderRadius: 999, background: captureBadge.bg, color: captureBadge.color, fontSize: 11, fontWeight: 800 }}>{captureBadge.label}</span>}
                        </div>
                      )}
                      {fields.glass_type && kv('Glass Type', String(fields.glass_type))}
                      {fields.condition && kv('Condition', String(fields.condition))}
                    </div>
                  )}
                  {/* Additional fields */}
                  {extra.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--bos-color-ink-disabled)' }}>Additional Details</div>
                      {extra.map(([k,v]) => kv(k.replace(/_/g,' '), typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)))}
                    </div>
                  )}
                  {/* Full-size photo */}
                  {event.evidence_ref && (
                    <a href={`https://drive.google.com/file/d/${event.evidence_ref}/view`} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 4 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://drive.google.com/thumbnail?id=${event.evidence_ref}&sz=w600`} alt="Measurement photo"
                        style={{ width: '100%', maxWidth: 400, borderRadius: 10, border: '1px solid #e2e8f0', display: 'block' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </a>
                  )}
                </>
              ) : (
                // Safe fallback — do not render raw JSON blob
                <div style={{ fontSize: 13, color: 'var(--bos-color-ink-tertiary)', lineHeight: 1.5 }}>
                  Measurement data unavailable.{' '}
                  <button
                    onClick={e => { e.stopPropagation(); console.log('[FIELD_MEASUREMENT raw]', event.notes); }}
                    style={{ background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}
                  >View raw in console</button>
                </div>
              )}
            </div>
          );
        }

        if (event.event_type === 'INSTALL_STEP') {
          return (event.notes || event.evidence_ref) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'rgba(29,78,216,0.04)', borderRadius: 10, border: '1px solid rgba(29,78,216,0.12)' }}>
              {event.notes && (
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{event.notes}</div>
              )}
              {event.evidence_ref && (
                <a href={`https://drive.google.com/file/d/${event.evidence_ref}/view`} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://drive.google.com/thumbnail?id=${event.evidence_ref}&sz=w400`} alt="Step photo"
                    style={{ width: '100%', maxWidth: 300, borderRadius: 9, border: '1px solid #e2e8f0', display: 'block' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </a>
              )}
            </div>
          ) : null;
        }

        if (event.event_type === 'TM_CAPTURE') {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(event.notes); } catch {}

          const authType = parsed.authorization_type ? String(parsed.authorization_type) : '';
          const authorizedBy = parsed.authorized_by ? String(parsed.authorized_by) : '';
          const authorizedByTitle = parsed.authorized_by_title ? String(parsed.authorized_by_title) : '';
          const signedAt = parsed.signed_at ? formatTimestamp(String(parsed.signed_at)) : '';
          const signatureRef = typeof parsed.auth_signature_ref === 'string' && parsed.auth_signature_ref.trim()
            ? parsed.auth_signature_ref.trim()
            : event.evidence_ref;
          const crewEst = parsed.crew != null ? Number(parsed.crew) : null;
          const crewActual = parsed.crew_actual != null ? Number(parsed.crew_actual) : null;
          const hoursEst = parsed.hours_estimated != null ? Number(parsed.hours_estimated) : null;
          const hoursActual = parsed.hours_actual != null ? Number(parsed.hours_actual) : null;
          const materials = Array.isArray(parsed.materials)
            ? (parsed.materials as unknown[])
                .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
                .map(item => ({
                  desc: typeof item.desc === 'string' ? item.desc.trim() : '',
                  qty: item.qty,
                  unit: typeof item.unit === 'string' ? item.unit.trim() : '',
                }))
                .filter(item => item.desc)
            : [];
          const laborRows = Array.isArray(parsed.labor_rows)
            ? (parsed.labor_rows as unknown[])
                .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
                .map(item => ({
                  name: typeof item.name === 'string' ? item.name.trim() : '',
                  rateType: typeof item.rate_type === 'string' ? item.rate_type.trim() : '',
                  hours: item.hours,
                }))
                .filter(item => item.name || item.rateType || item.hours != null)
            : [];
          const equipmentRows = Array.isArray(parsed.equipment)
            ? (parsed.equipment as unknown[])
                .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
                .map(item => ({
                  desc: typeof item.desc === 'string' ? item.desc.trim() : '',
                  rateType: typeof item.rate_type === 'string' ? item.rate_type.trim() : '',
                  hours: item.hours,
                }))
                .filter(item => item.desc || item.rateType || item.hours != null)
            : [];
          const subcontractorRows = Array.isArray(parsed.subcontractors)
            ? (parsed.subcontractors as unknown[])
                .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
                .map(item => ({
                  vendor: typeof item.vendor === 'string' ? item.vendor.trim() : '',
                  desc: typeof item.desc === 'string' ? item.desc.trim() : '',
                }))
                .filter(item => item.vendor || item.desc)
            : [];
          const linkedIssue = parsed.triggering_event_id
            ? String(parsed.triggering_event_id)
            : (parsed.linked_field_issue_id ? String(parsed.linked_field_issue_id) : '');

          const crewDisplay = crewEst != null
            ? (crewActual != null ? `${crewEst} est. / ${crewActual} actual` : `${crewEst} est.`)
            : undefined;
          const hoursDisplay = hoursEst != null
            ? (hoursActual != null ? `${hoursEst}h est. / ${hoursActual}h actual` : `${hoursEst}h est.`)
            : undefined;
          const formatLineHours = (value: unknown): string => {
            if (typeof value === 'number' && Number.isFinite(value)) return String(value);
            if (typeof value === 'string' && value.trim()) return value.trim();
            return '—';
          };
          const formatMaterialChip = (item: { desc: string; qty: unknown; unit: string }): string => {
            const qty = typeof item.qty === 'number'
              ? (Number.isFinite(item.qty) ? String(item.qty) : '')
              : (typeof item.qty === 'string' ? item.qty.trim() : '');
            const suffix = [qty, item.unit].filter(Boolean).join(' ');
            return suffix ? `${item.desc} (${suffix})` : item.desc;
          };
          const tmTableWrapStyle: React.CSSProperties = {
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          };
          const tmTableStyle: React.CSSProperties = {
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 11,
            background: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(146,64,14,0.12)',
            borderRadius: 8,
            overflow: 'hidden',
          };
          const tmHeadCellStyle: React.CSSProperties = {
            textAlign: 'left',
            padding: '6px 8px',
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#92400e',
            background: 'rgba(146,64,14,0.08)',
            borderBottom: '1px solid rgba(146,64,14,0.12)',
          };
          const tmCellStyle: React.CSSProperties = {
            padding: '6px 8px',
            color: '#334155',
            borderBottom: '1px solid rgba(146,64,14,0.08)',
            verticalAlign: 'top',
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: 'rgba(146,64,14,0.05)', borderRadius: 10, border: '1px solid rgba(146,64,14,0.15)' }}>
              {/* Authorization Block */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e' }}>Authorization</div>
                {signatureRef ? (
                  <a href={`https://drive.google.com/file/d/${signatureRef}/view`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'inline-block' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://drive.google.com/thumbnail?id=${signatureRef}&sz=w300`}
                      alt="GC Signature"
                      style={{ maxWidth: 200, maxHeight: 80, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', display: 'block', objectFit: 'contain' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </a>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)', fontStyle: 'italic' }}>(no signature on file)</div>
                )}
                {authorizedBy && (
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--bos-color-ink-tertiary)', fontWeight: 600, minWidth: 110 }}>Authorized By</span>
                    <span style={{ color: '#0f172a', fontWeight: 700 }}>
                      {authorizedBy}{authorizedByTitle ? ` · ${authorizedByTitle}` : ''}
                    </span>
                  </div>
                )}
                {authType && (
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
                    <span style={{ color: 'var(--bos-color-ink-tertiary)', fontWeight: 600, minWidth: 110 }}>Auth Type</span>
                    <span style={{ padding: '1px 7px', borderRadius: 999, background: '#fffbeb', color: '#92400e', border: '1px solid rgba(146,64,14,0.2)', fontSize: 11, fontWeight: 800 }}>{authType}</span>
                  </div>
                )}
                {signedAt && kv('Signed', signedAt)}
              </div>
              {/* Labor: estimated vs actual delta */}
              {(crewDisplay != null || hoursDisplay != null) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e' }}>Labor</div>
                  {crewDisplay ? kv('Crew', crewDisplay) : null}
                  {hoursDisplay ? kv('Hours', hoursDisplay) : null}
                </div>
              ) : null}
              {laborRows.length > 0 && (
                <div style={tmTableWrapStyle}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e' }}>Labor Details</div>
                  <table style={tmTableStyle}>
                    <thead>
                      <tr>
                        <th style={tmHeadCellStyle}>Name</th>
                        <th style={tmHeadCellStyle}>Rate</th>
                        <th style={tmHeadCellStyle}>Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laborRows.map((row, index) => (
                        <tr key={`${row.name}-${row.rateType}-${index}`}>
                          <td style={tmCellStyle}>{row.name || '—'}</td>
                          <td style={tmCellStyle}>{row.rateType || '—'}</td>
                          <td style={tmCellStyle}>{formatLineHours(row.hours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Materials chip list */}
              {materials.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e' }}>Materials</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {materials.map((material, i) => (
                      <span key={i} style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(146,64,14,0.08)', color: '#92400e', fontSize: 11, fontWeight: 700, border: '1px solid rgba(146,64,14,0.15)' }}>
                        {formatMaterialChip(material)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {equipmentRows.length > 0 && (
                <div style={tmTableWrapStyle}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e' }}>Equipment</div>
                  <table style={tmTableStyle}>
                    <thead>
                      <tr>
                        <th style={tmHeadCellStyle}>Description</th>
                        <th style={tmHeadCellStyle}>Rate</th>
                        <th style={tmHeadCellStyle}>Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipmentRows.map((row, index) => (
                        <tr key={`${row.desc}-${row.rateType}-${index}`}>
                          <td style={tmCellStyle}>{row.desc || '—'}</td>
                          <td style={tmCellStyle}>{row.rateType || '—'}</td>
                          <td style={tmCellStyle}>{formatLineHours(row.hours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {subcontractorRows.length > 0 && (
                <div style={tmTableWrapStyle}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e' }}>Subcontractors</div>
                  <table style={tmTableStyle}>
                    <thead>
                      <tr>
                        <th style={tmHeadCellStyle}>Vendor</th>
                        <th style={tmHeadCellStyle}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subcontractorRows.map((row, index) => (
                        <tr key={`${row.vendor}-${row.desc}-${index}`}>
                          <td style={tmCellStyle}>{row.vendor || '—'}</td>
                          <td style={tmCellStyle}>{row.desc || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {kv('Linked Issue', linkedIssue ? linkedIssue.slice(0, 12) + '…' : undefined)}
            </div>
          );
        }

        if (event.event_type === 'DAILY_LOG') {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(event.notes); } catch { parsed = { raw: event.notes }; }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'rgba(21,128,61,0.05)', borderRadius: 10, border: '1px solid rgba(21,128,61,0.15)' }}>
              {kv('Manpower', event.manpower_count ? event.manpower_count + ' workers' : undefined)}
              {kv('Crew', parsed.crew_on_site ? String(parsed.crew_on_site) : undefined)}
              {kv('Hours', parsed.hours_worked ? String(parsed.hours_worked) + 'h' : undefined)}
              {event.work_performed && kv('Work Performed', event.work_performed)}
              {kv('Work Performed', parsed.work_performed && !event.work_performed ? String(parsed.work_performed) : undefined)}
              {kv('Delays', event.delays_blockers || undefined)}
              {kv('Delay type', parsed.delays && String(parsed.delays) !== 'None' ? String(parsed.delays) : undefined)}
              {kv('Weather', event.weather_context || undefined)}
              {kv('Materials', event.materials_received || undefined)}
            </div>
          );
        }

        if (event.event_type === 'PUNCH_LIST') {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(event.notes); } catch {}
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'rgba(217,119,6,0.05)', borderRadius: 10, border: '1px solid rgba(217,119,6,0.15)' }}>
              {kv('Location', String(parsed.location || event.unit_reference || ''))}
              {kv('Reported By', String(parsed.reported_by || ''))}
              {kv('Responsible', String(parsed.responsible_party || event.responsible_party || ''))}
              {kv('Priority', String(parsed.priority || ''))}
              {kv('Fix Required', parsed.resolution_required ? String(parsed.resolution_required) : undefined)}
              {kv('Status', event.issue_status || 'OPEN')}
            </div>
          );
        }

        if (event.event_type === 'SITE_VISIT') {
          let parsed: Record<string, unknown> = {};
          let isJson = false;
          try { parsed = JSON.parse(event.notes); isJson = true; } catch {}
          const fields = (parsed.fields || {}) as Record<string, string | boolean>;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: 'rgba(3,105,161,0.05)', borderRadius: 10, border: '1px solid rgba(3,105,161,0.15)' }}>
              {isJson && parsed.system_type ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#0369a1' }}>
                    {String(parsed.system_type)} · {parsed.captured_at ? new Date(String(parsed.captured_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </div>
                  {Object.entries(fields).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {Object.entries(fields).map(([k, v]) => kv(k.replace(/_/g, ' '), typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)))}
                    </div>
                  )}
                  {event.evidence_ref && (
                    <a href={`https://drive.google.com/file/d/${event.evidence_ref}/view`} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 4 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://drive.google.com/thumbnail?id=${event.evidence_ref}&sz=w600`} alt="Site visit photo"
                        style={{ width: '100%', maxWidth: 400, borderRadius: 10, border: '1px solid #e2e8f0', display: 'block' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </a>
                  )}
                </>
              ) : event.notes && !isJson ? (
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{event.notes}</div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--bos-color-ink-tertiary)', lineHeight: 1.5 }}>Site visit notes unavailable.</div>
              )}
            </div>
          );
        }

        if (effectiveEventType === 'CREW_DEMOBILIZED') {
          const raw = event.notes || '';
          const stripped = raw.startsWith('[CREW_DEMOBILIZED]') ? raw.slice(18).trimStart() : raw;
          const parts = stripped.split('\n\nOriginal issue:');
          const demobLine = parts[0]?.trim() ?? '';
          const issueContext = parts[1]?.trim() ?? '';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'rgba(185,28,28,0.05)', borderRadius: 10, border: '1px solid rgba(185,28,28,0.15)' }}>
              {demobLine && <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{demobLine}</div>}
              {issueContext && (
                <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)', lineHeight: 1.4, borderTop: '1px solid rgba(185,28,28,0.1)', paddingTop: 6, marginTop: 2 }}>
                  <span style={{ fontWeight: 700 }}>Original issue: </span>{issueContext}
                </div>
              )}
              {event.location_group && (
                <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600 }}>📍 {event.location_group}</span>
              )}
            </div>
          );
        }

        if (event.event_type === 'TESTING') {
          let parsed: Record<string, unknown> = {};
          let isJson = false;
          try { parsed = JSON.parse(event.notes); isJson = true; } catch {}
          const hasFields = isJson && (parsed.test_type || parsed.result || parsed.test_result);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'rgba(124,58,237,0.05)', borderRadius: 10, border: '1px solid rgba(124,58,237,0.15)' }}>
              {hasFields ? (
                <>
                  {kv('Test Type', parsed.test_type ? String(parsed.test_type) : undefined)}
                  {kv('Standard', parsed.test_standard ? String(parsed.test_standard) : undefined)}
                  {kv('Result', parsed.test_result ? String(parsed.test_result) : (parsed.result ? String(parsed.result) : undefined))}
                  {kv('Conditions', parsed.conditions ? String(parsed.conditions) : undefined)}
                  {kv('Witnesses', parsed.witnesses ? String(parsed.witnesses) : undefined)}
                  {event.evidence_ref && (
                    <a href={`https://drive.google.com/file/d/${event.evidence_ref}/view`} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: '#0369a1', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                      View evidence →
                    </a>
                  )}
                </>
              ) : event.notes && !isJson ? (
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{event.notes}</div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--bos-color-ink-tertiary)', lineHeight: 1.5 }}>Test details unavailable.</div>
              )}
            </div>
          );
        }

        if (event.event_type === 'WARRANTY_CALLBACK') {
          let parsed: Record<string, unknown> = {};
          let isJson = false;
          try { parsed = JSON.parse(event.notes); isJson = true; } catch {}
          const hasFields = isJson && (parsed.reported_by || parsed.issue_description || parsed.description);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'rgba(15,118,110,0.05)', borderRadius: 10, border: '1px solid rgba(15,118,110,0.15)' }}>
              {hasFields ? (
                <>
                  {kv('Reported By', parsed.reported_by ? String(parsed.reported_by) : undefined)}
                  {kv('Issue', parsed.issue_description ? String(parsed.issue_description) : (parsed.description ? String(parsed.description) : undefined))}
                  {kv('Responsible', parsed.responsible_party ? String(parsed.responsible_party) : (event.responsible_party || undefined))}
                  {kv('Fix Required', parsed.resolution_required ? String(parsed.resolution_required) : undefined)}
                  {kv('Status', event.issue_status || undefined)}
                  {event.evidence_ref && (
                    <a href={`https://drive.google.com/file/d/${event.evidence_ref}/view`} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: '#0369a1', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                      View evidence →
                    </a>
                  )}
                </>
              ) : event.notes && !isJson ? (
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{event.notes}</div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--bos-color-ink-tertiary)', lineHeight: 1.5 }}>Warranty callback details unavailable.</div>
              )}
            </div>
          );
        }

        if (event.event_type === 'EMAIL_SENT') {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(event.notes); } catch {}
          const recipients = Array.isArray(parsed.recipients) ? (parsed.recipients as string[]).join(', ') : undefined;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'rgba(5,150,105,0.05)', borderRadius: 10, border: '1px solid rgba(5,150,105,0.15)' }}>
              {!!parsed.subject && kv('Subject', String(parsed.subject))}
              {recipients && kv('To', recipients)}
              <div style={{ fontSize: 11, color: '#059669', fontStyle: 'italic', marginTop: 2 }}>(sent via Gmail)</div>
            </div>
          );
        }

        if (event.event_type === 'QA_COMPLETE') {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(event.notes); } catch {}
          const qaStatus = (typeof parsed.qa_status === 'string' ? parsed.qa_status : (event.qa_status || 'PASS')).toUpperCase();
          const qaChecks = (parsed.qa_checks || {}) as Record<string, boolean>;
          const checkEntries = Object.entries(qaChecks);
          const qaStatusStyle = qaStatus === 'PASS'
            ? { label: 'PASS',    bg: '#ecfdf5', color: '#059669', border: 'rgba(5,150,105,0.2)' }
            : qaStatus === 'PARTIAL'
            ? { label: 'PARTIAL', bg: '#fffbeb', color: '#d97706', border: 'rgba(217,119,6,0.2)' }
            : qaStatus === 'FAIL'
            ? { label: 'FAIL',    bg: '#fef2f2', color: '#dc2626', border: 'rgba(220,38,38,0.2)' }
            : { label: qaStatus,  bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
          const isDefenseMode = qaStatus === 'FAIL' || qaStatus === 'PARTIAL';
          const checkLabels: Record<string, string> = {
            glass_seated:         'Glass seated correctly',
            frame_plumb:          'Frame plumb',
            hardware_operation:   'Hardware operation',
            sealant_applied:      'Sealant applied',
            site_clean:           'Site clean',
            customer_walkthrough: 'Customer walkthrough',
          };
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: isDefenseMode ? 'rgba(220,38,38,0.04)' : 'rgba(126,34,206,0.04)', borderRadius: 10, border: `1px solid ${isDefenseMode ? 'rgba(220,38,38,0.18)' : 'rgba(126,34,206,0.12)'}` }}>
              {/* Status badge + inspector + date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ padding: '3px 10px', borderRadius: 999, background: qaStatusStyle.bg, color: qaStatusStyle.color, border: `1px solid ${qaStatusStyle.border}`, fontSize: 11, fontWeight: 800 }}>{qaStatusStyle.label}</span>
                {event.performed_by && <span style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', fontWeight: 600 }}>Inspected by: {event.performed_by}</span>}
                {!!parsed.completed_at && <span style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)' }}>{new Date(String(parsed.completed_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
              </div>
              {/* Legal defense label for FAIL/PARTIAL */}
              {isDefenseMode && lightboxPhotos.length > 0 && (
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#b91c1c' }}>⚖️ Legal defense evidence</div>
              )}
              {/* Photo thumbnail — hooks into shared lightbox */}
              {lightboxPhotos.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); setLightboxIndex(0); setLightboxOpen(true); }}
                  style={{ display: 'inline-block', background: 'none', border: 'none', padding: 0, cursor: 'pointer', alignSelf: 'flex-start' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://drive.google.com/thumbnail?id=${lightboxPhotos[0].fileId}&sz=w300`}
                    alt="QA photo"
                    style={{ width: isDefenseMode ? 200 : 140, height: isDefenseMode ? 130 : 90, objectFit: 'cover', borderRadius: 8, border: isDefenseMode ? '2px solid #dc2626' : '1px solid #e2e8f0', display: 'block' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </button>
              )}
              {/* Checklist summary */}
              {checkEntries.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--bos-color-ink-disabled)' }}>QA Checks</div>
                  {checkEntries.map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ color: v ? '#059669' : '#dc2626', fontWeight: 800, fontSize: 13, lineHeight: 1 }}>{v ? '✓' : '✗'}</span>
                      <span style={{ color: v ? '#334155' : '#b91c1c', fontWeight: v ? 500 : 700 }}>{checkLabels[k] || k.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Free-text notes */}
              {typeof parsed.notes === 'string' && parsed.notes.length > 0 && (
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, fontStyle: 'italic', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>{parsed.notes}</div>
              )}
            </div>
          );
        }

        if (event.event_type === 'PHOTO_ONLY' || event.event_type === 'NOTE') {
          const evidenceTypeBadge = (() => {
            const t = (event.evidence_type || '').trim().toLowerCase();
            if (!t) return null;
            const map: Record<string, { label: string; bg: string; color: string }> = {
              before:   { label: 'Before',   bg: '#eff6ff', color: '#1d4ed8' },
              during:   { label: 'During',   bg: '#f0fdfa', color: '#0f766e' },
              after:    { label: 'After',    bg: '#f0fdf4', color: '#15803d' },
              progress: { label: 'Progress', bg: '#fffbeb', color: '#92400e' },
              damage:   { label: 'Damage',   bg: '#fef2f2', color: '#b91c1c' },
              qa:       { label: 'QA',       bg: '#faf5ff', color: '#7e22ce' },
            };
            return map[t] ?? { label: event.evidence_type.trim(), bg: '#f1f5f9', color: '#475569' };
          })();
          const locGroup = (event.location_group || '').trim();
          if (!evidenceTypeBadge && !locGroup) return null;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', background: 'rgba(100,116,139,0.04)', borderRadius: 8, border: '1px solid rgba(100,116,139,0.12)' }}>
              {evidenceTypeBadge && (
                <span style={{ alignSelf: 'flex-start', padding: '2px 9px', borderRadius: 999, background: evidenceTypeBadge.bg, color: evidenceTypeBadge.color, fontSize: 11, fontWeight: 800 }}>
                  {evidenceTypeBadge.label}
                </span>
              )}
              {locGroup && (
                <span style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', fontWeight: 600 }}>📍 {locGroup}</span>
              )}
            </div>
          );
        }

        return null;
      })()}

      {/* Photo thumbnail — opens lightbox on click; suppressed for TM_CAPTURE (GC signature in Authorization Block) and QA_COMPLETE (photo in expanded block) */}
      {lightboxPhotos.length > 0 && event.event_type !== 'TM_CAPTURE' && event.event_type !== 'QA_COMPLETE' && (
        <button
          onClick={e => { e.stopPropagation(); setLightboxIndex(0); setLightboxOpen(true); }}
          style={{ display: 'inline-block', marginTop: 2, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://drive.google.com/thumbnail?id=${lightboxPhotos[0].fileId}&sz=w200`}
            alt="Field photo"
            style={{
              width: 140, height: 90, objectFit: 'cover',
              borderRadius: 8, border: '1px solid #e2e8f0',
              display: 'block',
            }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </button>
      )}

      {/* Lightbox modal */}
      {lightboxOpen && lightboxPhotos.length > 0 && (
        <div
          onClick={e => { e.stopPropagation(); setLightboxOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 14, padding: 24,
              maxWidth: 560, width: '90%',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {lightboxPhotos.length > 1 ? `Photo ${lightboxIndex + 1} of ${lightboxPhotos.length}` : 'Photo'}
              </span>
              <button
                onClick={() => setLightboxOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--bos-color-ink-disabled)', lineHeight: 1 }}
              >×</button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://drive.google.com/thumbnail?id=${lightboxPhotos[lightboxIndex].fileId}&sz=w800`}
              alt={lightboxPhotos[lightboxIndex].filename}
              style={{ width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 8, display: 'block', border: '1px solid #e2e8f0' }}
              onError={e => { (e.target as HTMLImageElement).alt = 'Image unavailable'; }}
            />

            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              {lightboxPhotos[lightboxIndex].filename}
            </div>

            <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic', lineHeight: 1.6 }}>
              {lightboxPhotos[lightboxIndex].caption}
            </div>

            {lightboxPhotos.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <button
                  onClick={() => setLightboxIndex(i => Math.max(0, i - 1))}
                  disabled={lightboxIndex === 0}
                  style={{
                    padding: '6px 16px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer',
                    opacity: lightboxIndex === 0 ? 0.35 : 1, fontWeight: 600,
                  }}
                >← Prev</button>
                <span style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>{lightboxIndex + 1} / {lightboxPhotos.length}</span>
                <button
                  onClick={() => setLightboxIndex(i => Math.min(lightboxPhotos.length - 1, i + 1))}
                  disabled={lightboxIndex === lightboxPhotos.length - 1}
                  style={{
                    padding: '6px 16px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer',
                    opacity: lightboxIndex === lightboxPhotos.length - 1 ? 0.35 : 1, fontWeight: 600,
                  }}
                >Next →</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

interface ActivityTimelineProps {
  kID: string;
}

type UserMap = Record<string, string>; // user_id or email → display name

export default function ActivityTimeline({ kID }: ActivityTimelineProps) {
  const [events, setEvents] = useState<FieldEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [userMap, setUserMap] = useState<UserMap>({});

  // Load users for name resolution
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(users => {
      const map: UserMap = {};
      if (Array.isArray(users)) {
        users.forEach((u: { user_id: string; name: string; email: string }) => {
          if (u.user_id) map[u.user_id] = u.name;
          if (u.email) map[u.email.toLowerCase()] = u.name;
        });
      }
      setUserMap(map);
    }).catch(() => {});
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = new URL('/api/events', window.location.origin);
      url.searchParams.set('kID', kID);
      url.searchParams.set('limit', '100');

      const boundary = getDateBoundary(dateFilter);
      if (boundary) {
        url.searchParams.set('date_from', boundary);
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [kID, dateFilter]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const types = params.get('types');
    if (types) setSelectedTypes(types.split(',').map(v => v.trim()).filter(Boolean));
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedTypes.length === 0) url.searchParams.delete('types');
    else url.searchParams.set('types', selectedTypes.join(','));
    window.history.replaceState(null, '', url.toString());
  }, [selectedTypes]);

  // When an issue is resolved, patch it in local state
  function handleResolved(eventId: string) {
    setEvents(prev =>
      prev.map(e => e.event_id === eventId ? { ...e, issue_status: 'RESOLVED' } : e)
    );
  }

  const displayEvents = events.filter(e => !isTmSubmittedMetaEvent(e));

  // Apply client-side type filter
  const filtered = displayEvents.filter(e => {
    if (selectedTypes.length === 0) return true;
    if (selectedTypes.includes('PHOTO_ONLY') && (e.event_type === 'PHOTO_ONLY' || e.event_type === 'NOTE')) return true;
    if (selectedTypes.includes('CREW_DEMOBILIZED')) {
      return e.event_type === 'CREW_DEMOBILIZED' ||
        (e.event_type === 'NOTE' && e.notes?.startsWith('[CREW_DEMOBILIZED]'));
    }
    return selectedTypes.includes(e.event_type);
  });

  const groupKeys = (group: typeof ACTIVITY_TIMELINE_TYPE_GROUPS[number]) => group.pills.map(p => p.key).filter(k => k !== 'ALL') as string[];
  function toggleType(key: string) {
    setSelectedTypes(prev => prev.includes(key) ? prev.filter(v => v !== key) : [...prev, key]);
  }
  function selectGroup(group: typeof ACTIVITY_TIMELINE_TYPE_GROUPS[number]) {
    const keys = groupKeys(group);
    setSelectedTypes(prev => Array.from(new Set([...prev, ...keys])));
  }
  function clearGroup(group: typeof ACTIVITY_TIMELINE_TYPE_GROUPS[number]) {
    const keys = new Set(groupKeys(group));
    setSelectedTypes(prev => prev.filter(v => !keys.has(v)));
  }

  const DATE_PILLS: { key: DateFilter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d',    label: '7 days' },
    { key: '30d',   label: '30 days' },
    { key: 'all',   label: 'All time' },
  ];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {/* Type pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setSelectedTypes([])} style={{
            padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: 'pointer',
            border: selectedTypes.length === 0 ? '1.5px solid #0f766e' : '1.5px solid #e2e8f0',
            background: selectedTypes.length === 0 ? 'rgba(15,118,110,0.08)' : 'white',
            color: selectedTypes.length === 0 ? '#0f766e' : 'var(--bos-color-ink-disabled)',
          }}>All ({displayEvents.length})</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ACTIVITY_TIMELINE_TYPE_GROUPS.map(group => (
            <div key={group.label} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 8, background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: openGroups[group.label] === true ? 8 : 0 }}>
                <button onClick={() => setOpenGroups(prev => ({ ...prev, [group.label]: prev[group.label] !== true }))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 900, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', minWidth: 112, textAlign: 'left' }}>
                  {openGroups[group.label] === true ? '▾' : '▸'} {group.label}
                </button>
                <button onClick={() => selectGroup(group)} style={{ border: 'none', background: 'transparent', color: '#0f766e', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>Select all</button>
                <button onClick={() => clearGroup(group)} style={{ border: 'none', background: 'transparent', color: 'var(--bos-color-ink-tertiary)', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>None</button>
              </div>
              {openGroups[group.label] === true && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {group.pills.map(p => {
                const cfg = p.key !== 'ALL' ? (EVENT_CONFIG[p.key] || EVENT_CONFIG.NOTE) : null;
                const FilterIcon = cfg && typeof cfg.icon !== 'string' ? cfg.icon : null;
                const filterIconText = cfg && typeof cfg.icon === 'string' ? cfg.icon : null;
                const active = selectedTypes.includes(p.key);
                return (
                  <button key={p.key} onClick={() => toggleType(p.key)} style={{
                    padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    border: active ? `1.5px solid ${cfg?.color || '#0f766e'}` : '1.5px solid #e2e8f0',
                    background: active ? `${cfg?.color || '#0f766e'}12` : 'white',
                    color: active ? (cfg?.color || '#0f766e') : 'var(--bos-color-ink-disabled)',
                    transition: 'all 0.1s',
                  }}>
                    {FilterIcon ? <FilterIcon size={12} strokeWidth={2.4} style={{ marginRight: 5, verticalAlign: '-2px' }} /> : filterIconText ? `${filterIconText} ` : ''}{p.label}
                    {p.key !== 'ALL' && (
                      <span style={{ marginLeft: 4, fontWeight: 800, opacity: 0.7 }}>
                        ({displayEvents.filter(e =>
                          p.key === 'PHOTO_ONLY'
                            ? (e.event_type === 'PHOTO_ONLY' || e.event_type === 'NOTE')
                            : p.key === 'CREW_DEMOBILIZED'
                              ? (e.event_type === 'CREW_DEMOBILIZED' || (e.event_type === 'NOTE' && e.notes?.startsWith('[CREW_DEMOBILIZED]')))
                              : e.event_type === p.key
                        ).length})
                      </span>
                    )}
                  </button>
                );
              })}
              </div>}
            </div>
          ))}
        </div>

        {/* Date filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {DATE_PILLS.map(p => {
            const active = dateFilter === p.key;
            return (
              <button key={p.key} onClick={() => setDateFilter(p.key)} style={{
                padding: '5px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                border: active ? '1.5px solid #0f766e' : '1.5px solid #e2e8f0',
                background: active ? 'rgba(15,118,110,0.08)' : 'white',
                color: active ? '#0f766e' : 'var(--bos-color-ink-tertiary)',
              }}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            border: '2.5px solid rgba(20,184,166,0.2)',
            borderTopColor: '#14b8a6',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>Loading field activity…</div>
        </div>
      ) : error ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#dc2626', fontSize: 13 }}>
          ⚠️ {error}
          <button onClick={loadEvents} style={{ marginLeft: 10, fontSize: 12, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<span style={{ fontSize: 36 }}>📋</span>}
          heading={displayEvents.length === 0
            ? 'No field activity logged for this project yet.'
            : 'No events match the selected filters.'}
          action={displayEvents.length > 0
            ? { label: 'Clear filters', onClick: () => { setSelectedTypes([]); setDateFilter('all'); }, variant: 'secondary' }
            : undefined}
        />
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', fontWeight: 600, marginBottom: 10 }}>
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            {selectedTypes.length > 0 || dateFilter !== 'all' ? ` (filtered from ${displayEvents.length})` : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(event => (
              <EventCard key={event.event_id} event={event} onResolved={handleResolved} userMap={userMap} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
