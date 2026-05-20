/**
 * BAN-376 Customer Pipeline P2 — pure email parser helpers.
 * Targets lib/inquiries/email-parser.ts (no DB, no fs, no network).
 */

import {
  INTAKE_TO_REGEX,
  RFP_SUBJECT_REGEX,
  buildInquiryDescriptionFromBody,
  classifyEmailIntake,
  deriveCustomerName,
  extractTenantKidFromIntakeTo,
  parseFromAddress,
  totalAttachmentBytes,
  MAX_ATTACHMENT_COUNT,
  MAX_TOTAL_ATTACHMENT_BYTES,
} from '@/lib/inquiries/email-parser';

describe('INTAKE_TO_REGEX', () => {
  it.each([
    ['intake+TEN-001@banyan-os.app', 'TEN-001'],
    ['intake+kula@banyan-os.app', 'kula'],
    ['intake+Acme_GC-42@banyan-os.app', 'Acme_GC-42'],
    ['INTAKE+TEN-001@BANYAN-OS.APP', 'TEN-001'],
  ])('matches %s and captures %s', (to, kid) => {
    const m = to.match(INTAKE_TO_REGEX);
    expect(m?.[1]).toBe(kid);
  });

  it.each([
    'intake@banyan-os.app',
    'intake+@banyan-os.app',
    'inquiry+TEN-001@banyan-os.app',
    'intake+TEN-001@example.com',
    'intake+with spaces@banyan-os.app',
    'intake+TEN-001+extra@banyan-os.app',
  ])('rejects %s', to => {
    expect(INTAKE_TO_REGEX.test(to)).toBe(false);
  });
});

describe('extractTenantKidFromIntakeTo', () => {
  it('returns the captured kid', () => {
    expect(extractTenantKidFromIntakeTo('intake+TEN-001@banyan-os.app')).toBe('TEN-001');
  });
  it('returns null for invalid pattern', () => {
    expect(extractTenantKidFromIntakeTo('hello@banyan-os.app')).toBeNull();
    expect(extractTenantKidFromIntakeTo('')).toBeNull();
    expect(extractTenantKidFromIntakeTo(null)).toBeNull();
    expect(extractTenantKidFromIntakeTo(undefined)).toBeNull();
  });
});

describe('parseFromAddress', () => {
  it('parses "Display Name <email>"', () => {
    expect(parseFromAddress('Jane Doe <jane@co.com>')).toEqual({
      email: 'jane@co.com',
      displayName: 'Jane Doe',
    });
  });

  it('parses quoted display name with comma', () => {
    expect(parseFromAddress('"Doe, Jane" <jane@co.com>')).toEqual({
      email: 'jane@co.com',
      displayName: 'Doe, Jane',
    });
  });

  it('parses bare angle email', () => {
    expect(parseFromAddress('<jane@co.com>')).toEqual({
      email: 'jane@co.com',
      displayName: null,
    });
  });

  it('parses bare email', () => {
    expect(parseFromAddress('jane@co.com')).toEqual({
      email: 'jane@co.com',
      displayName: null,
    });
  });

  it('lowercases the email but preserves display-name casing', () => {
    expect(parseFromAddress('Jane DOE <Jane@CO.com>')).toEqual({
      email: 'jane@co.com',
      displayName: 'Jane DOE',
    });
  });

  it('handles unicode display names', () => {
    expect(parseFromAddress('日本 太郎 <taro@example.jp>')).toEqual({
      email: 'taro@example.jp',
      displayName: '日本 太郎',
    });
  });

  it.each([
    '',
    'not-an-email',
    'no@dot',
    '<>',
    'Name <not-an-email>',
    'Jane <jane@>',
  ])('rejects %s', input => {
    expect(parseFromAddress(input)).toBeNull();
  });

  it('handles null and undefined', () => {
    expect(parseFromAddress(null)).toBeNull();
    expect(parseFromAddress(undefined)).toBeNull();
  });
});

describe('deriveCustomerName', () => {
  it('uses display name when present', () => {
    expect(deriveCustomerName('Jane Doe <jane@co.com>')).toBe('Jane Doe');
  });
  it('falls back to local-part with first-letter caps when no display', () => {
    expect(deriveCustomerName('jane.doe@co.com')).toBe('Jane Doe');
    expect(deriveCustomerName('jane-doe@co.com')).toBe('Jane Doe');
    expect(deriveCustomerName('jane_doe@co.com')).toBe('Jane Doe');
  });
  it('caps a single-word local', () => {
    expect(deriveCustomerName('admin@co.com')).toBe('Admin');
  });
  it('returns null when unparseable', () => {
    expect(deriveCustomerName('not an email')).toBeNull();
    expect(deriveCustomerName('')).toBeNull();
  });
});

describe('RFP_SUBJECT_REGEX', () => {
  it.each([
    'RFP: Tower B',
    'Project RFP',
    'rfp at the bottom',
    '[RFP] Hokuala Phase 2',
    'ITB for downtown',
    'Request for Proposal — Curtainwall',
    'Invitation to Bid: Honolulu Plaza',
    'bid request from XYZ',
  ])('detects %s', s => {
    expect(RFP_SUBJECT_REGEX.test(s)).toBe(true);
  });

  it.each([
    'random email about glass',
    'DRAFP results enclosed',
    'ITBoyer was here',
    'no acronyms here',
    'request for information',
    '',
  ])('does not detect %s', s => {
    expect(RFP_SUBJECT_REGEX.test(s)).toBe(false);
  });
});

describe('classifyEmailIntake', () => {
  it('classifies RFP subject as RFP + PROJECT', () => {
    expect(classifyEmailIntake({ subject: 'RFP: Tower B' })).toEqual({
      isRFP: true,
      inquiryTypeInitial: 'PROJECT',
      source: 'RFP',
    });
  });
  it('classifies non-RFP as EMAIL + UNCLEAR', () => {
    expect(classifyEmailIntake({ subject: 'Hello, would like to chat about a job' })).toEqual({
      isRFP: false,
      inquiryTypeInitial: 'UNCLEAR',
      source: 'EMAIL',
    });
  });
  it('treats empty subject as non-RFP', () => {
    expect(classifyEmailIntake({ subject: '' }).isRFP).toBe(false);
    expect(classifyEmailIntake({ subject: null }).isRFP).toBe(false);
    expect(classifyEmailIntake({ subject: undefined }).isRFP).toBe(false);
  });
});

describe('buildInquiryDescriptionFromBody', () => {
  it('returns trimmed body within max', () => {
    expect(buildInquiryDescriptionFromBody('  hello world  ')).toBe('hello world');
  });
  it('collapses whitespace', () => {
    expect(buildInquiryDescriptionFromBody('a\n\n\nb\t\tc')).toBe('a b c');
  });
  it('truncates beyond max', () => {
    const body = 'x'.repeat(1200);
    expect(buildInquiryDescriptionFromBody(body)).toHaveLength(500);
  });
  it('handles null/empty', () => {
    expect(buildInquiryDescriptionFromBody(null)).toBe('');
    expect(buildInquiryDescriptionFromBody('')).toBe('');
  });
});

describe('totalAttachmentBytes', () => {
  it('sums sizes from base64', () => {
    const oneKb = Buffer.alloc(1024).toString('base64'); // 1024 raw bytes
    const result = totalAttachmentBytes([
      { base64_content: oneKb },
      { base64_content: oneKb },
    ]);
    expect(result).toBe(2048);
  });
  it('handles empty and null', () => {
    expect(totalAttachmentBytes(null)).toBe(0);
    expect(totalAttachmentBytes([])).toBe(0);
    expect(totalAttachmentBytes([{ base64_content: '' }])).toBe(0);
  });
});

describe('limits', () => {
  it('exports the 25-attachment cap', () => {
    expect(MAX_ATTACHMENT_COUNT).toBe(25);
  });
  it('exports the 25 MB cap', () => {
    expect(MAX_TOTAL_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
  });
});
