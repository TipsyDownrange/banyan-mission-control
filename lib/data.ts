export const PROJECTS = [
  { kID: 'PRJ-26-0001', name: 'Hokuala Hotel', island: 'Kauai', pm: 'Frank', status: 'active', phase: 'Installation', budget: 420000, spent: 310000, issues: 2 },
  { kID: 'PRJ-26-0002', name: 'War Memorial Gym', island: 'Maui', pm: 'Sean', status: 'active', phase: 'QA / Closeout', budget: 185000, spent: 170000, issues: 1 },
  { kID: 'PRJ-26-0003', name: 'Makena Beach Club', island: 'Maui', pm: 'Frank', status: 'active', phase: 'Installation', budget: 230000, spent: 95000, issues: 0 },
  { kID: 'PRJ-26-0004', name: 'KCC Culinary', island: 'Oahu', pm: 'Kyle', status: 'active', phase: 'Submittal', budget: 78000, spent: 12000, issues: 0 },
  { kID: 'PRJ-26-0005', name: 'War Memorial Football', island: 'Maui', pm: 'Sean', status: 'active', phase: 'Procurement', budget: 55000, spent: 8000, issues: 0 },
  { kID: 'PRJ-26-0006', name: 'KS-Olanui / Fuller Glass', island: 'Oahu', pm: 'Kyle', status: 'active', phase: 'Installation', budget: 140000, spent: 88000, issues: 1 },
  { kID: 'PRJ-26-0007', name: 'Straub Parking Building', island: 'Oahu', pm: 'Jenny', status: 'active', phase: 'Submittal', budget: 32000, spent: 4000, issues: 0 },
  { kID: 'SRV-26-0001', name: '2026 Work Orders', island: 'Oahu', pm: 'Joey', status: 'active', phase: 'Service', budget: 0, spent: 0, issues: 0 },
];

export const ISSUES = [
  { id: 'ISS-001', project: 'PRJ-26-0001', kID: 'Hokuala Hotel', description: 'Storefront unit 4B — silicone joint misalignment, remediation required', severity: 'HIGH', blocking: true, assignedTo: 'Frank', createdAt: '2026-03-29', status: 'OPEN' },
  { id: 'ISS-002', project: 'PRJ-26-0001', kID: 'Hokuala Hotel', description: 'Building D slider track not level — shim required before glass set', severity: 'MEDIUM', blocking: false, assignedTo: 'Nate', createdAt: '2026-03-30', status: 'OPEN' },
  { id: 'ISS-003', project: 'PRJ-26-0002', kID: 'War Memorial Gym', description: 'Punch list item — storefront sealant on east elevation incomplete', severity: 'LOW', blocking: false, assignedTo: 'Sean', createdAt: '2026-03-28', status: 'OPEN' },
  { id: 'ISS-004', project: 'PRJ-26-0006', kID: 'KS-Olanui', description: 'GC waiting on approved shop drawings before next install phase', severity: 'MEDIUM', blocking: true, assignedTo: 'Kyle', createdAt: '2026-03-31', status: 'OPEN' },
];

export const EVENTS = [
  { id: 'EVT-001', project: 'PRJ-26-0001', projectName: 'Hokuala Hotel', type: 'DAILY_LOG', user: 'Thomas Begonia', timestamp: '2026-03-31 07:42', note: 'Set 8 storefront units on Building C, levels 2-3. 6 crew on site.' },
  { id: 'EVT-002', project: 'PRJ-26-0001', projectName: 'Hokuala Hotel', type: 'FIELD_ISSUE', user: 'Nate', timestamp: '2026-03-31 08:15', note: 'Building D slider track out of level. Flagged for shim before next glass set.' },
  { id: 'EVT-003', project: 'PRJ-26-0002', projectName: 'War Memorial Gym', type: 'INSTALL_STEP', user: 'Jay Castillo', timestamp: '2026-03-31 09:02', note: 'QA-007 storefront glazing bead — PASS. East elevation complete.' },
  { id: 'EVT-004', project: 'PRJ-26-0003', projectName: 'Makena Beach Club', type: 'DAILY_LOG', user: 'Francis Lynch', timestamp: '2026-03-30 16:30', note: '4 crew. Set 12 window units Building A. No issues. Weather clear.' },
  { id: 'EVT-005', project: 'PRJ-26-0006', projectName: 'KS-Olanui', type: 'NOTE', user: 'Kyle', timestamp: '2026-03-30 14:22', note: 'GC confirmed shop drawings approved. Waiting on email confirmation before mobilizing crew.' },
];

export const CREW = [
  // Management
  { id: 'USR-001', name: 'Jody', role: 'Owner / President', island: 'Oahu', type: 'management' },
  { id: 'USR-002', name: 'Sean Daniels', role: 'GM / PM', island: 'Oahu', type: 'management' },
  { id: 'USR-003', name: 'Frank', role: 'Senior PM', island: 'Maui', type: 'management' },
  { id: 'USR-004', name: 'Kyle', role: 'Estimator / PM', island: 'Oahu', type: 'management' },
  { id: 'USR-005', name: 'Jenny', role: 'Estimator / PM', island: 'Oahu', type: 'management' },
  { id: 'USR-006', name: 'Joey', role: 'PM — Service Lane', island: 'Oahu', type: 'management' },
  { id: 'USR-007', name: 'Nate', role: 'Superintendent', island: 'Oahu', type: 'management' },
  { id: 'USR-008', name: 'Mark Olson', role: 'Sales Engineer', island: 'Oahu', type: 'management' },
  // Field
  { id: 'USR-009', name: 'Thomas Begonia', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-010', name: 'Jay Castillo', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-011', name: 'Nolan Lagmay', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-012', name: 'Francis Lynch', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-013', name: 'James Nakamura', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-014', name: 'Karl Nakamura Jr.', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-015', name: 'Timothy Stitt', role: 'Journeyman', island: 'Oahu', type: 'field' },
  { id: 'USR-016', name: 'Wendall Tavares', role: 'Journeyman', island: 'Oahu', type: 'field' },
];

export const BIDS = [
  { id: 'EST-26-0001', name: 'Hilton Waikoloa Tower Phase 2', client: 'Hilton', due: '2026-04-08', status: 'In Progress', assignedTo: 'Kyle', value: null },
  { id: 'EST-26-0002', name: 'Maui High School STEM Phase II', client: 'DLNR / State', due: '2026-04-15', status: 'Site Visit Needed', assignedTo: 'Jenny', value: null },
  { id: 'EST-26-0003', name: 'Lilly Pulitzer TI', client: 'Lilly Pulitzer', due: '2026-04-03', status: 'Proposal Sent', assignedTo: 'Mark Olson', value: 48000 },
  { id: 'EST-26-0004', name: 'Kapolei Lot 64 Phase 2', client: 'General Contractor', due: '2026-04-20', status: 'Takeoff In Progress', assignedTo: 'Kyle', value: null },
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
