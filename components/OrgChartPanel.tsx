'use client';
import { useEffect, useState } from 'react';

// ── Live crew data type ──────────────────────────────────────────────────
type LiveCrewMember = {
  user_id: string; name: string; role: string; email: string;
  phone: string; island: string; personal_email: string; title: string;
  department: string; office: string; home_address: string;
  emergency_contact: string; start_date: string; notes: string;
  authority_level: string; career_track: string;
};

// ── Org data ──────────────────────────────────────────────────────────────
const ORG = {
  id: 'jody',
  name: 'Jody Boeringa',
  title: 'Owner / President',
  island: 'Oahu',
  color: '#0f172a',
  children: [
    {
      id: 'sean',
      name: 'Sean Daniels',
      title: 'General Manager / PM',
      island: 'Oahu',
      color: '#0369a1',
      note: 'Management Team',
      children: [
        {
          id: 'mark',
          name: 'Mark Olson',
          title: 'Sales Engineer — Remote',
          island: 'Hawaii',
          color: '#92400e',
          note: 'Remote · Big Island · Retiring May 1',
          children: [],
        },
        {
          id: 'frank',
          name: 'Frank Redondo',
          title: 'Senior Project Manager — Oahu',
          island: 'Oahu',
          color: '#0f766e',
          note: 'Management Team',
          children: [
            { id: 'kyle', name: 'Kyle Shimizu', title: 'Estimator / PM', island: 'Oahu', color: '#0f766e', children: [] },
            { id: 'joey', name: 'Joey Ritthaler', title: 'PM / Service Lane', island: 'Oahu', color: '#6d28d9', children: [] },
            {
              id: 'karl_sr',
              name: 'Karl Nakamura Sr.',
              title: 'Superintendent — Oahu',
              island: 'Oahu',
              color: '#0369a1',
              children: [
                { id: 'karl_jr',  name: 'Karl Nakamura Jr.',          title: 'Journeyman', island: 'Oahu', color: '#334155', children: [] },
                { id: 'thomas',   name: 'Thomas Begonia',              title: 'Journeyman', island: 'Oahu', color: '#334155', children: [] },
                { id: 'jay',      name: 'Jay Castillo',                title: 'Journeyman', island: 'Oahu', color: '#334155', children: [] },
                { id: 'nolan',    name: 'Nolan Lagmay',                title: 'Journeyman', island: 'Oahu', color: '#334155', children: [] },
                { id: 'francis',  name: 'Francis Lynch',               title: 'Journeyman', island: 'Oahu', color: '#334155', children: [] },
                { id: 'james',    name: 'James Nakamura',              title: 'Journeyman', island: 'Oahu', color: '#334155', children: [] },
                { id: 'tim',      name: 'Timothy Stitt',               title: 'Journeyman', island: 'Oahu', color: '#334155', children: [] },
                { id: 'wendall',  name: 'Wendall Tavares',             title: 'Journeyman', island: 'Oahu', color: '#334155', children: [] },
                { id: 'deric',    name: 'Deric Valoroso',              title: 'Journeyman', island: 'Oahu', color: '#334155', children: [] },
                { id: 'lewis',    name: 'Lewis Roman',                 title: 'Journeyman', island: 'Oahu', color: '#334155', children: [] },
                { id: 'christian',name: 'Christian Altman',            title: 'Apprentice', island: 'Oahu', color: '#94a3b8', children: [] },
                { id: 'ninja',    name: 'Ninja Thang',                 title: 'Apprentice', island: 'Oahu', color: '#94a3b8', children: [] },
                { id: 'malu',     name: 'Malu Cleveland',              title: 'Apprentice', island: 'Oahu', color: '#94a3b8', children: [] },
                { id: 'layton',   name: 'Layton Domingo',              title: 'Apprentice', island: 'Oahu', color: '#94a3b8', children: [] },
                { id: 'wena',     name: 'Wena Hun',                    title: 'Apprentice', island: 'Oahu', color: '#94a3b8', children: [] },
                { id: 'santia',   name: 'Santia-Jacob Pascual',        title: 'Apprentice', island: 'Oahu', color: '#94a3b8', children: [] },
                { id: 'chacha',   name: 'Chachleigh Clarabal',         title: 'Apprentice', island: 'Oahu', color: '#94a3b8', children: [] },
                { id: 'elijah',   name: 'Elijah-David Meheula-Lando',  title: 'Apprentice', island: 'Oahu', color: '#94a3b8', children: [] },
              ],
            },
          ],
        },
        {
          id: 'jenny',
          name: 'Jenny Shimabukuro',
          title: 'Estimator / PM · Admin Manager',
          island: 'Oahu',
          color: '#0f766e',
          note: 'Management Team',
          children: [
            { id: 'tia', name: 'Tia Omura', title: 'Admin Asst → PM Track', island: 'Oahu', color: '#0f766e', note: 'Running 2 projects', children: [] },
            {
              id: 'jenna', name: 'Jenna Nakama', title: 'Admin Assistant', island: 'Oahu', color: '#64748b',
              children: [
                { id: 'sher', name: 'Sherilynn Takuchi', title: 'Admin Assistant', island: 'Oahu', color: '#64748b', children: [] },
              ],
            },
          ],
        },
        {
          id: 'nate',
          name: 'Nate Nakamura',
          title: 'Superintendent · Journeyman',
          island: 'Maui',
          color: '#0f766e',
          note: 'Management Team',
          children: [
            { id: 'nathan', name: 'Nathan Nakamura',      title: 'Journeyman', island: 'Maui',  color: '#334155', children: [] },
            { id: 'mark_v', name: 'Mark Villados',        title: 'Journeyman', island: 'Maui',  color: '#334155', children: [] },
            { id: 'tyler',  name: 'Tyler Niemeyer',       title: 'Journeyman', island: 'Maui',  color: '#334155', children: [] },
            { id: 'tyson',  name: 'Tyson Omura',          title: 'Journeyman', island: 'Maui',  color: '#334155', children: [] },
            { id: 'sonny',  name: 'Sonny Ah Kui',          title: 'Journeyman', island: 'Maui',  color: '#334155', children: [] },
            { id: 'silas',  name: 'Silas Macon',          title: 'Journeyman', island: 'Kauai', color: '#334155', children: [] },
            { id: 'mien',   name: 'Mien-Quoc Ly',         title: 'Journeyman', island: 'Kauai', color: '#334155', children: [] },
            { id: 'lonnie', name: 'Lonnie McKenzie',       title: 'Journeyman', island: 'Kauai', color: '#334155', children: [] },
            { id: 'joshua', name: 'Joshua Moore',          title: 'Journeyman', island: 'Kauai', color: '#334155', children: [] },
            { id: 'troy',   name: 'Troy Sliter',           title: 'Journeyman', island: 'Kauai', color: '#334155', children: [] },
            { id: 'owen',   name: 'Owen Nakamura',         title: 'Apprentice', island: 'Maui',  color: '#94a3b8', children: [] },
            { id: 'holden', name: 'Holden Ioanis',         title: 'Apprentice', island: 'Maui',  color: '#94a3b8', children: [] },
            { id: 'quintin',name: 'Quintin Castro-Perry',  title: 'Apprentice', island: 'Maui',  color: '#94a3b8', children: [] },
          ],
        },
      ],
    },
  ],
};

const ISLAND_COLOR: Record<string, string> = {
  Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e',
};

const ROLE_TIER: Record<string, number> = {
  'Owner': 0, 'GM': 1, 'Senior PM': 2, 'PM': 3, 'Estimator': 3,
  'Sales': 3, 'Admin': 3, 'Superintendent': 4, 'Journeyman': 5, 'Apprentice': 6,
};

function roleTier(title: string): number {
  for (const [k, v] of Object.entries(ROLE_TIER)) {
    if (title.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return 4;
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function avatarBg(color: string): string {
  const map: Record<string, string> = {
    '#0f172a': 'rgba(15,23,42,0.12)',
    '#0369a1': 'rgba(3,105,161,0.12)',
    '#0f766e': 'rgba(15,118,110,0.12)',
    '#6d28d9': 'rgba(109,40,217,0.12)',
    '#64748b': 'rgba(100,116,139,0.1)',
    '#334155': 'rgba(51,65,85,0.08)',
    '#94a3b8': 'rgba(148,163,184,0.1)',
  };
  return map[color] || 'rgba(15,23,42,0.08)';
}

// ── Node card ──────────────────────────────────────────────────────────────
type OrgNode = {
  id: string; name: string; title: string; island: string;
  color: string; note?: string; children: OrgNode[];
};

type LiveOverlay = {
  apprenticePct?: string;
  tempAssignment?: string;
  notes?: string;
};

function NodeCard({ node, compact = false, overlay }: { node: OrgNode; compact?: boolean; overlay?: LiveOverlay }) {
  const tier = roleTier(node.title);
  const islandColor = ISLAND_COLOR[node.island] || '#64748b';
  const isApprentice = node.title.toLowerCase().includes('apprentice');

  // Build display name with overlays
  let displaySuffix = '';
  if (overlay?.tempAssignment) displaySuffix = ` (${overlay.tempAssignment})`;
  const pctLabel = isApprentice && overlay?.apprenticePct ? ` · ${overlay.apprenticePct}` : '';

  if (compact) {
    return (
      <div style={{
        background: 'white', borderRadius: 10, border: `1px solid ${node.color}22`,
        padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: '0 1px 4px rgba(15,23,42,0.06)', minWidth: 150, maxWidth: 220,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: avatarBg(node.color),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 800, color: node.color, flexShrink: 0,
        }}>
          {getInitials(node.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.name.split(' ')[0]} {node.name.split(' ').slice(-1)[0]}
            {displaySuffix && <span style={{ color: '#f59e0b', fontWeight: 600 }}>{displaySuffix}</span>}
          </div>
          <div style={{ fontSize: 9, color: node.color, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.title.split(' ')[0]}{pctLabel}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: islandColor, flexShrink: 0 }} />
      </div>
    );
  }

  return (
    <div style={{
      background: 'white', borderRadius: 14,
      border: `1.5px solid ${node.color}33`,
      padding: tier <= 1 ? '16px 20px' : tier <= 3 ? '12px 16px' : '10px 14px',
      boxShadow: tier <= 1 ? '0 4px 20px rgba(15,23,42,0.1)' : tier <= 3 ? '0 2px 10px rgba(15,23,42,0.06)' : '0 1px 4px rgba(15,23,42,0.04)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      minWidth: tier <= 1 ? 180 : tier <= 3 ? 160 : 140,
      maxWidth: tier <= 1 ? 220 : 180,
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', background: islandColor }} title={node.island} />
      <div style={{
        width: tier <= 1 ? 48 : tier <= 3 ? 40 : 34,
        height: tier <= 1 ? 48 : tier <= 3 ? 40 : 34,
        borderRadius: '50%',
        background: avatarBg(node.color),
        border: `2px solid ${node.color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: tier <= 1 ? 14 : 11, fontWeight: 900, color: node.color,
        marginBottom: 8, flexShrink: 0,
      }}>
        {getInitials(node.name)}
      </div>
      <div style={{ fontSize: tier <= 1 ? 14 : tier <= 3 ? 12 : 11, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, marginBottom: 3 }}>
        {node.name}
        {displaySuffix && <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 9 }}>{displaySuffix}</span>}
      </div>
      <div style={{ fontSize: tier <= 1 ? 10 : 9, fontWeight: 700, color: node.color, lineHeight: 1.3, marginBottom: node.note || pctLabel ? 4 : 0 }}>
        {node.title}{pctLabel}
      </div>
      {node.note && (
        <div style={{
          fontSize: 8, fontWeight: 700, borderRadius: 4, padding: '1px 6px', marginTop: 2,
          color: node.note === 'Management Team' ? '#0f766e' : '#92400e',
          background: node.note === 'Management Team' ? '#f0fdfa' : '#fffbeb',
        }}>
          {node.note === 'Management Team' ? '★ Management Team' : node.note}
        </div>
      )}
    </div>
  );
}

// ── Tree section ──────────────────────────────────────────────────────────
function TreeSection({ node, overlays }: { node: OrgNode; overlays: Record<string, LiveOverlay> }) {
  const leafChildren = node.children.filter(c => c.children.length === 0);
  const branchChildren = node.children.filter(c => c.children.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <NodeCard node={node} overlay={overlays[node.name]} />
      {node.children.length > 0 && (
        <>
          <div style={{ width: 2, height: 20, background: '#e2e8f0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            {branchChildren.length > 0 && (
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', justifyContent: 'center', marginBottom: branchChildren.length > 0 && leafChildren.length > 0 ? 20 : 0 }}>
                {branchChildren.map(child => (
                  <div key={child.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 2, height: 8, background: '#e2e8f0' }} />
                    <TreeSection node={child} overlays={overlays} />
                  </div>
                ))}
              </div>
            )}
            {leafChildren.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {branchChildren.length > 0 && <div style={{ width: 2, height: 16, background: '#e2e8f0' }} />}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: leafChildren.length > 6 ? 700 : 500 }}>
                  {leafChildren.map(child => (
                    <NodeCard key={child.id} node={child} compact={leafChildren.length > 4} overlay={overlays[child.name]} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SeanReportSection({ node, overlays }: { node: OrgNode; overlays: Record<string, LiveOverlay> }) {
  const ISLAND_BG: Record<string, string> = {
    Oahu: 'rgba(3,105,161,0.04)', Maui: 'rgba(15,118,110,0.04)',
    Kauai: 'rgba(109,40,217,0.04)', Hawaii: 'rgba(146,64,14,0.04)',
  };
  return (
    <div style={{
      background: ISLAND_BG[node.island] || '#f8fafc',
      borderRadius: 16, border: `1px solid ${node.color}18`,
      padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center',
      minWidth: 160,
    }}>
      <TreeSection node={node} overlays={overlays} />
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', padding: '10px 0', marginBottom: 8 }}>
      {[
        { label: 'Oahu', color: ISLAND_COLOR.Oahu },
        { label: 'Maui', color: ISLAND_COLOR.Maui },
        { label: 'Kauai', color: ISLAND_COLOR.Kauai },
      ].map(({ label, color }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{label}</span>
        </div>
      ))}
      <div style={{ width: 1, height: 14, background: '#e2e8f0', margin: '0 4px' }} />
      <span style={{ fontSize: 10, color: '#94a3b8' }}>Dot in card corner = island</span>
    </div>
  );
}

// ── Build overlays from live data ─────────────────────────────────────────
function buildOverlays(liveCrew: LiveCrewMember[]): Record<string, LiveOverlay> {
  const overlays: Record<string, LiveOverlay> = {};
  for (const c of liveCrew) {
    const overlay: LiveOverlay = {};
    // Column G (personal_email at index 6) is used for apprentice % in the spec
    // But based on the API mapping, personal_email is column G
    // The spec says "apprentice % next to each apprentice's name (read from column G of Users_Roles)"
    // Column G in the sheet = index 6 = personal_email field in the API
    // This might actually be a progress/completion percentage stored there
    if (c.role.includes('Apprentice') && c.personal_email) {
      // If it looks like a percentage or number, show it
      const val = c.personal_email.trim();
      if (/^\d+%?$/.test(val)) {
        overlay.apprenticePct = val.includes('%') ? val : `${val}%`;
      }
    }

    // Detect temp assignments from notes
    if (c.notes) {
      const tempMatch = c.notes.match(/\b(Maui|Oahu|Kauai|Hawaii|Big Island)\b/i);
      if (tempMatch && tempMatch[1].toLowerCase() !== c.island.toLowerCase()) {
        overlay.tempAssignment = tempMatch[1];
      }
      overlay.notes = c.notes;
    }

    overlays[c.name] = overlay;
  }
  return overlays;
}

// ── Main panel ────────────────────────────────────────────────────────────
export default function OrgChartPanel() {
  const [liveCrew, setLiveCrew] = useState<LiveCrewMember[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [liveCount, setLiveCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/crew')
      .then(r => r.json())
      .then(d => {
        const all = d.all || [];
        setLiveCrew(all);
        setLiveCount(all.length);
        setLastUpdated(new Date().toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit',
        }));
      })
      .catch(() => {});
  }, []);

  const overlays = buildOverlays(liveCrew);
  const headcount = liveCount || 42;

  const jody = ORG;
  const sean = ORG.children[0];
  const seanReports = sean.children;

  return (
    <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>People & Assets</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Org Chart</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              {headcount} people · Oahu · Maui · Kauai
              {lastUpdated && (
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 12 }}>
                  Last updated: {lastUpdated}
                </span>
              )}
            </p>
          </div>
          <Legend />
        </div>
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', paddingBottom: 24 }}>
        <div style={{ minWidth: 900 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 0 }}>
            <NodeCard node={jody} overlay={overlays[jody.name]} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 2, height: 20, background: '#e2e8f0' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 0 }}>
            <NodeCard node={sean} overlay={overlays[sean.name]} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 2, height: 20, background: '#e2e8f0' }} />
          </div>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <div style={{ height: 2, background: '#e2e8f0', width: '85%', maxWidth: 1100 }} />
          </div>

          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* MAUI OFFICE */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 340 }}>
              <div style={{ width: 2, height: 16, background: '#e2e8f0' }} />
              <div style={{ background: 'rgba(15,118,110,0.04)', border: '2px solid rgba(15,118,110,0.15)', borderRadius: 18, padding: '14px 16px 20px' }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#0f766e', textAlign: 'center', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#0f766e' }} />
                  Maui Office — HQ
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
                  {seanReports.filter(r => ['mark','tia','jenny','nate'].includes(r.id)).map(report => (
                    <div key={report.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <SeanReportSection node={report} overlays={overlays} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* OAHU OFFICE */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 240 }}>
              <div style={{ width: 2, height: 16, background: '#e2e8f0' }} />
              <div style={{ background: 'rgba(3,105,161,0.04)', border: '2px solid rgba(3,105,161,0.15)', borderRadius: 18, padding: '14px 16px 20px' }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#0369a1', textAlign: 'center', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#0369a1' }} />
                  Oahu Office
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
                  {seanReports.filter(r => r.id === 'frank').map(report => (
                    <div key={report.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <SeanReportSection node={report} overlays={overlays} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer with live data */}
      <div style={{ marginTop: 20, padding: '14px 20px', background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Headcount', value: headcount },
          { label: 'Management Team', value: 4, note: 'Sean · Frank · Jenny · Nate' },
          { label: 'Office / PM', value: 8 },
          { label: 'Superintendents', value: 2, note: 'Karl Sr. (Oahu) · Nate (Maui + Outer)' },
          { label: 'Journeymen', value: liveCrew.filter(c => c.role.includes('Journeyman')).length || 20 },
          { label: 'Apprentices', value: liveCrew.filter(c => c.role.includes('Apprentice')).length || 10 },
        ].map(({ label, value, note }) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: '#0f172a' }}>{value}</div>
            {note && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
