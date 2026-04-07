/**
 * BanyanOS Role & Permission System
 *
 * Authority levels (stored in Users_Roles sheet col O):
 *   Executive     — Jody, Sean: full access including AI Command
 *   Management    — Frank, Jenny, Kyle, Joey, Mark: all except AI Command
 *   Superintendent — Karl Sr., Nate: Operations + Service (view) + People
 *   Admin         — Tia, Jenna, Sherilynn: varies by career track
 *   Field         — All glaziers: Today + Schedule + Org Chart only
 *
 * career_track (col P): PM | Estimating | Admin | Field | Field-to-Office
 *
 * The preview-as picker uses this to filter nav dynamically.
 * When real Google Auth is active, replace 'demoUser' lookup with session email → sheet lookup.
 */

// ── User roster (mirrors Users_Roles sheet — source of truth is the sheet) ──
export const ALL_USERS: { name: string; role: string; group: string; email?: string }[] = [
  { name: 'Jody Boeringa',            role: 'owner',      group: 'Executive',       email: 'jody@kulaglass.com' },
  { name: 'Sean Daniels',             role: 'gm',         group: 'Executive',       email: 'sean@kulaglass.com' },
  { name: 'Frank Redondo',            role: 'pm',         group: 'Management',      email: 'frank@kulaglass.com' },
  { name: 'Kyle Shimizu',             role: 'estimator',  group: 'Management',      email: 'kyle@kulaglass.com' },
  { name: 'Jenny Shimabukuro',        role: 'admin_mgr',  group: 'Management',      email: 'jenny@kulaglass.com' },
  { name: 'Joey Ritthaler',           role: 'service_pm', group: 'Management',      email: 'joey@kulaglass.com' },
  { name: 'Mark Olson',               role: 'sales',      group: 'Management',      email: 'markolson@kulaglass.com' },
  { name: 'Tia Omura',                role: 'pm_track',   group: 'Admin',           email: 'tia@kulaglass.com' },
  { name: 'Jenna Nakama',             role: 'admin',      group: 'Admin',           email: 'jenna@kulaglass.com' },
  { name: 'Sherilynn Takuchi',        role: 'admin',      group: 'Admin',           email: 'sherilynn@kulaglass.com' },
  { name: 'Karl Nakamura Sr.',        role: 'super',      group: 'Superintendent',  email: 'karl@kulaglass.com' },
  { name: 'Nate Nakamura',            role: 'super',      group: 'Superintendent',  email: 'nate@kulaglass.com' },
  { name: 'Karl Nakamura Jr.',        role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Thomas Begonia',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Jay Castillo',             role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Nolan Lagmay',             role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Francis Lynch',            role: 'glazier',    group: 'Field — Oahu' },
  { name: 'James Nakamura',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Timothy Stitt',            role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Wendall Tavares',          role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Deric Valoroso',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Sonny Ah Kui',             role: 'glazier',    group: 'Field — Maui' },
  { name: 'Lewis Roman',              role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Christian Altman',         role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Ninja Thang',              role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Malu Cleveland',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Layton Domingo',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Wena Hun',                 role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Santia-Jacob Pascual',     role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Chachleigh Clarabal',      role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Elijah-David Meheula-Lando', role: 'glazier', group: 'Field — Oahu' },
  { name: 'Nathan Nakamura',          role: 'glazier',    group: 'Field — Maui' },
  { name: 'Mark Villados',            role: 'glazier',    group: 'Field — Maui' },
  { name: 'Tyler Niemeyer',           role: 'glazier',    group: 'Field — Maui' },
  { name: 'Tyson Omura',              role: 'glazier',    group: 'Field — Maui' },
  { name: 'Owen Nakamura',            role: 'glazier',    group: 'Field — Maui' },
  { name: 'Holden Ioanis',            role: 'glazier',    group: 'Field — Maui' },
  { name: 'Quintin Castro-Perry',     role: 'glazier',    group: 'Field — Maui' },
  { name: 'Silas Macon',              role: 'glazier',    group: 'Field — Kauai' },
  { name: 'Mien-Quoc Ly',             role: 'glazier',    group: 'Field — Kauai' },
  { name: 'Lonnie McKenzie',          role: 'glazier',    group: 'Field — Kauai' },
  { name: 'Joshua Moore',             role: 'glazier',    group: 'Field — Kauai' },
  { name: 'Troy Sliter',              role: 'glazier',    group: 'Field — Kauai' },
];

// ── Authority level → nav sections ──────────────────────────────────────────
// This is the single source of truth for what each person can see.
// When authority_level changes in the sheet, this is what drives it.
//
// Sections: Assistant | Operations | Projects | People & Assets |
//           Estimating | Service | AI Command

export function navSectionsForAuthorityLevel(authorityLevel: string, role?: string): string[] {
  switch (authorityLevel) {
    case 'Executive':
      return ['Assistant', 'Operations', 'Projects', 'People & Assets', 'Estimating', 'Service', 'Admin & Finance', 'AI Command'];

    case 'Management':
      // Sub-filter by role for Management level
      if (role === 'admin_mgr') return ['Assistant', 'Operations', 'Projects', 'People & Assets', 'Estimating', 'Service', 'Admin & Finance'];
      if (role === 'estimator') return ['Assistant', 'Operations', 'Projects', 'People & Assets', 'Estimating'];
      if (role === 'service_pm') return ['Assistant', 'Operations', 'Service', 'People & Assets'];
      if (role === 'sales') return ['Assistant', 'Estimating', 'People & Assets'];
      // Default management (pm, etc.)
      return ['Assistant', 'Operations', 'Projects', 'People & Assets', 'Service'];

    case 'Superintendent':
      return ['Assistant', 'Operations', 'Service', 'People & Assets'];

    case 'Admin':
      if (role === 'pm_track') return ['Assistant', 'Projects', 'People & Assets', 'Admin & Finance'];
      return ['Assistant', 'People & Assets', 'Admin & Finance'];

    case 'Field':
    default:
      return ['Assistant', 'People & Assets'];
  }
}

// Backwards-compatible wrapper — maps old role strings to authority levels
export function navSectionsForRole(role: string): string[] {
  const authorityMap: Record<string, string> = {
    owner: 'Executive', gm: 'Executive',
    pm: 'Management', estimator: 'Management', service_pm: 'Management', sales: 'Management', admin_mgr: 'Management',
    pm_track: 'Admin', admin: 'Admin',
    super: 'Superintendent',
    glazier: 'Field',
  };
  const authority = authorityMap[role] || 'Field';
  return navSectionsForAuthorityLevel(authority, role);
}

export function hiddenItemsForRole(role: string): string[] {
  switch (role) {
    case 'estimator': return ['Forecasting', 'Dispatch Board', 'Event Feed', 'Issues'];
    case 'super':     return ['Event Feed', 'Issues'];
    case 'glazier':   return ['Inbox', 'Crew', 'Customers', 'Assets'];
    default:          return [];
  }
}

export function readOnlyViewsForRole(role: string): string[] {
  switch (role) {
    case 'pm':        return ['Work Orders', 'Schedules', 'Submittals', 'Budget', 'Change Orders'];
    case 'estimator': return ['Projects', 'Schedules', 'Submittals', 'Budget', 'Change Orders', 'Overview'];
    case 'super':     return [];
    default:          return [];
  }
}

export function defaultViewForRole(role: string): string {
  if (role === 'glazier')    return 'Today';
  if (role === 'estimator')  return 'Bid Queue';
  if (role === 'service_pm') return 'Work Orders';
  if (role === 'super')      return 'Today';
  if (role === 'sales')      return 'Bid Queue';
  if (role === 'admin' || role === 'pm_track') return 'Today';
  return 'Today';
}
