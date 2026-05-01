export const ORGANIZATION_TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  CUSTOMER:      { color: '#0f766e', bg: '#f0fdfa' },
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

export const ORGANIZATION_TYPES = Object.freeze(Object.keys(ORGANIZATION_TYPE_COLORS));

export const ORGANIZATION_TYPE_LABELS: Record<string, string> = {
  CUSTOMER: 'Customer',
  GC: 'GC',
  COMMERCIAL: 'Commercial',
  RESIDENTIAL: 'Residential',
  VENDOR: 'Vendor',
  ARCHITECT: 'Architect',
  OWNER: 'Owner',
  BUILDER: 'Builder',
  GOVERNMENT: 'Government',
  PROPERTY_MGMT: 'Property Mgmt',
  CONSULTANT: 'Consultant',
};
