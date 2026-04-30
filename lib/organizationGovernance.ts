import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import {
  buildCrosswalkDiagnostics,
  ensureEntityCrosswalkSheet,
  findCrosswalkMismatches,
  loadCrosswalkEntries,
  normalizeCrosswalkSource,
  type CrosswalkEntry,
} from '@/lib/entityCrosswalk';

export const ORGANIZATION_RELATIONSHIPS_TAB = 'Organization_Relationships';
export const ENTITY_MIGRATION_AUDIT_LOG_TAB = 'Entity_Migration_Audit_Log';

export const ORGANIZATION_RELATIONSHIP_HEADERS = [
  'relationship_id',
  'source_org_id',
  'target_org_id',
  'relationship_type',
  'notes',
  'created_at',
  'updated_at',
];

export const ENTITY_MIGRATION_AUDIT_LOG_HEADERS = [
  'timestamp',
  'actor',
  'action',
  'source_org_id',
  'survivor_org_id',
  'affected_work_orders_count',
  'affected_contacts_count',
  'affected_sites_count',
  'affected_crosswalk_count',
  'before_json',
  'after_json',
  'notes',
];

const SHEET_ID = getBackendSheetId();

const ORG_COL = {
  org_id: 0,
  name: 1,
  types: 2,
  entity_type: 3,
  default_island: 4,
  tax_id: 5,
  payment_terms: 6,
  avg_days_to_pay: 7,
  notes: 8,
  source: 9,
  created_at: 10,
  updated_at: 11,
  status: 12,
  merged_into_org_id: 13,
  merged_at: 14,
  merged_by: 15,
};

type SheetsClient = ReturnType<typeof google.sheets>;
type SheetRow = string[];

export type OrganizationRelationshipType =
  | 'billing_account'
  | 'property'
  | 'operator'
  | 'owner_hoa'
  | 'property_manager'
  | 'alias'
  | 'other';

export type OrganizationRelationship = {
  relationship_id: string;
  source_org_id: string;
  target_org_id: string;
  relationship_type: OrganizationRelationshipType;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type MergePreview = {
  source_org_id: string;
  survivor_org_id: string;
  source_org_name: string;
  survivor_org_name: string;
  can_execute: boolean;
  blockers: string[];
  affected: {
    work_orders: Array<{ wo_id: string; wo_number: string; name: string; row: number }>;
    contacts: Array<{ contact_id: string; name: string; row: number }>;
    sites: Array<{ site_id: string; name: string; address: string; row: number }>;
    crosswalk: Array<{ customer_id: string; org_id: string; row: number }>;
    projects: Array<{ kID: string; name: string; role: string; row: number; column: string }>;
  };
  counts: {
    work_orders: number;
    contacts: number;
    sites: number;
    crosswalk: number;
    projects: number;
  };
  crosswalk_mismatches_after_merge: ReturnType<typeof findCrosswalkMismatches>;
};

function colLetter(idx: number): string {
  let result = '';
  let n = idx;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 18)}`;
}

function clean(value: unknown): string {
  return String(value || '').trim();
}

function relationshipType(value: unknown): OrganizationRelationshipType {
  const candidate = clean(value);
  if (
    candidate === 'billing_account' ||
    candidate === 'property' ||
    candidate === 'operator' ||
    candidate === 'owner_hoa' ||
    candidate === 'property_manager' ||
    candidate === 'alias' ||
    candidate === 'other'
  ) return candidate;
  return 'other';
}

function rowToRelationship(row: SheetRow): OrganizationRelationship {
  return {
    relationship_id: clean(row[0]),
    source_org_id: clean(row[1]),
    target_org_id: clean(row[2]),
    relationship_type: relationshipType(row[3]),
    notes: clean(row[4]),
    created_at: clean(row[5]),
    updated_at: clean(row[6]),
  };
}

export function getOrganizationGovernanceSheets(readonly = false) {
  const auth = getGoogleAuth([
    readonly
      ? 'https://www.googleapis.com/auth/spreadsheets.readonly'
      : 'https://www.googleapis.com/auth/spreadsheets',
  ]);
  return google.sheets({ version: 'v4', auth });
}

async function ensureTabWithHeaders(
  sheets: SheetsClient,
  tab: string,
  headers: string[],
): Promise<'created' | 'verified'> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = (meta.data.sheets || []).some(sheet => sheet.properties?.title === tab);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tab, gridProperties: { columnCount: headers.length } } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A1:${colLetter(headers.length - 1)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    return 'created';
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A1:${colLetter(headers.length - 1)}1`,
  });
  const header = headerRes.data.values?.[0] || [];
  const hasAnyHeader = header.some(Boolean);
  const matches = headers.every((expected, idx) => header[idx] === expected);
  if (!matches && hasAnyHeader) {
    throw new Error(`${tab} headers do not match expected schema. Refusing to overwrite existing headers.`);
  }
  if (!matches) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A1:${colLetter(headers.length - 1)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
  return 'verified';
}

export async function ensureOrganizationGovernanceSheets(sheets: SheetsClient) {
  const [relationships, auditLog] = await Promise.all([
    ensureTabWithHeaders(sheets, ORGANIZATION_RELATIONSHIPS_TAB, ORGANIZATION_RELATIONSHIP_HEADERS),
    ensureTabWithHeaders(sheets, ENTITY_MIGRATION_AUDIT_LOG_TAB, ENTITY_MIGRATION_AUDIT_LOG_HEADERS),
  ]);
  return { relationships, auditLog };
}

async function loadOrganizations(sheets: SheetsClient): Promise<Array<{ row: number; values: SheetRow }>> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Organizations!A2:P5000',
  });
  return ((res.data.values || []) as SheetRow[])
    .map((values, idx) => ({ row: idx + 2, values }))
    .filter(({ values }) => clean(values[ORG_COL.org_id]));
}

function orgSummary(row: SheetRow) {
  return {
    org_id: clean(row[ORG_COL.org_id]),
    name: clean(row[ORG_COL.name]),
    types: clean(row[ORG_COL.types]),
    entity_type: clean(row[ORG_COL.entity_type]),
    notes: clean(row[ORG_COL.notes]),
    status: clean(row[ORG_COL.status]),
    merged_into_org_id: clean(row[ORG_COL.merged_into_org_id]),
    merged_at: clean(row[ORG_COL.merged_at]),
    merged_by: clean(row[ORG_COL.merged_by]),
  };
}

function proposedCrosswalkEntries(entries: CrosswalkEntry[], sourceOrgId: string, survivorOrgId: string): CrosswalkEntry[] {
  return entries.map(entry => entry.org_id === sourceOrgId ? { ...entry, org_id: survivorOrgId } : entry);
}

export async function buildOrganizationMergePreview(
  sheets: SheetsClient,
  sourceOrgId: string,
  survivorOrgId: string,
): Promise<MergePreview> {
  const source = clean(sourceOrgId);
  const survivor = clean(survivorOrgId);
  const blockers: string[] = [];

  if (!source) blockers.push('source_org_id required');
  if (!survivor) blockers.push('survivor_org_id required');
  if (source && survivor && source === survivor) blockers.push('Source and survivor org IDs must be different.');

  await ensureEntityCrosswalkSheet(sheets);
  const [orgs, contactsRes, sitesRes, woRes, crosswalkRes, entityRes] = await Promise.all([
    loadOrganizations(sheets),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Contacts!A2:J5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Sites!A2:M5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:AU5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Entity_Crosswalk!A2:E5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Core_Entities!A2:L5000' }),
  ]);
  const crosswalkRows = (crosswalkRes.data.values || []) as SheetRow[];
  const crosswalkEntries: CrosswalkEntry[] = crosswalkRows
    .map(row => ({
      customer_id: clean(row[0]),
      org_id: clean(row[1]),
      source: normalizeCrosswalkSource(row[2]),
      confidence: clean(row[3]),
      updated_at: clean(row[4]),
    }))
    .filter(entry => entry.customer_id && entry.org_id);

  const sourceOrg = orgs.find(org => clean(org.values[ORG_COL.org_id]) === source);
  const survivorOrg = orgs.find(org => clean(org.values[ORG_COL.org_id]) === survivor);
  if (source && !sourceOrg) blockers.push(`Source org ${source} does not exist.`);
  if (survivor && !survivorOrg) blockers.push(`Survivor org ${survivor} does not exist.`);

  const contacts = ((contactsRes.data.values || []) as SheetRow[])
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => clean(row[1]) === source)
    .map(({ row, idx }) => ({ contact_id: clean(row[0]), name: clean(row[2]), row: idx + 2 }));

  const sites = ((sitesRes.data.values || []) as SheetRow[])
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => clean(row[1]) === source)
    .map(({ row, idx }) => ({
      site_id: clean(row[0]),
      name: clean(row[2]),
      address: [clean(row[3]), clean(row[5])].filter(Boolean).join(', '),
      row: idx + 2,
    }));

  const workOrders = ((woRes.data.values || []) as SheetRow[])
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => clean(row[42]) === source)
    .map(({ row, idx }) => ({ wo_id: clean(row[0]), wo_number: clean(row[1]), name: clean(row[2]), row: idx + 2 }));

  const crosswalk = crosswalkRows
    .map((row, idx) => ({
      entry: { customer_id: clean(row[0]), org_id: clean(row[1]) },
      row: idx + 2,
    }))
    .filter(({ entry }) => entry.customer_id && entry.org_id === source)
    .map(({ entry, row }) => ({ customer_id: entry.customer_id, org_id: entry.org_id, row }));

  const projectRoles = [
    { idx: 9, role: 'GC', column: 'J' },
    { idx: 10, role: 'Owner', column: 'K' },
    { idx: 11, role: 'Architect', column: 'L' },
  ];
  const projects = ((entityRes.data.values || []) as SheetRow[])
    .flatMap((row, idx) => projectRoles
      .filter(role => clean(row[role.idx]) === source)
      .map(role => ({
        kID: clean(row[0]),
        name: clean(row[2]),
        role: role.role,
        row: idx + 2,
        column: role.column,
      })));

  const crosswalkMismatchesAfterMerge = findCrosswalkMismatches(proposedCrosswalkEntries(crosswalkEntries, source, survivor));
  if (crosswalkMismatchesAfterMerge.length > 0) {
    blockers.push('Crosswalk mismatches would remain after this merge. Resolve crosswalk conflicts first.');
  }

  return {
    source_org_id: source,
    survivor_org_id: survivor,
    source_org_name: sourceOrg ? clean(sourceOrg.values[ORG_COL.name]) : '',
    survivor_org_name: survivorOrg ? clean(survivorOrg.values[ORG_COL.name]) : '',
    can_execute: blockers.length === 0,
    blockers,
    affected: {
      work_orders: workOrders,
      contacts,
      sites,
      crosswalk,
      projects,
    },
    counts: {
      work_orders: workOrders.length,
      contacts: contacts.length,
      sites: sites.length,
      crosswalk: crosswalk.length,
      projects: projects.length,
    },
    crosswalk_mismatches_after_merge: crosswalkMismatchesAfterMerge,
  };
}

export async function executeOrganizationMerge(
  sheets: SheetsClient,
  sourceOrgId: string,
  survivorOrgId: string,
  actor: string,
  notes = '',
) {
  await ensureOrganizationGovernanceSheets(sheets);
  const preview = await buildOrganizationMergePreview(sheets, sourceOrgId, survivorOrgId);
  if (!preview.can_execute) {
    const error = new Error(preview.blockers.join(' '));
    error.name = 'MergeBlockedError';
    throw error;
  }

  const orgs = await loadOrganizations(sheets);
  const sourceOrg = orgs.find(org => clean(org.values[ORG_COL.org_id]) === preview.source_org_id);
  if (!sourceOrg) throw new Error(`Source org ${preview.source_org_id} does not exist.`);

  const now = new Date().toISOString();
  const updates = [
    ...preview.affected.contacts.map(item => ({ range: `Contacts!B${item.row}`, values: [[preview.survivor_org_id]] })),
    ...preview.affected.sites.map(item => ({ range: `Sites!B${item.row}`, values: [[preview.survivor_org_id]] })),
    ...preview.affected.work_orders.map(item => ({ range: `Service_Work_Orders!AQ${item.row}`, values: [[preview.survivor_org_id]] })),
    ...preview.affected.crosswalk.map(item => ({ range: `Entity_Crosswalk!B${item.row}`, values: [[preview.survivor_org_id]] })),
    ...preview.affected.projects.map(item => ({ range: `Core_Entities!${item.column}${item.row}`, values: [[preview.survivor_org_id]] })),
    { range: `Organizations!M${sourceOrg.row}:P${sourceOrg.row}`, values: [['merged', preview.survivor_org_id, now, actor || 'system']] },
    { range: `Organizations!L${sourceOrg.row}`, values: [[now]] },
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'RAW', data: updates },
  });

  const verifyPreview = await buildOrganizationMergePreview(sheets, preview.source_org_id, preview.survivor_org_id);
  const entries = await loadCrosswalkEntries(sheets);
  const diagnostics = await buildCrosswalkDiagnostics(sheets, entries);
  const afterJson = {
    source_org_id: preview.source_org_id,
    survivor_org_id: preview.survivor_org_id,
    remaining_active_references: verifyPreview.counts,
    crosswalk_diagnostics: diagnostics,
  };

  await appendAuditLog(sheets, {
    timestamp: now,
    actor: actor || 'system',
    action: 'organization_merge',
    source_org_id: preview.source_org_id,
    survivor_org_id: preview.survivor_org_id,
    affected_work_orders_count: String(preview.counts.work_orders),
    affected_contacts_count: String(preview.counts.contacts),
    affected_sites_count: String(preview.counts.sites),
    affected_crosswalk_count: String(preview.counts.crosswalk),
    before_json: JSON.stringify({ preview, source_org: orgSummary(sourceOrg.values) }),
    after_json: JSON.stringify(afterJson),
    notes,
  });

  return { preview, verification: afterJson, diagnostics };
}

async function appendAuditLog(
  sheets: SheetsClient,
  row: Record<(typeof ENTITY_MIGRATION_AUDIT_LOG_HEADERS)[number], string>,
) {
  await ensureTabWithHeaders(sheets, ENTITY_MIGRATION_AUDIT_LOG_TAB, ENTITY_MIGRATION_AUDIT_LOG_HEADERS);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${ENTITY_MIGRATION_AUDIT_LOG_TAB}!A:L`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [ENTITY_MIGRATION_AUDIT_LOG_HEADERS.map(header => row[header] || '')],
    },
  });
}

export async function listOrganizationRelationships(
  sheets: SheetsClient,
  orgId: string,
): Promise<OrganizationRelationship[]> {
  await ensureOrganizationGovernanceSheets(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${ORGANIZATION_RELATIONSHIPS_TAB}!A2:G5000`,
  });
  const cleanOrgId = clean(orgId);
  return ((res.data.values || []) as SheetRow[])
    .map(rowToRelationship)
    .filter(rel => rel.relationship_id && (rel.source_org_id === cleanOrgId || rel.target_org_id === cleanOrgId));
}

export async function saveOrganizationRelationship(
  sheets: SheetsClient,
  input: {
    source_org_id: string;
    target_org_id: string;
    relationship_type: unknown;
    notes?: string;
    actor?: string;
    relationship_id?: string;
  },
) {
  await ensureOrganizationGovernanceSheets(sheets);
  const source = clean(input.source_org_id);
  const target = clean(input.target_org_id);
  if (!source) throw new Error('source_org_id required');
  if (!target) throw new Error('target_org_id required');
  if (source === target) throw new Error('Related organizations must be different records.');

  const orgs = await loadOrganizations(sheets);
  if (!orgs.some(org => clean(org.values[ORG_COL.org_id]) === source)) throw new Error(`Source org ${source} does not exist.`);
  if (!orgs.some(org => clean(org.values[ORG_COL.org_id]) === target)) throw new Error(`Target org ${target} does not exist.`);

  const now = new Date().toISOString();
  const type = relationshipType(input.relationship_type);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${ORGANIZATION_RELATIONSHIPS_TAB}!A2:G5000`,
  });
  const rows = (res.data.values || []) as SheetRow[];
  const existingIdx = input.relationship_id
    ? rows.findIndex(row => clean(row[0]) === clean(input.relationship_id))
    : rows.findIndex(row => clean(row[1]) === source && clean(row[2]) === target && clean(row[3]) === type);
  const existing = existingIdx >= 0 ? rowToRelationship(rows[existingIdx]) : null;
  const relationship: OrganizationRelationship = {
    relationship_id: existing?.relationship_id || newId('rel'),
    source_org_id: source,
    target_org_id: target,
    relationship_type: type,
    notes: clean(input.notes),
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  const values = [[
    relationship.relationship_id,
    relationship.source_org_id,
    relationship.target_org_id,
    relationship.relationship_type,
    relationship.notes,
    relationship.created_at,
    relationship.updated_at,
  ]];

  if (existingIdx >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${ORGANIZATION_RELATIONSHIPS_TAB}!A${existingIdx + 2}:G${existingIdx + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${ORGANIZATION_RELATIONSHIPS_TAB}!A:G`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  }

  await appendAuditLog(sheets, {
    timestamp: now,
    actor: input.actor || 'system',
    action: existing ? 'organization_relationship_update' : 'organization_relationship_create',
    source_org_id: source,
    survivor_org_id: target,
    affected_work_orders_count: '0',
    affected_contacts_count: '0',
    affected_sites_count: '0',
    affected_crosswalk_count: '0',
    before_json: JSON.stringify(existing || null),
    after_json: JSON.stringify(relationship),
    notes: relationship.notes,
  });

  return relationship;
}
