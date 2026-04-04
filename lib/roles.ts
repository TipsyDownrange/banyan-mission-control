/**
 * Shared role definitions and nav access rules.
 * Imported by page.tsx, CalendarPanel, and any component that needs role-based visibility.
 */

export const ALL_USERS: { name: string; role: string; group: string }[] = [
  { name: 'Jody Boeringa',            role: 'owner',      group: 'Leadership' },
  { name: 'Sean Daniels',             role: 'gm',         group: 'Leadership' },
  { name: 'Frank Redondo',            role: 'pm',         group: 'PM / Estimating' },
  { name: 'Kyle Shimizu',             role: 'estimator',  group: 'PM / Estimating' },
  { name: 'Jenny Shimabukuro',        role: 'estimator',  group: 'PM / Estimating' },
  { name: 'Joey Ritthaler',           role: 'service_pm', group: 'PM / Estimating' },
  { name: 'Mark Olson',               role: 'sales',      group: 'Sales / Admin — Remote' },
  { name: 'Tia Omura',                role: 'pm_track',   group: 'Sales / Admin' },
  { name: 'Jenna Nakama',             role: 'admin',      group: 'Sales / Admin' },
  { name: 'Sherilynn Takuchi',        role: 'admin',      group: 'Sales / Admin' },
  { name: 'Karl Nakamura Sr.',        role: 'super',      group: 'Field — Oahu' },
  { name: 'Nate Nakamura',            role: 'super',      group: 'Field — Maui' },
  { name: 'Karl Nakamura Jr.',        role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Thomas Begonia',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Jay Castillo',             role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Nolan Lagmay',             role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Francis Lynch',            role: 'glazier',    group: 'Field — Oahu' },
  { name: 'James Nakamura',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Timothy Stitt',            role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Wendall Tavares',          role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Deric Valoroso',           role: 'glazier',    group: 'Field — Oahu' },
  { name: 'Sonny Ah Kui',             role: 'glazier',    group: 'Field — Oahu' },
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

export function navSectionsForRole(role: string): string[] {
  switch (role) {
    case 'owner': case 'gm':
      return ['Assistant', 'Operations', 'Projects', 'People & Assets', 'Estimating', 'Service', 'AI Command'];
    case 'pm':
      return ['Assistant', 'Operations', 'Projects', 'People & Assets', 'Service'];
    case 'estimator':
      return ['Assistant', 'Operations', 'Projects', 'People & Assets', 'Estimating'];
    case 'service_pm':
      return ['Assistant', 'Operations', 'Service', 'People & Assets'];
    case 'sales':
      return ['Assistant', 'Estimating', 'People & Assets'];
    case 'pm_track':
      return ['Assistant', 'Projects', 'People & Assets'];
    case 'admin':
      return ['Assistant', 'People & Assets'];
    case 'super':
      return ['Assistant', 'Operations', 'Service', 'People & Assets'];
    case 'glazier':
      return ['Assistant', 'People & Assets'];
    default:
      return ['Assistant'];
  }
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
    case 'super':     return ['Work Orders', 'Overview', 'Forecasting'];
    default:          return [];
  }
}

export function defaultViewForRole(role: string): string {
  if (role === 'glazier')    return 'Today';
  if (role === 'estimator')  return 'Bid Queue';
  if (role === 'service_pm') return 'Work Orders';
  if (role === 'super')      return 'Today';
  if (role === 'sales')      return 'Bid Queue';
  if (role === 'admin')      return 'Today';
  if (role === 'pm_track')   return 'Today';
  return 'Today';
}
