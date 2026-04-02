export const PROJECTS = [
  { kID: 'PRJ-24-0010', name: 'Hokuala Hotel', island: 'Kauai', pm: 'Frank Redondo', status: 'active', phase: 'Installation', budget: 420000, spent: 310000, issues: 2 },
  { kID: 'PRJ-23-0009', name: 'War Memorial Gym', island: 'Maui', pm: 'Sean Daniels', status: 'active', phase: 'QA / Closeout', budget: 185000, spent: 170000, issues: 1 },
  { kID: 'PRJ-24-0020', name: 'Makena Beach Club', island: 'Maui', pm: 'Frank Redondo', status: 'active', phase: 'Installation', budget: 230000, spent: 95000, issues: 0 },
  { kID: 'PRJ-24-0004', name: 'KCC Culinary', island: 'Oahu', pm: 'Kyle Shimizu', status: 'active', phase: 'Submittal', budget: 78000, spent: 12000, issues: 0 },
  { kID: 'PRJ-24-0005', name: 'War Memorial Football', island: 'Maui', pm: 'Sean Daniels', status: 'active', phase: 'Procurement', budget: 55000, spent: 8000, issues: 0 },
  { kID: 'PRJ-25-0003', name: 'KS-Olanui / Fuller Glass', island: 'Oahu', pm: 'Kyle Shimizu', status: 'active', phase: 'Installation', budget: 140000, spent: 88000, issues: 1 },
  { kID: 'PRJ-24-0003', name: 'Straub Parking Building', island: 'Oahu', pm: 'Jenny Shimabukuro', status: 'active', phase: 'Submittal', budget: 32000, spent: 4000, issues: 0 },
  { kID: 'SRV-26-0001', name: '2026 Work Orders', island: 'Oahu', pm: 'Joey Ritthaler', status: 'active', phase: 'Service', budget: 0, spent: 0, issues: 0 },
];

export const ISSUES = [
  { id: 'ISS-001', project: 'PRJ-24-0010', kID: 'Hokuala Hotel', description: 'Storefront unit 4B — silicone joint misalignment, remediation required', severity: 'HIGH', blocking: true, assignedTo: 'Frank Redondo', createdAt: '2026-03-29', status: 'OPEN' },
  { id: 'ISS-002', project: 'PRJ-24-0010', kID: 'Hokuala Hotel', description: 'Building D slider track not level — shim required before glass set', severity: 'MEDIUM', blocking: false, assignedTo: 'Nate Nakamura', createdAt: '2026-03-30', status: 'OPEN' },
  { id: 'ISS-003', project: 'PRJ-23-0009', kID: 'War Memorial Gym', description: 'Punch list item — storefront sealant on east elevation incomplete', severity: 'LOW', blocking: false, assignedTo: 'Sean Daniels', createdAt: '2026-03-28', status: 'OPEN' },
  { id: 'ISS-004', project: 'PRJ-25-0003', kID: 'KS-Olanui', description: 'GC waiting on approved shop drawings before next install phase', severity: 'MEDIUM', blocking: true, assignedTo: 'Kyle Shimizu', createdAt: '2026-03-31', status: 'OPEN' },
];

export const EVENTS = [
  { id: 'EVT-001', project: 'PRJ-24-0010', projectName: 'Hokuala Hotel', type: 'DAILY_LOG', user: 'Thomas Begonia', timestamp: '2026-03-31 07:42', note: 'Set 8 storefront units on Building C, levels 2-3. 6 crew on site.' },
  { id: 'EVT-002', project: 'PRJ-24-0010', projectName: 'Hokuala Hotel', type: 'FIELD_ISSUE', user: 'Nate Nakamura', timestamp: '2026-03-31 08:15', note: 'Building D slider track out of level. Flagged for shim before next glass set.' },
  { id: 'EVT-003', project: 'PRJ-23-0009', projectName: 'War Memorial Gym', type: 'INSTALL_STEP', user: 'Jay Castillo', timestamp: '2026-03-31 09:02', note: 'QA-007 storefront glazing bead — PASS. East elevation complete.' },
  { id: 'EVT-004', project: 'PRJ-24-0020', projectName: 'Makena Beach Club', type: 'DAILY_LOG', user: 'Francis Lynch', timestamp: '2026-03-30 16:30', note: '4 crew. Set 12 window units Building A. No issues. Weather clear.' },
  { id: 'EVT-005', project: 'PRJ-25-0003', projectName: 'KS-Olanui', type: 'NOTE', user: 'Kyle Shimizu', timestamp: '2026-03-30 14:22', note: 'GC confirmed shop drawings approved. Waiting on email confirmation before mobilizing crew.' },
];

export const CREW = [
  // Management
  { id: 'USR-001', name: 'Jody Boeringa', role: 'Owner / President', island: 'Maui', type: 'management' },
  { id: 'USR-002', name: 'Sean Daniels', role: 'GM / PM', island: 'Maui', type: 'management' },
  { id: 'USR-003', name: 'Frank Redondo', role: 'Senior PM', island: 'Oahu', type: 'management' },
  { id: 'USR-004', name: 'Kyle Shimizu', role: 'Estimator / PM', island: 'Oahu', type: 'management' },
  { id: 'USR-005', name: 'Jenny Shimabukuro', role: 'Estimator / PM', island: 'Oahu', type: 'management' },
  { id: 'USR-006', name: 'Joey Ritthaler', role: 'PM — Service Lane', island: 'Oahu', type: 'management' },
  { id: 'USR-007', name: 'Mark Olson', role: 'Sales Engineer', island: 'Oahu', type: 'management' },
  { id: 'USR-008', name: 'Tia Omura', role: 'Admin / Assistant PM', island: 'Maui', type: 'management' },
  { id: 'USR-009', name: 'Jenna Nakama', role: 'Admin Assistant', island: 'Maui', type: 'management' },
  { id: 'USR-010', name: 'Sherilynn Takuchi', role: 'Admin Assistant', island: 'Maui', type: 'management' },
  // Superintendents
  { id: 'USR-011', name: 'Nate Nakamura', role: 'Superintendent', island: 'Maui', type: 'super' },
  { id: 'USR-043', name: 'Karl Nakamura Sr.', role: 'Superintendent', island: 'Oahu', type: 'super' },
  // Oahu Field
  { id: 'USR-012', name: 'Thomas Begonia', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-013', name: 'Jay Castillo', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-014', name: 'Nolan Lagmay', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-015', name: 'Francis Lynch', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-016', name: 'James Nakamura', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-017', name: 'Karl Nakamura Jr.', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-018', name: 'Timothy Stitt', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-019', name: 'Wendall Tavares', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-035', name: 'Ninja Thang', role: 'Apprentice', island: 'Oahu', type: 'field' },
  { id: 'USR-036', name: 'Christian Altman', role: 'Apprentice', island: 'Oahu', type: 'field' },
  { id: 'USR-040', name: 'Santia-Jacob Pascual', role: 'Apprentice', island: 'Oahu', type: 'field' },
  // Maui Field
  { id: 'USR-044', name: 'Nathan Nakamura', role: 'Journeyman', island: 'Maui', type: 'field' },
  { id: 'USR-045', name: 'Mark Villados', role: 'Journeyman', island: 'Maui', type: 'field' },
  { id: 'USR-046', name: 'Tyler Niemeyer', role: 'Journeyman', island: 'Maui', type: 'field' },
  { id: 'USR-047', name: 'Tyson Omura', role: 'Journeyman', island: 'Maui', type: 'field' },
  { id: 'USR-048', name: 'Owen Nakamura', role: 'Apprentice', island: 'Maui', type: 'field' },
  { id: 'USR-049', name: 'Holden Ioanis', role: 'Apprentice', island: 'Maui', type: 'field' },
  { id: 'USR-050', name: 'Quintin Castro-Perry', role: 'Apprentice', island: 'Maui', type: 'field' },
  // Kauai Field
  { id: 'USR-051', name: 'Silas Macon', role: 'Journeyman', island: 'Kauai', type: 'field' },
  { id: 'USR-052', name: 'Mien-Quoc Ly', role: 'Journeyman', island: 'Kauai', type: 'field' },
  { id: 'USR-053', name: 'Lonnie McKenzie', role: 'Journeyman', island: 'Kauai', type: 'field' },
  { id: 'USR-054', name: 'Joshua Moore', role: 'Journeyman', island: 'Kauai', type: 'field' },
  { id: 'USR-055', name: 'Troy Sliter', role: 'Journeyman', island: 'Kauai', type: 'field' },
];

export const BIDS = [
  { id: 'EST-26-0001', name: 'Hilton Waikoloa Tower Phase 2', client: 'Hilton', due: '2026-04-08', status: 'In Progress', assignedTo: 'Kyle Shimizu', value: null },
  { id: 'EST-26-0002', name: 'Maui High School STEM Phase II', client: 'DLNR / State', due: '2026-04-15', status: 'Site Visit Needed', assignedTo: 'Jenny Shimabukuro', value: null },
  { id: 'EST-26-0003', name: 'Lilly Pulitzer TI', client: 'Lilly Pulitzer', due: '2026-04-03', status: 'Proposal Sent', assignedTo: 'Mark Olson', value: 48000 },
  { id: 'EST-26-0004', name: 'Kapolei Lot 64 Phase 2', client: 'General Contractor', due: '2026-04-20', status: 'Takeoff In Progress', assignedTo: 'Kyle Shimizu', value: null },
];

export const ISLAND_EMOJI: Record<string, string> = {
  Oahu: '🌺', Maui: '🌊', Kauai: '🌿', Lanai: '🏝️', Hawaii: '🌋', Molokai: '🌴',
};

export const STATUS_COLOR: Record<string, string> = {
  HIGH: 'bg-red-50 text-red-700',
  MEDIUM: 'bg-amber-50 text-amber-600',
  LOW: 'bg-surface text-ink-label',
  OPEN: 'bg-orange-50 text-orange-600',
  RESOLVED: 'bg-teal-50 text-teal-700',
};

export const EVENT_TYPE_COLOR: Record<string, string> = {
  DAILY_LOG: 'bg-blue-50 text-blue-700',
  INSTALL_STEP: 'bg-teal-50 text-teal-700',
  FIELD_ISSUE: 'bg-orange-50 text-orange-600',
  NOTE: 'bg-surface text-ink-label',
  PHOTO_ONLY: 'bg-amber-50 text-amber-600',
};
