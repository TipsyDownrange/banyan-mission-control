/**
 * BAN-343 PM-V1.0-D — Meeting Intelligence canonical enumerations.
 *
 * PM Trunk v1.0 §8.  source_platform reserves the Connector Framework
 * (ADR-042) values so future auto-population is additive only.
 */

export const MEETING_TYPES = [
  'PROJECT_KICKOFF',
  'OAC',
  'DESIGN_REVIEW',
  'CONSTRUCTION_PROGRESS',
  'PRECON',
  'PRE_INSTALL',
  'PUNCHWALK',
  'PROJECT_CLOSEOUT',
  'OTHER',
] as const;

export type MeetingType = typeof MEETING_TYPES[number];

export const MEETING_SOURCE_PLATFORMS = [
  'MANUAL',
  'READ_AI',
  'OTTER_AI',
  'FIREFLIES_AI',
  'OTHER',
] as const;

export type MeetingSourcePlatform = typeof MEETING_SOURCE_PLATFORMS[number];

export const TITLE_MAX = 200;

export function isMeetingType(value: unknown): value is MeetingType {
  return typeof value === 'string' && (MEETING_TYPES as readonly string[]).includes(value);
}

export function isMeetingSourcePlatform(value: unknown): value is MeetingSourcePlatform {
  return typeof value === 'string' && (MEETING_SOURCE_PLATFORMS as readonly string[]).includes(value);
}
