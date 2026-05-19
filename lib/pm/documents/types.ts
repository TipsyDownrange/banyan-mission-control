/**
 * BAN-345 PM-V1.0-F — Document Hub canonical enumerations.
 *
 * PM Trunk v1.0 §10.  Central document repository with manual kind tagging.
 * Kai integration is OPTIONAL (Charter Amendment 2): manual upload + manual
 * kind tagging is the default; Kai may auto-classify in Enhanced mode but
 * manual mode always works without it.
 */

export const DOCUMENT_KINDS = [
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
] as const;

export type DocumentKind = typeof DOCUMENT_KINDS[number];

export const DOCUMENT_LINKED_ENTITY_TYPES = [
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
] as const;

export type DocumentLinkedEntityType = typeof DOCUMENT_LINKED_ENTITY_TYPES[number];

export const FILENAME_MAX = 500;

// Drive folder slug per kind — used to build /Projects/{kID}/Documents/{slug}/
// path strings.  Pure mapping; the Drive uploader consumes these values.
export const DOCUMENT_KIND_DRIVE_SLUG: Record<DocumentKind, string> = {
  CONTRACT: 'Contracts',
  SHOP_DRAWING: 'Shop Drawings',
  SUBMITTAL_PACKAGE: 'Submittals',
  RFI_TRANSMITTAL: 'RFIs',
  CO_DOCUMENT: 'Change Orders',
  PAY_APP_PDF: 'Pay Apps',
  NOC: 'Notices of Completion',
  LIEN_WAIVER: 'Lien Waivers',
  PUNCH_LIST: 'Punch Lists',
  WARRANTY_LETTER: 'Warranty Letters',
  AS_BUILT: 'As-Builts',
  OM_MANUAL: 'O&M Manuals',
  SPEC_BOOK: 'Spec Books',
  PHOTO_PACKAGE: 'Photos',
  EMAIL_THREAD: 'Email Threads',
  SCHEDULE_VERSION: 'Schedule Versions',
  OTHER: 'Other',
};

// Default linked_entity_type suggestions per kind — Kai may pre-fill these in
// Enhanced mode; manual mode shows them as defaults but PM can override.
export const DOCUMENT_KIND_DEFAULT_LINK: Partial<Record<DocumentKind, DocumentLinkedEntityType>> = {
  SUBMITTAL_PACKAGE: 'SUBMITTAL',
  RFI_TRANSMITTAL: 'RFI',
  CO_DOCUMENT: 'CO',
  PAY_APP_PDF: 'PAY_APP',
  LIEN_WAIVER: 'PAY_APP',
  PUNCH_LIST: 'PUNCH_LIST_ITEM',
  WARRANTY_LETTER: 'WARRANTY_CLAIM',
  SCHEDULE_VERSION: 'SCHEDULE_VERSION',
};

export function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === 'string'
    && (DOCUMENT_KINDS as readonly string[]).includes(value);
}

export function isDocumentLinkedEntityType(value: unknown): value is DocumentLinkedEntityType {
  return typeof value === 'string'
    && (DOCUMENT_LINKED_ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * Build the canonical Drive folder path for a (kID, kind) pair.  The path is
 * mirrored under the engagement's Drive root so docs surface in the legacy
 * folder browser as well as in the Document Hub.
 */
export function canonicalDriveFolderPath(kid: string, kind: DocumentKind): string {
  return `/Projects/${kid}/Documents/${DOCUMENT_KIND_DRIVE_SLUG[kind]}/`;
}
