'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { normalizePhone } from '@/lib/normalize';
import ContactAutocomplete from '@/components/shared/ContactAutocomplete';
import type { ContactResult } from '@/components/shared/ContactAutocomplete';
import PlacesAutocomplete from '@/components/PlacesAutocomplete';
import type { ParsedPlace } from '@/components/PlacesAutocomplete';

// ── Types ─────────────────────────────────────────────────────────────────
type OrgRecord = {
  org_id: string;
  name: string;
  types: string[];
  entity_type: string;
  default_island: string;
  notes?: string;
  status?: string;
  merged_into_org_id?: string;
  merged_at?: string;
  merged_by?: string;
  primary_contact?: { contact_id?: string; name: string; email?: string; phone?: string; title?: string; role?: string };
  primary_site?: { site_id?: string; address_line_1?: string; city?: string; island?: string; site_type?: string };
  company: string;
  contactPerson: string;
  contactPhone: string;
  email: string;
  address: string;
  island: string;
  woCount: number;
};

type Contact = {
  contact_id: string;
  org_id: string;
  name: string;
  title: string;
  role: string;
  email: string;
  phone: string;
  is_primary: boolean;
  notes: string;
};

type Site = {
  site_id: string;
  org_id: string;
  name: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  zip: string;
  island: string;
  site_type: string;
  notes?: string;
};

type LinkedWO = {
  id: string;
  woNumber: string;
  name: string;
  status: string;
  island: string;
};

type LinkedProject = {
  kID: string;
  type: string;
  name: string;
  status: string;
  role: string;
};

type OrgDetail = {
  org: OrgRecord & { tax_id?: string; payment_terms?: string; avg_days_to_pay?: string; source?: string; created_at?: string; updated_at?: string };
  contacts: Contact[];
  sites: Site[];
  linkedWOs: LinkedWO[];
  linkedProjects: LinkedProject[];
};

type GovernanceRelationship = {
  relationship_id: string;
  source_org_id: string;
  target_org_id: string;
  relationship_type: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type MergePreview = {
  source_org_name: string;
  survivor_org_name: string;
  can_execute: boolean;
  blockers: string[];
  counts: {
    work_orders: number;
    contacts: number;
    sites: number;
    crosswalk: number;
    projects: number;
  };
  affected: {
    work_orders: Array<{ wo_id: string; wo_number: string; name: string }>;
    contacts: Array<{ contact_id: string; name: string }>;
    sites: Array<{ site_id: string; name: string; address: string }>;
    crosswalk: Array<{ customer_id: string }>;
    projects: Array<{ kID: string; name: string; role: string }>;
  };
};

// ── Constants ─────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  GC:            { color: '#1d4ed8', bg: '#eff6ff' },
  COMMERCIAL:    { color: '#0f766e', bg: '#f0fdfa' },
  RESIDENTIAL:   { color: '#15803d', bg: '#f0fdf4' },
  VENDOR:        { color: '#c2410c', bg: '#fff7ed' },
  ARCHITECT:     { color: '#7c3aed', bg: '#f5f3ff' },
  OWNER:         { color: '#b91c1c', bg: '#fef2f2' },
  BUILDER:       { color: '#d97706', bg: '#fffbeb' },
  GOVERNMENT:    { color: '#0369a1', bg: '#f0f9ff' },
  PROPERTY_MGMT: { color: '#64748b', bg: '#f8fafc' },
  CONSULTANT:    { color: '#4b5563', bg: '#f9fafb' },
};

const ALL_TYPES = ['GC', 'COMMERCIAL', 'RESIDENTIAL', 'VENDOR', 'GOVERNMENT', 'PROPERTY_MGMT'];

const FILTER_LABELS: Record<string, string> = {
  GC: 'GC',
  COMMERCIAL: 'Commercial',
  RESIDENTIAL: 'Residential',
  VENDOR: 'Vendor',
  GOVERNMENT: 'Government',
  PROPERTY_MGMT: 'Property Mgmt',
};

const WO_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  OPEN:          { bg: '#fef2f2', color: '#dc2626' },
  SCHEDULED:     { bg: '#eff6ff', color: '#1d4ed8' },
  IN_PROGRESS:   { bg: '#fffbeb', color: '#d97706' },
  ON_HOLD:       { bg: '#f8fafc', color: '#64748b' },
  COMPLETED:     { bg: '#f0fdf4', color: '#15803d' },
  CANCELLED:     { bg: '#f8fafc', color: '#94a3b8' },
  INVOICED:      { bg: '#f0fdfa', color: '#0f766e' },
  PAID:          { bg: '#f0fdf4', color: '#15803d' },
};

const ISLANDS = ['Oahu', 'Maui', 'Kauai', 'Hawaii', 'Molokai', 'Lanai'];
const RELATIONSHIP_TYPES = ['billing_account', 'property', 'operator', 'owner_hoa', 'property_manager', 'alias', 'other'];

// ── Helper Components ────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] || { color: '#64748b', bg: '#f8fafc' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
      background: c.bg, color: c.color, letterSpacing: '0.04em',
      textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const,
    }}>
      {FILTER_LABELS[type] || type.replace(/_/g, ' ')}
    </span>
  );
}

function WOStatusBadge({ status }: { status: string }) {
  const c = WO_STATUS_COLORS[status] || { bg: '#f8fafc', color: '#64748b' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
      background: c.bg, color: c.color, textTransform: 'uppercase' as const,
      letterSpacing: '0.04em', whiteSpace: 'nowrap' as const,
    }}>
      {status?.replace(/_/g, ' ') || '—'}
    </span>
  );
}

function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: '1px solid #f1f5f9', marginBottom: 2 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '10px 0', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b' }}>
            {title}
          </span>
          {count !== undefined && (
            <span style={{ fontSize: 10, fontWeight: 700, background: '#f1f5f9', color: '#64748b', borderRadius: 999, padding: '1px 7px' }}>
              {count}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}

type OrgPickerFilters = {
  activeOnly: boolean;
  sameIsland: boolean;
  sameType: boolean;
  hasWOs: boolean;
  zeroWOs: boolean;
  showInactive: boolean;
};

type RankedOrg = {
  org: OrgRecord;
  score: number;
  reasons: string[];
};

function primaryMatchBadge(reasons: string[], woCount: number): string {
  if (reasons.includes('same normalized name')) return 'Exact name';
  if (reasons.includes('name match')) return 'Similar name';
  if (reasons.includes('same island')) return 'Same island';
  if (woCount > 0) return 'Has WOs';
  if (woCount === 0) return 'Zero WOs';
  return '';
}

function normalizeOrgText(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[,\.#]/g, ' ')
    .replace(/\b(inc|llc|corp|ltd|co|company|association|assoc)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function orgStatus(org: OrgRecord): string {
  return (org.status || '').trim().toLowerCase();
}

function isActiveOrg(org: OrgRecord): boolean {
  const status = orgStatus(org);
  return !status || status === 'active';
}

function orgIsland(org: OrgRecord): string {
  return org.island || org.default_island || org.primary_site?.island || '';
}

function orgAddress(org: OrgRecord): string {
  return org.address || [org.primary_site?.address_line_1, org.primary_site?.city].filter(Boolean).join(', ');
}

function rankOrgCandidate(org: OrgRecord, currentOrg: OrgRecord, query: string): RankedOrg {
  const reasons: string[] = [];
  let score = 0;
  const currentName = normalizeOrgText(currentOrg.name);
  const candidateName = normalizeOrgText(org.name);
  const currentAddress = normalizeOrgText(orgAddress(currentOrg));
  const candidateAddress = normalizeOrgText(orgAddress(org));
  const currentIsland = orgIsland(currentOrg).toLowerCase();
  const candidateIsland = orgIsland(org).toLowerCase();
  const sharedTypes = org.types.filter(t => currentOrg.types.includes(t));
  const queryText = normalizeOrgText(query);

  if (currentName && candidateName && currentName === candidateName) {
    score += 120;
    reasons.push('same normalized name');
  } else if (
    currentName.length >= 3 &&
    candidateName.length >= 3 &&
    (currentName.includes(candidateName) || candidateName.includes(currentName))
  ) {
    score += 70;
    reasons.push('name match');
  }

  if (currentAddress && candidateAddress && (currentAddress.includes(candidateAddress) || candidateAddress.includes(currentAddress))) {
    score += 45;
    reasons.push('similar address');
  }
  if (currentIsland && candidateIsland && currentIsland === candidateIsland) {
    score += 15;
    reasons.push('same island');
  }
  if (sharedTypes.length > 0) {
    score += 12;
    reasons.push('same type');
  }
  if (Math.abs((org.woCount || 0) - (currentOrg.woCount || 0)) <= 2) {
    score += 6;
    reasons.push('WO count proximity');
  }
  if ((org.woCount || 0) === 0) {
    score += 8;
    reasons.push('zero WOs');
  }
  if (queryText) {
    const haystack = normalizeOrgText([
      org.name,
      org.org_id,
      orgAddress(org),
      org.primary_contact?.name,
      org.primary_contact?.email,
      org.contactPerson,
      org.email,
    ].filter(Boolean).join(' '));
    if (haystack.includes(queryText)) {
      score += 100;
      reasons.unshift('search match');
    } else {
      score = -1;
    }
  }

  return { org, score, reasons: [...new Set(reasons)] };
}

function filterRankedOrgs(
  orgOptions: OrgRecord[],
  currentOrg: OrgRecord,
  query: string,
  filters: OrgPickerFilters,
): RankedOrg[] {
  return orgOptions
    .filter(org => org.org_id !== currentOrg.org_id)
    .filter(org => filters.showInactive || !['merged', 'inactive'].includes(orgStatus(org)))
    .filter(org => !filters.activeOnly || isActiveOrg(org))
    .filter(org => !filters.sameIsland || (orgIsland(org) && orgIsland(org) === orgIsland(currentOrg)))
    .filter(org => !filters.sameType || org.types.some(t => currentOrg.types.includes(t)))
    .filter(org => !filters.hasWOs || (org.woCount || 0) > 0)
    .filter(org => !filters.zeroWOs || (org.woCount || 0) === 0)
    .map(org => rankOrgCandidate(org, currentOrg, query))
    .filter(result => result.score >= 0)
    .sort((a, b) => b.score - a.score || b.org.woCount - a.org.woCount || a.org.name.localeCompare(b.org.name));
}

function OrganizationPicker({
  title,
  currentOrg,
  orgOptions,
  selectedOrgId,
  onSelect,
  helperText = 'Search for the survivor organization. Do not merge related billing/property/operator entities unless you are sure they are duplicates.',
}: {
  title: string;
  currentOrg: OrgRecord;
  orgOptions: OrgRecord[];
  selectedOrgId: string;
  onSelect: (orgId: string) => void;
  helperText?: string;
}) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<OrgPickerFilters>({
    activeOnly: true,
    sameIsland: false,
    sameType: false,
    hasWOs: false,
    zeroWOs: false,
    showInactive: false,
  });

  const hasFilter = filters.sameIsland || filters.sameType || filters.hasWOs || filters.zeroWOs || filters.showInactive || !filters.activeOnly;
  const canShowSearchResults = query.trim().length >= 2 || hasFilter;
  const ranked = useMemo(
    () => filterRankedOrgs(orgOptions, currentOrg, query, filters),
    [orgOptions, currentOrg, query, filters],
  );
  const bestMatches = useMemo(
    () => {
      if (canShowSearchResults) return ranked;
      return filterRankedOrgs(orgOptions, currentOrg, '', filters)
        .filter(result => result.score >= 35 || result.reasons.includes('same normalized name') || result.reasons.includes('name match') || result.reasons.includes('similar address'));
    },
    [canShowSearchResults, ranked, orgOptions, currentOrg, filters],
  );
  const visibleResults = bestMatches.slice(0, 10);
  const selectedOrg = orgOptions.find(org => org.org_id === selectedOrgId);

  const chipStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 10,
    fontWeight: 800,
    padding: '4px 8px',
    borderRadius: 999,
    border: active ? '1px solid #0f766e' : '1px solid #e2e8f0',
    background: active ? '#f0fdfa' : 'white',
    color: active ? '#0f766e' : '#64748b',
    cursor: 'pointer',
  });

  function toggleFilter(key: keyof OrgPickerFilters) {
    setFilters(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === 'showInactive' && !prev.showInactive) next.activeOnly = false;
      if (key === 'activeOnly' && !prev.activeOnly) next.showInactive = false;
      if (key === 'hasWOs' && !prev.hasWOs) next.zeroWOs = false;
      if (key === 'zeroWOs' && !prev.zeroWOs) next.hasWOs = false;
      return next;
    });
  }

  function renderCard(result: RankedOrg) {
    const org = result.org;
    const selected = org.org_id === selectedOrgId;
    const status = org.status || '';
    const matchBadge = primaryMatchBadge(result.reasons, org.woCount || 0);
    return (
      <button
        key={org.org_id}
        type="button"
        onClick={() => onSelect(org.org_id)}
        style={{
          textAlign: 'left',
          width: '100%',
          padding: 9,
          borderRadius: 9,
          border: selected ? '1.5px solid #0f766e' : '1px solid #e2e8f0',
          background: selected ? '#f0fdfa' : 'white',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org.name || 'Unnamed org'}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{org.org_id}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', borderRadius: 999, padding: '2px 7px', height: 18, whiteSpace: 'nowrap' }}>
            {org.woCount || 0} WO{org.woCount === 1 ? '' : 's'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
          {org.types.slice(0, 3).map(t => <TypeBadge key={t} type={t} />)}
          {orgIsland(org) && <span style={{ fontSize: 10, color: '#64748b' }}>{orgIsland(org)}</span>}
          {matchBadge && <span style={{ fontSize: 10, color: '#0f766e', background: '#f0fdfa', borderRadius: 999, padding: '2px 6px' }}>{matchBadge}</span>}
          {status && status !== 'active' && <span style={{ fontSize: 10, color: '#92400e', background: '#fffbeb', borderRadius: 999, padding: '2px 6px' }}>{status}</span>}
        </div>
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', display: 'block' }}>{title}</label>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by organization name, address, org ID, or contact."
        style={{ fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none', background: 'white', width: '100%', boxSizing: 'border-box' }}
      />
      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
        {helperText}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        <button type="button" onClick={() => toggleFilter('activeOnly')} style={chipStyle(filters.activeOnly)}>Active only</button>
        <button type="button" onClick={() => toggleFilter('sameIsland')} style={chipStyle(filters.sameIsland)}>Same island</button>
        <button type="button" onClick={() => toggleFilter('sameType')} style={chipStyle(filters.sameType)}>Same type</button>
        <button type="button" onClick={() => toggleFilter('hasWOs')} style={chipStyle(filters.hasWOs)}>Has WOs</button>
        <button type="button" onClick={() => toggleFilter('zeroWOs')} style={chipStyle(filters.zeroWOs)}>Zero WOs</button>
        <button type="button" onClick={() => toggleFilter('showInactive')} style={chipStyle(filters.showInactive)}>Show merged/inactive</button>
      </div>
      {selectedOrg && (
        <div style={{ fontSize: 12, color: '#0f766e', background: '#f0fdfa', border: '1px solid rgba(15,118,110,0.2)', borderRadius: 8, padding: '7px 9px' }}>
          Selected: <strong>{selectedOrg.name}</strong> · {selectedOrg.org_id}
        </div>
      )}
      {bestMatches.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 5 }}>
            Best matches {bestMatches.length > 10 ? '(top 10 shown)' : `(${bestMatches.length})`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {visibleResults.map(renderCard)}
          </div>
          {bestMatches.length > 10 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              Refine search for more results.
            </div>
          )}
        </div>
      )}
      {canShowSearchResults && bestMatches.length === 0 && (
        <div style={{ fontSize: 12, color: '#94a3b8', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
          No matching organizations.
        </div>
      )}
    </div>
  );
}

// ── Detail Panel ────────────────────────────────────────────────────────
function OrgDetailPanel({
  orgId,
  onClose,
  onNavigate,
  orgOptions,
  onChanged,
}: {
  orgId: string;
  onClose: () => void;
  onNavigate?: (view: string, params?: Record<string, string>) => void;
  orgOptions: OrgRecord[];
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [relationships, setRelationships] = useState<GovernanceRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [governanceSaving, setGovernanceSaving] = useState(false);
  const [governanceMessage, setGovernanceMessage] = useState('');
  const [governanceError, setGovernanceError] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [addingSite, setAddingSite] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', title: '', email: '', phone: '', is_primary: false });
  const [newSite, setNewSite] = useState({ address_line_1: '', city: '', island: '', site_type: 'OFFICE' });
  const [orgEditForm, setOrgEditForm] = useState<{ name: string; types: string[]; notes: string; status: string }>({ name: '', types: [], notes: '', status: '' });
  const [relationshipForm, setRelationshipForm] = useState({ target_org_id: '', relationship_type: 'property', notes: '' });
  const [mergeForm, setMergeForm] = useState({ survivor_org_id: '', notes: '' });
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; title: string; phone: string; email: string }>({ name: '', title: '', phone: '', email: '' });
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [siteEditForm, setSiteEditForm] = useState({ name: '', address_line_1: '', city: '', state: 'HI', zip: '', island: '', site_type: 'OFFICE' });
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  function toggleSection(key: string) {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [res, relRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}`),
        fetch(`/api/organizations/governance/relationships?org_id=${encodeURIComponent(orgId)}`),
      ]);
      const data = await res.json();
      const relData = await relRes.json().catch(() => ({ relationships: [] }));
      setDetail(data);
      setRelationships(relData.relationships || []);
      setOrgEditForm({
        name: data.org?.name || '',
        types: data.org?.types || [],
        notes: data.org?.notes || '',
        status: data.org?.status || '',
      });
    } catch (err) {
      console.error('[OrgDetailPanel] load', err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function saveOrgDetails() {
    setGovernanceSaving(true);
    setGovernanceMessage('');
    setGovernanceError('');
    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgEditForm.name,
          types: orgEditForm.types,
          notes: orgEditForm.notes,
          status: orgEditForm.status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update organization');
      setGovernanceMessage('Organization details saved.');
      await loadDetail();
      onChanged();
    } catch (err) {
      setGovernanceError(err instanceof Error ? err.message : 'Failed to update organization');
    } finally {
      setGovernanceSaving(false);
    }
  }

  async function previewMerge() {
    if (!mergeForm.survivor_org_id) return;
    setGovernanceSaving(true);
    setGovernanceMessage('');
    setGovernanceError('');
    setMergePreview(null);
    try {
      const params = new URLSearchParams({ source_org_id: orgId, survivor_org_id: mergeForm.survivor_org_id });
      const res = await fetch(`/api/organizations/governance/merge?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to preview merge');
      setMergePreview(data.preview);
      setGovernanceMessage('Merge preview loaded. Review affected references before confirming.');
    } catch (err) {
      setGovernanceError(err instanceof Error ? err.message : 'Failed to preview merge');
    } finally {
      setGovernanceSaving(false);
    }
  }

  async function executeMerge() {
    if (!mergePreview || !mergeForm.survivor_org_id) return;
    if (!mergePreview.can_execute) {
      setGovernanceError('Merge preview has blockers. Resolve them before executing.');
      return;
    }
    if (!confirm(`Merge ${detail?.org.name || orgId} into ${mergePreview.survivor_org_name}? This moves references and marks the duplicate merged.`)) return;
    setGovernanceSaving(true);
    setGovernanceMessage('');
    setGovernanceError('');
    try {
      const res = await fetch('/api/organizations/governance/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_org_id: orgId, survivor_org_id: mergeForm.survivor_org_id, notes: mergeForm.notes, preview_confirmed: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to execute merge');
      const mismatches = data.diagnostics?.mismatches?.length || 0;
      setGovernanceMessage(`Merge complete. Crosswalk mismatches: ${mismatches}.`);
      setMergePreview(null);
      await loadDetail();
      onChanged();
    } catch (err) {
      setGovernanceError(err instanceof Error ? err.message : 'Failed to execute merge');
    } finally {
      setGovernanceSaving(false);
    }
  }

  async function saveRelationship() {
    if (!relationshipForm.target_org_id) return;
    setGovernanceSaving(true);
    setGovernanceMessage('');
    setGovernanceError('');
    try {
      const res = await fetch('/api/organizations/governance/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_org_id: orgId, ...relationshipForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save relationship');
      setRelationshipForm({ target_org_id: '', relationship_type: 'property', notes: '' });
      setGovernanceMessage('Relationship saved.');
      await loadDetail();
    } catch (err) {
      setGovernanceError(err instanceof Error ? err.message : 'Failed to save relationship');
    } finally {
      setGovernanceSaving(false);
    }
  }

  async function addContact() {
    if (!newContact.name.trim()) return;
    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newContact, org_id: orgId }),
      });
      await loadDetail();
      setNewContact({ name: '', title: '', email: '', phone: '', is_primary: false });
      setAddingContact(false);
    } catch (err) {
      console.error('[OrgDetailPanel] addContact', err);
    }
  }

  async function setAsPrimary(contactId: string) {
    setMenuOpenId(null);
    try {
      await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, is_primary: true }),
      });
      await loadDetail();
    } catch (err) {
      console.error('[OrgDetailPanel] setAsPrimary', err);
    }
  }

  async function deleteContact(contactId: string) {
    setMenuOpenId(null);
    if (!confirm('Delete this contact?')) return;
    try {
      await fetch(`/api/contacts?contact_id=${contactId}`, { method: 'DELETE' });
      await loadDetail();
    } catch (err) {
      console.error('[OrgDetailPanel] deleteContact', err);
    }
  }

  function startEdit(c: Contact) {
    setEditingContactId(c.contact_id);
    setEditForm({ name: c.name, title: c.title || '', phone: c.phone || '', email: c.email || '' });
    setMenuOpenId(null);
  }

  async function saveContactEdit(contactId: string) {
    try {
      await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, ...editForm }),
      });
      await loadDetail();
      setEditingContactId(null);
    } catch (err) {
      console.error('[OrgDetailPanel] saveContactEdit', err);
    }
  }

  async function addSite() {
    try {
      await fetch(`/api/organizations/${orgId}/sites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSite),
      });
      await loadDetail();
      setNewSite({ address_line_1: '', city: '', island: '', site_type: 'OFFICE' });
      setAddingSite(false);
    } catch (err) {
      console.error('[OrgDetailPanel] addSite', err);
    }
  }

  function startSiteEdit(site: Site) {
    setEditingSiteId(site.site_id);
    setSiteEditForm({
      name: site.name || '',
      address_line_1: site.address_line_1 || '',
      city: site.city || '',
      state: site.state || 'HI',
      zip: site.zip || '',
      island: site.island || '',
      site_type: site.site_type || 'OFFICE',
    });
  }

  async function saveSiteEdit(siteId: string) {
    try {
      const res = await fetch(`/api/organizations/${orgId}/sites`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, ...siteEditForm }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update site');
      }
      await loadDetail();
      setEditingSiteId(null);
    } catch (err) {
      console.error('[OrgDetailPanel] saveSiteEdit', err);
    }
  }

  const INP: React.CSSProperties = {
    fontSize: 13, padding: '6px 10px', borderRadius: 8,
    border: '1px solid #e2e8f0', outline: 'none', background: 'white',
    width: '100%', boxSizing: 'border-box' as const,
  };
  const LBL: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 3, display: 'block',
  };
  const SEC: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const,
    letterSpacing: '0.1em', color: '#64748b', marginBottom: 10, marginTop: 20,
    paddingBottom: 6, borderBottom: '1px solid #f1f5f9',
  };
  const orgNameById = new Map(orgOptions.map(o => [o.org_id, o.name]));
  const countTotal = mergePreview
    ? mergePreview.counts.work_orders + mergePreview.counts.contacts + mergePreview.counts.sites + mergePreview.counts.crosswalk + mergePreview.counts.projects
    : 0;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(15,23,42,0.25)' }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 501,
        width: 'min(700px,100vw)', background: 'white',
        boxShadow: '-4px 0 32px rgba(15,23,42,0.14)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'slideIn 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, padding: '2px 6px', borderRadius: 6, lineHeight: 1 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading || !detail ? (
              <div style={{ fontSize: 17, fontWeight: 800, color: '#94a3b8' }}>Loading…</div>
            ) : (
              <span style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {detail.org.name}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        {loading || !detail ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
            Loading organization…
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {/* Types + meta */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
              {detail.org.types.map(t => <TypeBadge key={t} type={t} />)}
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {detail.org.entity_type} · {detail.org.default_island || '—'}
              </span>
            </div>

            {governanceMessage && (
              <div style={{ fontSize: 12, color: '#0f766e', background: '#f0fdfa', border: '1px solid rgba(15,118,110,0.2)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                {governanceMessage}
              </div>
            )}
            {governanceError && (
              <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                {governanceError}
              </div>
            )}
            {detail.org.status === 'merged' && (
              <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                This organization is marked merged into {detail.org.merged_into_org_id || 'another organization'}.
              </div>
            )}

            <CollapsibleSection title="Edit Organization" open={!!openSections['edit']} onToggle={() => toggleSection('edit')}>
              <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Name + Save button row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={LBL}>Name</label><input style={INP} value={orgEditForm.name} onChange={e => setOrgEditForm(p => ({ ...p, name: e.target.value }))} /></div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button onClick={saveOrgDetails} disabled={governanceSaving || !orgEditForm.name.trim()} style={{ width: '100%', padding: '7px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 800, cursor: governanceSaving ? 'default' : 'pointer', opacity: governanceSaving ? 0.6 : 1 }}>
                      Save Organization
                    </button>
                  </div>
                </div>
                {/* Types — governed chips */}
                <div>
                  <label style={LBL}>Types</label>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 5 }}>Types are governed classifications used for filtering and identity cleanup.</div>
                  {orgEditForm.types.filter(t => !ALL_TYPES.includes(t)).length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#94a3b8', marginRight: 4 }}>Legacy (unsupported):</span>
                      {orgEditForm.types.filter(t => !ALL_TYPES.includes(t)).map(t => (
                        <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#f1f5f9', color: '#94a3b8', marginRight: 4, display: 'inline-block', textTransform: 'uppercase' as const }}>{t}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {ALL_TYPES.map(t => {
                      const selected = orgEditForm.types.includes(t);
                      const c = TYPE_COLORS[t] || { color: '#64748b', bg: '#f8fafc' };
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setOrgEditForm(p => ({
                            ...p,
                            types: selected ? p.types.filter(x => x !== t) : [...p.types, t],
                          }))}
                          style={{
                            fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                            border: selected ? `1.5px solid ${c.color}` : '1.5px solid #e2e8f0',
                            background: selected ? c.bg : 'white',
                            color: selected ? c.color : '#64748b',
                            letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                          }}
                        >
                          {FILTER_LABELS[t] || t.replace(/_/g, ' ')}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Status — controlled select, merged is read-only */}
                <div>
                  <label style={LBL}>Status</label>
                  {detail.org.status === 'merged' ? (
                    <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px' }}>
                      Status is <strong>merged</strong> — controlled by the merge workflow and cannot be manually changed.
                    </div>
                  ) : (
                    <>
                      <select
                        style={{ ...INP, cursor: 'pointer' }}
                        value={orgEditForm.status || 'active'}
                        onChange={e => setOrgEditForm(p => ({ ...p, status: e.target.value }))}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>Merged status is controlled by the merge workflow and cannot be manually selected.</div>
                    </>
                  )}
                </div>
                {/* Notes — single authoritative edit surface */}
                <div>
                  <label style={LBL}>Notes</label>
                  <textarea style={{ ...INP, resize: 'vertical', minHeight: 48 }} value={orgEditForm.notes} onChange={e => setOrgEditForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Merge Duplicate Org" open={!!openSections['merge']} onToggle={() => toggleSection('merge')}>
              <div style={{ padding: 10, borderRadius: 8, border: '1px solid #fde68a', background: '#fffbeb', marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                  <strong>Use only when two org records are the same entity.</strong> This moves all references — work orders, contacts, sites, crosswalk — to the survivor org and marks this record as merged. Preview is required before confirming.
                </div>
              </div>
              <OrganizationPicker
                title="Survivor / Primary Org"
                currentOrg={detail.org}
                orgOptions={orgOptions}
                selectedOrgId={mergeForm.survivor_org_id}
                onSelect={selectedOrgId => {
                  setMergeForm(p => ({ ...p, survivor_org_id: selectedOrgId }));
                  setMergePreview(null);
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={previewMerge} disabled={governanceSaving || !mergeForm.survivor_org_id} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #0f766e', background: 'white', color: '#0f766e', fontSize: 12, fontWeight: 800, cursor: mergeForm.survivor_org_id ? 'pointer' : 'default', opacity: mergeForm.survivor_org_id ? 1 : 0.5 }}>
                  Preview
                </button>
                <button onClick={executeMerge} disabled={governanceSaving || !mergeForm.survivor_org_id || !mergePreview?.can_execute} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', background: '#b91c1c', color: 'white', fontSize: 12, fontWeight: 800, cursor: mergeForm.survivor_org_id && mergePreview?.can_execute ? 'pointer' : 'default', opacity: mergeForm.survivor_org_id && mergePreview?.can_execute ? 1 : 0.45 }}>
                  Confirm Merge
                </button>
              </div>
              <textarea style={{ ...INP, resize: 'vertical', minHeight: 44, marginTop: 8 }} value={mergeForm.notes} onChange={e => setMergeForm(p => ({ ...p, notes: e.target.value }))} placeholder="Merge note for audit log" />
              {mergePreview && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'white', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: mergePreview.can_execute ? '#0f766e' : '#b91c1c', marginBottom: 6 }}>
                    {mergePreview.can_execute ? 'Preview ready' : 'Preview blocked'} · {countTotal} affected references
                  </div>
                  {mergePreview.blockers.length > 0 && (
                    <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 6 }}>{mergePreview.blockers.join(' ')}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, fontSize: 11 }}>
                    <span>WOs: <strong>{mergePreview.counts.work_orders}</strong></span>
                    <span>Contacts: <strong>{mergePreview.counts.contacts}</strong></span>
                    <span>Sites: <strong>{mergePreview.counts.sites}</strong></span>
                    <span>Crosswalk: <strong>{mergePreview.counts.crosswalk}</strong></span>
                    <span>Projects: <strong>{mergePreview.counts.projects}</strong></span>
                  </div>
                  {(mergePreview.affected.work_orders[0] || mergePreview.affected.projects[0] || mergePreview.affected.contacts[0] || mergePreview.affected.sites[0]) && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                      Examples: {[mergePreview.affected.work_orders[0]?.wo_number, mergePreview.affected.projects[0]?.kID, mergePreview.affected.contacts[0]?.name, mergePreview.affected.sites[0]?.address].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Mark Related, Not Duplicate" open={!!openSections['related']} onToggle={() => toggleSection('related')}>
              <div style={{ padding: 10, borderRadius: 8, border: '1px solid #bae6fd', background: '#f0f9ff', marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: '#0369a1', lineHeight: 1.5 }}>
                  <strong>Use when orgs are connected but must stay separate.</strong> Examples: property and billing account, operator and owner, HOA and property manager. Records the relationship without moving or merging any data.
                </div>
              </div>
              <OrganizationPicker
                title="Related Org"
                currentOrg={detail.org}
                orgOptions={orgOptions}
                selectedOrgId={relationshipForm.target_org_id}
                helperText="Search for a related organization. Preserve separate billing/property/operator entities unless an intentional merge is required."
                onSelect={targetOrgId => setRelationshipForm(p => ({ ...p, target_org_id: targetOrgId }))}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginTop: 8 }}>
                <div>
                  <label style={LBL}>Relationship</label>
                  <select style={{ ...INP, cursor: 'pointer' }} value={relationshipForm.relationship_type} onChange={e => setRelationshipForm(p => ({ ...p, relationship_type: e.target.value }))}>
                    {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <button onClick={saveRelationship} disabled={governanceSaving || !relationshipForm.target_org_id} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 800, cursor: relationshipForm.target_org_id ? 'pointer' : 'default', opacity: relationshipForm.target_org_id ? 1 : 0.5 }}>
                  Save
                </button>
              </div>
              <textarea style={{ ...INP, resize: 'vertical', minHeight: 44, marginTop: 8 }} value={relationshipForm.notes} onChange={e => setRelationshipForm(p => ({ ...p, notes: e.target.value }))} placeholder="Relationship note" />
              {relationships.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {relationships.map(rel => {
                    const otherOrgId = rel.source_org_id === orgId ? rel.target_org_id : rel.source_org_id;
                    return (
                      <div key={rel.relationship_id} style={{ padding: '7px 9px', borderRadius: 8, background: 'white', border: '1px solid #e2e8f0', fontSize: 12 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{rel.relationship_type.replace(/_/g, ' ')} · {orgNameById.get(otherOrgId) || otherOrgId}</div>
                        {rel.notes && <div style={{ color: '#64748b', marginTop: 2 }}>{rel.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleSection>

            {/* Contacts */}
            <CollapsibleSection title="Contacts" count={detail.contacts.length} open={!!openSections['contacts']} onToggle={() => toggleSection('contacts')}>
            {detail.contacts.length === 0 && !addingContact && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>No contacts yet.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
              {detail.contacts.map(c => (
                <div key={c.contact_id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #f1f5f9', background: c.is_primary ? '#f0fdf4' : 'white', position: 'relative' }}>
                  {/* Card header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                        {c.is_primary && <span style={{ fontSize: 13 }}>⭐</span>}
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{c.name}</span>
                      </div>
                      {c.title && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.title}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => editingContactId === c.contact_id ? setEditingContactId(null) : startEdit(c)}
                        style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: editingContactId === c.contact_id ? '#f1f5f9' : 'white', color: '#64748b', cursor: 'pointer' }}
                      >
                        {editingContactId === c.contact_id ? 'Cancel' : 'Edit'}
                      </button>
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setMenuOpenId(menuOpenId === c.contact_id ? null : c.contact_id)}
                          style={{ fontSize: 14, fontWeight: 700, padding: '2px 7px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', lineHeight: 1.2 }}
                        >···</button>
                        {menuOpenId === c.contact_id && (
                          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 10, minWidth: 150, overflow: 'hidden' }}>
                            <button
                              onClick={() => setAsPrimary(c.contact_id)}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                            >⭐ Set as Primary</button>
                            <button
                              onClick={() => deleteContact(c.contact_id)}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                            >🗑 Delete</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* View mode: phone + email links */}
                  {editingContactId !== c.contact_id && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {c.phone && (
                        <div style={{ fontSize: 12, color: '#334155' }}>
                          📞 <a href={`tel:${c.phone}`} style={{ color: '#0f766e', textDecoration: 'none' }}>{c.phone}</a>
                        </div>
                      )}
                      {c.email && (
                        <div style={{ fontSize: 12, color: '#334155' }}>
                          ✉️ <a href={`mailto:${c.email}`} style={{ color: '#0f766e', textDecoration: 'none' }}>{c.email}</a>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Inline edit mode */}
                  {editingContactId === c.contact_id && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div><label style={LBL}>Name</label><input style={INP} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} /></div>
                        <div><label style={LBL}>Title</label><input style={INP} value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} /></div>
                        <div><label style={LBL}>Phone</label><input style={INP} type="tel" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} onBlur={e => setEditForm(p => ({ ...p, phone: normalizePhone(e.target.value) }))} /></div>
                        <div><label style={LBL}>Email</label><input style={INP} type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setEditingContactId(null)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={() => saveContactEdit(c.contact_id)} style={{ flex: 2, padding: '7px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {addingContact ? (
              <div style={{ padding: '12px', borderRadius: 10, border: '1.5px dashed #0f766e', marginTop: 8, marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div><label style={LBL}>Name *</label><ContactAutocomplete
                    value={newContact.name}
                    onChange={val => setNewContact(p => ({ ...p, name: val }))}
                    onSelect={(c: ContactResult) => {
                      setNewContact(p => ({
                        ...p,
                        name: c.name,
                        phone: c.phone || p.phone,
                        email: c.email || p.email,
                        title: c.title || p.title,
                      }));
                    }}
                    style={INP}
                    placeholder="Full name"
                    orgId={orgId}
                  /></div>
                  <div><label style={LBL}>Title</label><input style={INP} value={newContact.title} onChange={e => setNewContact(p => ({ ...p, title: e.target.value }))} /></div>
                  <div><label style={LBL}>Phone</label><input style={INP} type="tel" value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} onBlur={e => setNewContact(p => ({ ...p, phone: normalizePhone(e.target.value) }))} /></div>
                  <div><label style={LBL}>Email</label><input style={INP} type="email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#475569' }}>
                    <input type="checkbox" checked={newContact.is_primary} onChange={e => setNewContact(p => ({ ...p, is_primary: e.target.checked }))} />
                    Set as primary contact
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setAddingContact(false)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={addContact} disabled={!newContact.name.trim()} style={{ flex: 2, padding: '7px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add Contact</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingContact(true)} style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add Contact</button>
            )}
            </CollapsibleSection>

            {/* Sites */}
            <CollapsibleSection title="Sites" count={detail.sites.length} open={!!openSections['sites']} onToggle={() => toggleSection('sites')}>
            {detail.sites.length === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>No sites yet.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
              {detail.sites.map(s => (
                <div key={s.site_id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #f1f5f9', fontSize: 13, color: '#334155' }}>
                  {editingSiteId === s.site_id ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div><label style={LBL}>Label</label><input style={INP} value={siteEditForm.name} onChange={e => setSiteEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Office, Jobsite, Residence" /></div>
                        <div><label style={LBL}>Address</label><PlacesAutocomplete value={siteEditForm.address_line_1} onChange={v => setSiteEditForm(p => ({ ...p, address_line_1: v }))} onSelect={(place: ParsedPlace) => setSiteEditForm(p => ({ ...p, address_line_1: place.formatted_address || p.address_line_1, city: place.city || p.city }))} style={INP} placeholder="Street address" /></div>
                        <div><label style={LBL}>City</label><input style={INP} value={siteEditForm.city} onChange={e => setSiteEditForm(p => ({ ...p, city: e.target.value }))} /></div>
                        <div><label style={LBL}>State</label><input style={INP} value={siteEditForm.state} onChange={e => setSiteEditForm(p => ({ ...p, state: e.target.value }))} maxLength={2} /></div>
                        <div><label style={LBL}>Zip</label><input style={INP} value={siteEditForm.zip} onChange={e => setSiteEditForm(p => ({ ...p, zip: e.target.value }))} /></div>
                        <div><label style={LBL}>Island</label>
                          <select style={{ ...INP, cursor: 'pointer' }} value={siteEditForm.island} onChange={e => setSiteEditForm(p => ({ ...p, island: e.target.value }))}>
                            <option value="">Select island</option>
                            {ISLANDS.map(i => <option key={i} value={i}>{i}</option>)}
                          </select>
                        </div>
                        <div><label style={LBL}>Type</label>
                          <select style={{ ...INP, cursor: 'pointer' }} value={siteEditForm.site_type} onChange={e => setSiteEditForm(p => ({ ...p, site_type: e.target.value }))}>
                            {['OFFICE', 'JOBSITE', 'RESIDENCE', 'WAREHOUSE'].map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setEditingSiteId(null)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={() => saveSiteEdit(s.site_id)} style={{ flex: 2, padding: '7px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save Site</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                          {s.name && <div style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', marginBottom: 2 }}>{s.name}</div>}
                          <div style={{ fontWeight: 700 }}>{s.address_line_1 || '—'}{s.city ? `, ${s.city}` : ''}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            {[s.state, s.zip, s.island, s.site_type].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <button
                          onClick={() => startSiteEdit(s)}
                          style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', flexShrink: 0 }}
                        >
                          Edit
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {addingSite ? (
              <div style={{ padding: '12px', borderRadius: 10, border: '1.5px dashed #0f766e', marginTop: 8, marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div><label style={LBL}>Address</label><PlacesAutocomplete value={newSite.address_line_1} onChange={v => setNewSite(p => ({...p, address_line_1: v}))} onSelect={(place: ParsedPlace) => setNewSite(p => ({ ...p, address_line_1: place.formatted_address || '', city: place.city || p.city }))} style={INP} placeholder="Street address" /></div>
                  <div><label style={LBL}>City</label><input style={INP} value={newSite.city} onChange={e => setNewSite(p => ({ ...p, city: e.target.value }))} /></div>
                  <div><label style={LBL}>Island</label>
                    <select style={{ ...INP, cursor: 'pointer' }} value={newSite.island} onChange={e => setNewSite(p => ({ ...p, island: e.target.value }))}>
                      <option value="">Select island</option>
                      {ISLANDS.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div><label style={LBL}>Type</label>
                    <select style={{ ...INP, cursor: 'pointer' }} value={newSite.site_type} onChange={e => setNewSite(p => ({ ...p, site_type: e.target.value }))}>
                      {['OFFICE', 'JOBSITE', 'RESIDENCE', 'WAREHOUSE'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setAddingSite(false)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={addSite} style={{ flex: 2, padding: '7px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add Site</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingSite(true)} style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add Site</button>
            )}
            </CollapsibleSection>

            {/* Linked Work Orders */}
            <CollapsibleSection title="Linked Work Orders" count={detail.linkedWOs.length} open={!!openSections['linkedWOs']} onToggle={() => toggleSection('linkedWOs')}>
            {detail.linkedWOs.length === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>No linked work orders.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {detail.linkedWOs.map(wo => (
                    <div
                      key={wo.id}
                      onClick={() => onNavigate && onNavigate('workorders', { woId: wo.id })}
                      style={{
                        padding: '9px 12px', borderRadius: 9, border: '1px solid #f1f5f9',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontSize: 12, cursor: onNavigate ? 'pointer' : 'default',
                        background: 'white',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (onNavigate) e.currentTarget.style.background = '#f0fdfa'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{wo.name || wo.woNumber}</span>
                        <span style={{ color: '#94a3b8', marginLeft: 8 }}>{wo.woNumber}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {wo.island && <span style={{ fontSize: 10, color: '#94a3b8' }}>{wo.island}</span>}
                        <WOStatusBadge status={wo.status} />
                        {onNavigate && <span style={{ color: '#94a3b8', fontSize: 12 }}>→</span>}
                      </div>
                    </div>
                  ))}
            </div>
            </CollapsibleSection>

            {/* Linked Projects */}
            <CollapsibleSection title="Linked Projects" count={detail.linkedProjects.length} open={!!openSections['linkedProjects']} onToggle={() => toggleSection('linkedProjects')}>
            {detail.linkedProjects.length === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>No linked projects.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {detail.linkedProjects.map(p => (
                    <div key={p.kID} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <div>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{p.name}</span>
                        <span style={{ fontSize: 10, color: '#0891b2', marginLeft: 6 }}>{p.role}</span>
                      </div>
                      <span style={{ color: '#94a3b8' }}>{p.kID}</span>
                    </div>
                  ))}
            </div>
            </CollapsibleSection>
          </div>
        )}
      </div>
    </>
  );
}

// ── Phone formatter delegated to lib/normalize ──────────────────────────
// (formatPhone removed — use normalizePhone from @/lib/normalize)

// ── New Org Modal ────────────────────────────────────────────────────────
type OrgCategory = 'business' | 'person' | 'gc' | 'vendor';

const ORG_CATEGORIES: { id: OrgCategory; emoji: string; label: string; sublabel: string; types: string[]; entity_type: string }[] = [
  { id: 'business', emoji: '🏢', label: 'Business', sublabel: 'Hotel, retail, property, office', types: ['COMMERCIAL'], entity_type: 'COMPANY' },
  { id: 'person',   emoji: '🏠', label: 'Person / Homeowner', sublabel: 'Individual residential customer', types: ['RESIDENTIAL'], entity_type: 'INDIVIDUAL' },
  { id: 'gc',       emoji: '🔨', label: 'GC / Builder', sublabel: 'General contractor or builder', types: ['GC', 'COMMERCIAL'], entity_type: 'COMPANY' },
  { id: 'vendor',   emoji: '📦', label: 'Vendor / Supplier', sublabel: 'Materials, equipment, subcontractor', types: ['VENDOR'], entity_type: 'COMPANY' },
];

function NewOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: (organization: OrgRecord) => void }) {
  const [step, setStep] = useState<'category' | 'form'>('category');
  const [category, setCategory] = useState<OrgCategory | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState('');  // person only
  const [lastName, setLastName] = useState('');    // person only
  const [companyName, setCompanyName] = useState(''); // business/gc/vendor
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [island, setIsland] = useState('');
  const [isPropMgmt, setIsPropMgmt] = useState(false);
  const [isGovt, setIsGovt] = useState(false);
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [dupWarning, setDupWarning] = useState('');
  const [error, setError] = useState('');

  const cat = ORG_CATEGORIES.find(c => c.id === category);
  const isPersonal = category === 'person';

  // Derived org name
  const orgName = isPersonal
    ? [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
    : companyName.trim();

  function buildTypes(): string[] {
    const base = cat?.types || ['COMMERCIAL'];
    const extras: string[] = [];
    if (isPropMgmt) extras.push('PROPERTY_MGMT');
    if (isGovt) extras.push('GOVERNMENT');
    return [...new Set([...base, ...extras])];
  }

  // Duplicate check — fires on name blur
  async function checkDuplicate(checkName: string) {
    if (!checkName.trim()) return;
    try {
      const res = await fetch(`/api/organizations?q=${encodeURIComponent(checkName)}&limit=3`);
      if (!res.ok) return;
      const data = await res.json();
      const orgs: OrgRecord[] = data.organizations || [];
      const match = orgs.find(o => o.name.toLowerCase() === checkName.toLowerCase());
      if (match) setDupWarning(`A record named "${match.name}" already exists.`);
      else setDupWarning('');
    } catch { /* non-blocking */ }
  }

  async function create() {
    if (!orgName) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName,
          types: buildTypes(),
          entity_type: cat?.entity_type || 'COMPANY',
          island,
          notes,
          source: 'MANUAL_ENTRY',
          contact_name: (isPersonal ? orgName : contactName.trim()) || undefined,
          contact_phone: phone.trim() || undefined,
          contact_email: email.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.customer_id || !data.organization) {
        throw new Error('Customer was not created with a usable Customer_ID. Please try again or contact ops.');
      }
      onCreated(data.organization);
    } catch (err) {
      console.error('[NewOrgModal] create', err);
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setCreating(false);
    }
  }

  const INP: React.CSSProperties = {
    fontSize: 13, padding: '8px 12px', borderRadius: 9,
    border: '1px solid #e2e8f0', outline: 'none', background: 'white',
    width: '100%', boxSizing: 'border-box' as const,
  };
  const LBL: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 4, display: 'block',
  };
  const ROW2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(15,23,42,0.35)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 601, background: 'white', borderRadius: 20, padding: '24px',
        width: 'min(480px, calc(100vw - 32px))', boxShadow: '0 20px 60px rgba(15,23,42,0.2)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>

        {/* ── Step 1: Category picker ── */}
        {step === 'category' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>New Customer</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>What type of customer is this?</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {ORG_CATEGORIES.map(c => (
                <button key={c.id} onClick={() => { setCategory(c.id); setStep('form'); }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 6, padding: '20px 12px', borderRadius: 14, cursor: 'pointer',
                    border: '1.5px solid #e2e8f0', background: '#fafafa',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#0f766e'; (e.currentTarget as HTMLButtonElement).style.background = '#f0fdfa'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLButtonElement).style.background = '#fafafa'; }}
                >
                  <span style={{ fontSize: 28 }}>{c.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{c.label}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.3 }}>{c.sublabel}</span>
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </>
        )}

        {/* ── Step 2: Type-specific form ── */}
        {step === 'form' && cat && (
          <>
            <div style={{ marginBottom: 18 }}>
              <button onClick={() => setStep('category')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f766e', fontSize: 12, fontWeight: 700, padding: 0, marginBottom: 8 }}>← Back</button>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>
                {cat.emoji} New {cat.label}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{cat.sublabel}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Person: First + Last name fields */}
              {isPersonal && (
                <div style={ROW2}>
                  <div>
                    <label style={LBL}>First Name *</label>
                    <input style={INP} value={firstName} onChange={e => setFirstName(e.target.value)}
                      onBlur={() => checkDuplicate([firstName.trim(), lastName.trim()].filter(Boolean).join(' '))}
                      placeholder="Bob" autoFocus />
                  </div>
                  <div>
                    <label style={LBL}>Last Name *</label>
                    <input style={INP} value={lastName} onChange={e => setLastName(e.target.value)}
                      onBlur={() => checkDuplicate([firstName.trim(), lastName.trim()].filter(Boolean).join(' '))}
                      placeholder="Campbell" />
                  </div>
                </div>
              )}

              {/* Business/GC/Vendor: Company name */}
              {!isPersonal && (
                <div>
                  <label style={LBL}>Company Name *</label>
                  <input style={INP} value={companyName} onChange={e => setCompanyName(e.target.value)}
                    onBlur={() => checkDuplicate(companyName)}
                    placeholder={cat.id === 'gc' ? 'e.g. Nordic PCL Construction' : cat.id === 'vendor' ? 'e.g. Kawneer Hawaii' : 'e.g. Westin Maui Resort'}
                    autoFocus />
                </div>
              )}

              {/* Duplicate warning */}
              {dupWarning && (
                <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                  ⚠️ {dupWarning}
                </div>
              )}
              {error && (
                <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.4 }}>
                  {error}
                </div>
              )}

              {/* Phone + Email — side by side for person, stacked for business */}
              {isPersonal ? (
                <div style={ROW2}>
                  <div>
                    <label style={LBL}>Phone *</label>
                    <input style={INP} type="tel" value={phone}
                      onChange={e => setPhone(e.target.value)}
                      onBlur={e => setPhone(normalizePhone(e.target.value))}
                      placeholder="(808) 555-0199" />
                  </div>
                  <div>
                    <label style={LBL}>Email</label>
                    <input style={INP} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="bob@email.com" />
                  </div>
                </div>
              ) : (
                <>
                  <div style={ROW2}>
                    <div>
                      <label style={LBL}>Contact Person</label>
                      <input style={INP} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Name" />
                    </div>
                    <div>
                      <label style={LBL}>Phone</label>
                      <input style={INP} type="tel" value={phone}
                        onChange={e => setPhone(e.target.value)}
                        onBlur={e => setPhone(normalizePhone(e.target.value))}
                        placeholder="(808) 555-0000" />
                    </div>
                  </div>
                  <div>
                    <label style={LBL}>Email</label>
                    <input style={INP} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com" />
                  </div>
                </>
              )}

              {/* Address */}
              <div>
                <label style={LBL}>Address</label>
                <PlacesAutocomplete value={address} onChange={setAddress} onSelect={(place: ParsedPlace) => { setAddress(place.formatted_address || ''); if (place.island && !island) setIsland(place.island); }} style={INP} placeholder="Street address (optional)" />
              </div>

              {/* Island + optional subcategories */}
              <div style={ROW2}>
                <div>
                  <label style={LBL}>Island</label>
                  <select style={{ ...INP, cursor: 'pointer' }} value={island} onChange={e => setIsland(e.target.value)}>
                    <option value="">Select island</option>
                    {ISLANDS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                {category === 'business' && (
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6, paddingBottom: 2 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#475569' }}>
                      <input type="checkbox" checked={isPropMgmt} onChange={e => setIsPropMgmt(e.target.checked)} />
                      Property Mgmt
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#475569' }}>
                      <input type="checkbox" checked={isGovt} onChange={e => setIsGovt(e.target.checked)} />
                      Government
                    </label>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={LBL}>Notes</label>
                <textarea style={{ ...INP, resize: 'none', minHeight: 56 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes (optional)" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={create} disabled={!orgName || (isPersonal && !phone.trim()) || creating}
                style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', fontSize: 13, fontWeight: 800, cursor: (!orgName || (isPersonal && !phone.trim())) ? 'not-allowed' : 'pointer', opacity: (!orgName || (isPersonal && !phone.trim())) ? 0.6 : 1 }}>
                {creating ? 'Creating…' : isPersonal ? 'Create Customer' : `Create ${cat.label}`}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────
interface Props {
  onNavigate?: (view: string, params?: Record<string, string>) => void;
}

export default function OrganizationsPanel({ onNavigate }: Props) {
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [showNewOrg, setShowNewOrg] = useState(false);

  const load = useCallback(async (opts?: { nocache?: boolean }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (opts?.nocache) params.set('nocache', '1');
      const res = await fetch(`/api/organizations?${params}`);
      const data = await res.json();
      setOrgs(data.organizations || []);
      setTotal(data.total || (data.organizations || []).length);
    } catch (err) {
      console.error('[OrganizationsPanel] load', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Client-side filter (search + type chip)
  const filtered = orgs.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q || q.length < 2 ||
      o.name.toLowerCase().includes(q) ||
      (o.primary_contact?.name || o.contactPerson || '').toLowerCase().includes(q);
    const matchType = typeFilter === 'ALL' || o.types.includes(typeFilter);
    return matchSearch && matchType;
  });

  // Sort: orgs with woCount > 0 first (desc), then alpha
  const sorted = [...filtered].sort((a, b) => {
    if (b.woCount !== a.woCount) return b.woCount - a.woCount;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Left — list */}
      <div style={{
        width: selectedOrgId ? '38%' : '100%',
        maxWidth: selectedOrgId ? 420 : undefined,
        display: 'flex', flexDirection: 'column', borderRight: selectedOrgId ? '1px solid #f1f5f9' : 'none',
        overflow: 'hidden', flexShrink: 0,
        transition: 'width 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>People</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' }}>Organizations</div>
            <button
              onClick={() => setShowNewOrg(true)}
              style={{ padding: '7px 14px', borderRadius: 9, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + New Org
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
            {loading ? 'Loading…' : `${sorted.length} of ${total} organizations`}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or contact…"
            style={{
              fontSize: 13, padding: '8px 12px', borderRadius: 10,
              border: '1px solid #e2e8f0', outline: 'none', background: 'white',
              width: '100%', boxSizing: 'border-box', marginBottom: 10,
            }}
          />

          {/* Type chips */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              onClick={() => setTypeFilter('ALL')}
              style={{
                fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                border: typeFilter === 'ALL' ? '1.5px solid #0f766e' : '1px solid #e2e8f0',
                background: typeFilter === 'ALL' ? '#f0fdfa' : 'white',
                color: typeFilter === 'ALL' ? '#0f766e' : '#94a3b8',
              }}>All</button>
            {ALL_TYPES.map(t => {
              const active = typeFilter === t;
              const c = TYPE_COLORS[t] || { color: '#64748b', bg: '#f8fafc' };
              return (
                <button key={t}
                  onClick={() => setTypeFilter(active ? 'ALL' : t)}
                  style={{
                    fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                    border: active ? `1.5px solid ${c.color}` : '1px solid #e2e8f0',
                    background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8',
                  }}>
                  {FILTER_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Org rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading organizations…</div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No organizations match this filter.</div>
          ) : (
            sorted.map(o => {
              const isSelected = o.org_id === selectedOrgId;
              const displayIsland = o.island || o.default_island || o.primary_site?.island || '';
              return (
                <div
                  key={o.org_id}
                  onClick={() => setSelectedOrgId(isSelected ? null : o.org_id)}
                  style={{
                    padding: '10px 12px', borderRadius: 10, marginBottom: 3, cursor: 'pointer',
                    border: isSelected ? '1.5px solid #0f766e' : '1px solid transparent',
                    background: isSelected ? '#f0fdfa' : 'white',
                    transition: 'background 0.1s, border 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'white'; }}
                >
                  {/* Row top: name + WO count */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', lineHeight: 1.3, flex: 1, minWidth: 0, marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.name}
                    </div>
                    {o.woCount > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', flexShrink: 0 }}>
                        {o.woCount} WO{o.woCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {/* Row bottom: badges + island */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {o.types.slice(0, 3).map(t => <TypeBadge key={t} type={t} />)}
                    {displayIsland && (
                      <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 2 }}>{displayIsland}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right — detail */}
      {selectedOrgId && (
        <OrgDetailPanel
          orgId={selectedOrgId}
          onClose={() => setSelectedOrgId(null)}
          onNavigate={onNavigate}
          orgOptions={orgs}
          onChanged={() => load({ nocache: true })}
        />
      )}

      {/* New Org Modal */}
      {showNewOrg && (
        <NewOrgModal
          onClose={() => setShowNewOrg(false)}
          onCreated={(organization) => {
            setShowNewOrg(false);
            setTypeFilter('ALL');
            setSearch(organization.name);
            setSelectedOrgId(organization.org_id);
            setOrgs(prev => {
              const withoutDuplicate = prev.filter(o => o.org_id !== organization.org_id);
              return [organization, ...withoutDuplicate];
            });
            setTotal(prev => prev + (orgs.some(o => o.org_id === organization.org_id) ? 0 : 1));
            load({ nocache: true });
          }}
        />
      )}
    </div>
  );
}
