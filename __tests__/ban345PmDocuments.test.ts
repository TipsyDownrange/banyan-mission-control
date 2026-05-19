/**
 * BAN-345 PM-V1.0-F — Document Hub unit tests.
 *
 * Targets the pure-library logic + migration / contract shape.  Route
 * integration tests live in ban345PmDocumentsRoutes.test.ts.
 */

import fs from 'fs';
import path from 'path';

import {
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  isActivitySpineEventType,
  validateActivitySpinePayload,
} from '@/lib/activity-spine/event-contract';
import {
  DOCUMENT_KINDS,
  DOCUMENT_LINKED_ENTITY_TYPES,
  DOCUMENT_KIND_DEFAULT_LINK,
  DOCUMENT_KIND_DRIVE_SLUG,
  FILENAME_MAX,
  canonicalDriveFolderPath,
  isDocumentKind,
  isDocumentLinkedEntityType,
} from '@/lib/pm/documents/types';
import {
  isPatchField,
  isUuid,
  optionalString,
  parseDocumentKind,
  parseDocumentLinkedEntityType,
  trimString,
  validateLinkedEntity,
} from '@/lib/pm/documents/route-utils';
import { roleMayWriteKind } from '@/lib/pm/documents/api-gate';

describe('BAN-345 document kind enum', () => {
  it('defines the 17 canonical kinds', () => {
    expect(DOCUMENT_KINDS).toEqual([
      'CONTRACT',
      'SHOP_DRAWING',
      'SUBMITTAL_PACKAGE',
      'RFI_TRANSMITTAL',
      'CO_DOCUMENT',
      'PAY_APP_PDF',
      'NOC',
      'LIEN_WAIVER',
      'PUNCH_LIST',
      'WARRANTY_LETTER',
      'AS_BUILT',
      'OM_MANUAL',
      'SPEC_BOOK',
      'PHOTO_PACKAGE',
      'EMAIL_THREAD',
      'SCHEDULE_VERSION',
      'OTHER',
    ]);
    expect(DOCUMENT_KINDS).toHaveLength(17);
  });

  it('defines the 15 canonical linked-entity types', () => {
    expect(DOCUMENT_LINKED_ENTITY_TYPES).toEqual([
      'SUBMITTAL',
      'RFI',
      'CO',
      'PAY_APP',
      'PUNCH_LIST_ITEM',
      'VERBAL_AGREEMENT',
      'MEETING',
      'WARRANTY_CLAIM',
      'SCHEDULE_VERSION',
      'SCHEDULE_ACTIVITY',
      'TM_TICKET',
      'EXTERNAL_WAIVER',
      'FIELD_EVENT',
      'ACTION_ITEM',
      'OTHER',
    ]);
    expect(DOCUMENT_LINKED_ENTITY_TYPES).toHaveLength(15);
  });

  it('caps filename at 500 characters', () => {
    expect(FILENAME_MAX).toBe(500);
  });

  it('type guards reject unknown values', () => {
    expect(isDocumentKind('CONTRACT')).toBe(true);
    expect(isDocumentKind('XYZ')).toBe(false);
    expect(isDocumentLinkedEntityType('RFI')).toBe(true);
    expect(isDocumentLinkedEntityType('UNKNOWN_TYPE')).toBe(false);
  });

  it('provides a Drive folder slug for every kind', () => {
    for (const k of DOCUMENT_KINDS) {
      expect(DOCUMENT_KIND_DRIVE_SLUG[k]).toBeTruthy();
    }
  });

  it('canonicalDriveFolderPath nests under /Projects/{kID}/Documents/{slug}/', () => {
    expect(canonicalDriveFolderPath('PRJ-26-0001', 'CONTRACT'))
      .toBe('/Projects/PRJ-26-0001/Documents/Contracts/');
    expect(canonicalDriveFolderPath('PRJ-26-0001', 'PHOTO_PACKAGE'))
      .toBe('/Projects/PRJ-26-0001/Documents/Photos/');
  });

  it('suggests reasonable default link types for kind→entity', () => {
    expect(DOCUMENT_KIND_DEFAULT_LINK.SUBMITTAL_PACKAGE).toBe('SUBMITTAL');
    expect(DOCUMENT_KIND_DEFAULT_LINK.RFI_TRANSMITTAL).toBe('RFI');
    expect(DOCUMENT_KIND_DEFAULT_LINK.CO_DOCUMENT).toBe('CO');
    expect(DOCUMENT_KIND_DEFAULT_LINK.PAY_APP_PDF).toBe('PAY_APP');
  });
});

describe('BAN-345 route-utils parsers', () => {
  it('trimString returns empty for non-strings', () => {
    expect(trimString('  hi ')).toBe('hi');
    expect(trimString(undefined)).toBe('');
    expect(trimString(123)).toBe('');
  });

  it('optionalString collapses blanks to null', () => {
    expect(optionalString(' x ')).toBe('x');
    expect(optionalString('   ')).toBeNull();
    expect(optionalString(undefined)).toBeNull();
  });

  it('parseDocumentKind rejects unknown values', () => {
    expect(parseDocumentKind('SHOP_DRAWING')).toBe('SHOP_DRAWING');
    expect(parseDocumentKind('NONEXISTENT')).toBeNull();
    expect(parseDocumentKind(null)).toBeNull();
  });

  it('parseDocumentLinkedEntityType rejects unknown values', () => {
    expect(parseDocumentLinkedEntityType('MEETING')).toBe('MEETING');
    expect(parseDocumentLinkedEntityType('FOO')).toBeNull();
  });

  it('isUuid validates standard uuid form', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('isPatchField gates allowed updates', () => {
    expect(isPatchField('filename')).toBe(true);
    expect(isPatchField('subkind')).toBe(true);
    expect(isPatchField('linked_entity_type')).toBe(true);
    expect(isPatchField('linked_entity_id')).toBe(true);
    expect(isPatchField('external_visible')).toBe(true);
    expect(isPatchField('notes')).toBe(true);
    // Forbidden direct mutations
    expect(isPatchField('kind')).toBe(false);
    expect(isPatchField('drive_file_id')).toBe(false);
    expect(isPatchField('version')).toBe(false);
    expect(isPatchField('superseded_by_document_id')).toBe(false);
    expect(isPatchField('tenant_id')).toBe(false);
  });

  it('validateLinkedEntity accepts both-null and both-present pairs', () => {
    expect(validateLinkedEntity(null, null)).toBeNull();
    expect(validateLinkedEntity('SUBMITTAL', '11111111-1111-4111-8111-111111111111')).toBeNull();
  });

  it('validateLinkedEntity rejects half-pairs', () => {
    expect(validateLinkedEntity('SUBMITTAL', null)).not.toBeNull();
    expect(validateLinkedEntity(null, '11111111-1111-4111-8111-111111111111')).not.toBeNull();
  });

  it('validateLinkedEntity rejects bogus type/id', () => {
    expect(validateLinkedEntity('NOT_A_TYPE', '11111111-1111-4111-8111-111111111111')).not.toBeNull();
    expect(validateLinkedEntity('SUBMITTAL', 'not-a-uuid')).not.toBeNull();
  });
});

describe('BAN-345 role write-gate restrictions', () => {
  it('field_super may only upload PHOTO_PACKAGE', () => {
    expect(roleMayWriteKind('field_super', 'PHOTO_PACKAGE')).toBe(true);
    expect(roleMayWriteKind('field_super', 'CONTRACT')).toBe(false);
    expect(roleMayWriteKind('field_super', 'SHOP_DRAWING')).toBe(false);
  });

  it('pm / admin roles may upload any kind', () => {
    for (const k of DOCUMENT_KINDS) {
      expect(roleMayWriteKind('pm', k)).toBe(true);
      expect(roleMayWriteKind('business_admin', k)).toBe(true);
      expect(roleMayWriteKind('super_admin', k)).toBe(true);
      expect(roleMayWriteKind('catalog_admin', k)).toBe(true);
    }
  });
});

describe('BAN-345 Activity Spine registration', () => {
  it('registers DOCUMENT_UPLOADED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('DOCUMENT_UPLOADED');
    expect(isActivitySpineEventType('DOCUMENT_UPLOADED')).toBe(true);
  });

  it('registers DOCUMENT_LINKED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('DOCUMENT_LINKED');
    expect(isActivitySpineEventType('DOCUMENT_LINKED')).toBe(true);
  });

  it('registers DOCUMENT_SUPERSEDED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('DOCUMENT_SUPERSEDED');
    expect(isActivitySpineEventType('DOCUMENT_SUPERSEDED')).toBe(true);
  });

  it('does not enforce Pattern B payload fields for DOCUMENT_* events', () => {
    expect(validateActivitySpinePayload('DOCUMENT_UPLOADED', {}).ok).toBe(true);
    expect(validateActivitySpinePayload('DOCUMENT_LINKED', {}).ok).toBe(true);
    expect(validateActivitySpinePayload('DOCUMENT_SUPERSEDED', {}).ok).toBe(true);
  });
});

describe('BAN-345 migration shape (0026_ban345_document_hub.sql)', () => {
  const migrationPath = path.join(process.cwd(), 'db/migrations/0026_ban345_document_hub.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('creates the document_hub_entries table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.document_hub_entries');
  });

  it('creates the document_kind and document_linked_entity_type enums', () => {
    expect(sql).toContain("CREATE TYPE public.document_kind AS ENUM");
    expect(sql).toContain("CREATE TYPE public.document_linked_entity_type AS ENUM");
  });

  it('enumerates all 17 document kinds', () => {
    for (const k of DOCUMENT_KINDS) {
      expect(sql).toContain(`'${k}'`);
    }
  });

  it('enumerates all 15 linked entity types', () => {
    for (const t of DOCUMENT_LINKED_ENTITY_TYPES) {
      expect(sql).toContain(`'${t}'`);
    }
  });

  it('makes engagement_id nullable (cross-project / internal docs allowed)', () => {
    const tableBlock = sql.match(/CREATE TABLE IF NOT EXISTS public\.document_hub_entries[\s\S]*?\);/);
    expect(tableBlock).not.toBeNull();
    expect(tableBlock![0]).toMatch(/engagement_id uuid REFERENCES public\.engagements/);
    expect(tableBlock![0]).not.toMatch(/engagement_id uuid NOT NULL/);
  });

  it('makes drive_file_id NOT NULL and filename NOT NULL', () => {
    const tableBlock = sql.match(/CREATE TABLE IF NOT EXISTS public\.document_hub_entries[\s\S]*?\);/);
    expect(tableBlock).not.toBeNull();
    expect(tableBlock![0]).toMatch(/drive_file_id text NOT NULL/);
    expect(tableBlock![0]).toMatch(/filename text NOT NULL/);
  });

  it('uses a generated is_current column tied to superseded_by_document_id', () => {
    expect(sql).toMatch(/is_current boolean GENERATED ALWAYS AS \(superseded_by_document_id IS NULL\) STORED/);
  });

  it('enforces filename length cap of 500', () => {
    expect(sql).toContain('document_hub_entries_filename_length');
    expect(sql).toContain('char_length(filename) <= 500');
  });

  it('enforces linked-entity consistency (both or neither)', () => {
    expect(sql).toContain('document_hub_entries_linked_entity_consistency');
  });

  it('creates the canonical indexes', () => {
    expect(sql).toContain('idx_document_hub_tenant_kid');
    expect(sql).toContain('idx_document_hub_tenant_engagement_kind');
    expect(sql).toContain('idx_document_hub_linked_entity');
    expect(sql).toContain('idx_document_hub_tenant_current');
    expect(sql).toContain('idx_document_hub_drive_file');
  });

  it('partial indexes filter on is_current and linked_entity_type', () => {
    expect(sql).toMatch(/WHERE is_current = true/);
    expect(sql).toMatch(/WHERE linked_entity_type IS NOT NULL/);
  });

  it('extends the BAN-293 field_events CHECK with DOCUMENT_* events', () => {
    expect(sql).toContain("'DOCUMENT_UPLOADED'");
    expect(sql).toContain("'DOCUMENT_LINKED'");
    expect(sql).toContain("'DOCUMENT_SUPERSEDED'");
  });

  it('preserves prior canon (MEETING_LOGGED, ACTION_ITEM_CREATED, etc.) in the CHECK rewrite', () => {
    expect(sql).toContain("'MEETING_LOGGED'");
    expect(sql).toContain("'ACTION_ITEM_CREATED'");
    expect(sql).toContain("'RFI_STATE_CHANGED'");
    expect(sql).toContain("'SUBMITTAL_STATE_CHANGED'");
  });
});
