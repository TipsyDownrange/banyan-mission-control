'use client';
import { useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────
type CrewMember = {
  user_id: string; name: string; role: string; email: string;
  phone: string; island: string; personal_email: string; title: string;
  department: string; office: string; home_address: string;
  emergency_contact: string; start_date: string; notes: string;
  authority_level: string; career_track: string;
};

type OrgNode = {
  id: string; name: string; title: string; island: string;
  color: string; note?: string; children: OrgNode[];
  email?: string; phone?: string; department?: string;
};

// ── Colors ──────────────────────────────────────────────────────────────
const ISLAND_COLOR: Record<string, string> = {
  Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e',
  Lanai: '#7c3aed', Molokai: '#a16207',
};

const ROLE_COLOR: Record<string, string> = {
  owner: '#0f172a', gm: '#0369a1', pm: '#0f766e', estimator: '#0f766e',
  admin_mgr: '#7c3aed', admin: '#7c3aed', service_pm: '#6d28d9',
  super: '#92400e', sales: '#0f766e', pm_track: '#7c3aed',
  journeyman: '#334155', apprentice: '#94a3b8', laborer: '#94a3b8',
  glazier: '#334155', field: '#334155',
};

function getColor(role: string): string {
  const r = role.toLowerCase().replace(/\s+/g, '_');
  for (const [k, v] of Object.entries(ROLE_COLOR)) {
    if (r.includes(k)) return v;
  }
  return '#64748b';
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function avatarBg(color: string): string {
  return `${color}1A`; // 10% opacity hex
}

// ── Build org tree from live crew data ──────────────────────────────────
function buildOrgTree(crew: CrewMember[]): OrgNode | null {
  if (crew.length === 0) return null;

  function toNode(c: CrewMember): OrgNode {
    return {
      id: c.user_id || c.name.toLowerCase().replace(/\s+/g, '_'),
      name: c.name,
      title: c.title || c.role || '',
      island: c.island || 'Maui',
      color: getColor(c.role),
      email: c.email,
      phone: c.phone,
      department: c.department,
      children: [],
    };
  }

  // Find key people by role
  const owner = crew.find(c => c.role.toLowerCase().includes('owner'));
  const gm = crew.find(c => c.role.toLowerCase().startsWith('gm') || c.role.toLowerCase().includes('general manager'));
  const supers = crew.filter(c => c.role.toLowerCase().includes('super') && !c.role.toLowerCase().includes('admin'));
  const pms = crew.filter(c =>
    (c.role.toLowerCase().includes('pm') || c.role.toLowerCase().includes('project manager') || c.role.toLowerCase() === 'estimator' || c.role.toLowerCase().includes('sales'))
    && !c.role.toLowerCase().includes('super')
    && c.name !== gm?.name && c.name !== owner?.name
  );
  const adminStaff = crew.filter(c =>
    (c.role.toLowerCase().includes('admin') || c.role.toLowerCase().includes('pm_track'))
    && !supers.find(s => s.name === c.name)
    && !pms.find(p => p.name === c.name)
    && c.name !== gm?.name && c.name !== owner?.name
  );
  const fieldCrew = crew.filter(c =>
    (c.role.toLowerCase().includes('journeyman') || c.role.toLowerCase().includes('apprentice') ||
     c.role.toLowerCase().includes('laborer') || c.role.toLowerCase().includes('glazier') ||
     c.role.toLowerCase().includes('field'))
    && !supers.find(s => s.name === c.name)
    && !pms.find(p => p.name === c.name)
    && !adminStaff.find(a => a.name === c.name)
    && c.name !== gm?.name && c.name !== owner?.name
  );

  // Build superintendent nodes with their field crews grouped by island
  const superNodes: OrgNode[] = supers.map(s => {
    const superNode = toNode(s);
    superNode.note = `Superintendent — ${s.island}`;
    // Assign field crew: match by island, or if super is "Outer Island" give them Kauai/Lanai/Molokai/Hawaii crew
    // Each super covers their island + outer islands not covered by other supers
    const otherSuperIslands = supers.filter(os => os.name !== s.name).map(os => os.island.toLowerCase());
    const superIslands = [s.island.toLowerCase()];
    // Add outer islands (Kauai, Lanai, Molokai, Hawaii) to Maui super if no other super covers them
    for (const outerIsland of ['kauai', 'lanai', 'molokai', 'hawaii']) {
      if (!otherSuperIslands.includes(outerIsland)) {
        superIslands.push(outerIsland);
      }
    }

    superNode.children = fieldCrew
      .filter(fc => superIslands.includes((fc.island || '').toLowerCase()))
      .sort((a, b) => {
        // Journeymen first, then apprentices
        const aRank = a.role.toLowerCase().includes('apprentice') ? 1 : 0;
        const bRank = b.role.toLowerCase().includes('apprentice') ? 1 : 0;
        return aRank - bRank || a.name.localeCompare(b.name);
      })
      .map(fc => toNode(fc));

    return superNode;
  });

  // Build PM/office nodes
  const pmNodes: OrgNode[] = pms.map(p => { const n = toNode(p); n.note = 'Management Team'; return n; });
  const adminNodes: OrgNode[] = adminStaff.map(a => toNode(a));

  // Build GM node
  const gmNode: OrgNode = gm ? toNode(gm) : {
    id: 'gm', name: 'General Manager', title: 'GM', island: 'Maui', color: '#0369a1', children: [],
  };
  if (gm) gmNode.note = 'Management Team';

  // GM's direct reports: PMs, admin staff, supers
  gmNode.children = [...pmNodes, ...adminNodes, ...superNodes];

  // Build owner node
  const ownerNode: OrgNode = owner ? toNode(owner) : {
    id: 'owner', name: 'Owner', title: 'Owner / President', island: 'Oahu', color: '#0f172a', children: [],
  };
  ownerNode.children = [gmNode];

  return ownerNode;
}

// ── Node card component ──────────────────────────────────────────────────
function NodeCard({ node, compact = false }: { node: OrgNode; compact?: boolean }) {
  const islandColor = ISLAND_COLOR[node.island] || '#64748b';
  const isLeader = ['owner', 'gm', 'pm', 'estimator', 'admin_mgr', 'service_pm', 'sales', 'super'].some(r =>
    node.title.toLowerCase().includes(r) || node.color === '#0f172a' || node.color === '#0369a1'
  );
  const tier = node.children.length > 0 || isLeader ? (node.color === '#0f172a' ? 0 : node.color === '#0369a1' ? 1 : 2) : 3;

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
            {node.name}
          </div>
          <div style={{ fontSize: 9, color: node.color, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.title}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: islandColor, flexShrink: 0 }} title={node.island} />
      </div>
    );
  }

  return (
    <div style={{
      background: 'white', borderRadius: 14,
      border: `1.5px solid ${node.color}33`,
      padding: tier <= 1 ? '16px 20px' : tier <= 2 ? '12px 16px' : '10px 14px',
      boxShadow: tier <= 1 ? '0 4px 20px rgba(15,23,42,0.1)' : tier <= 2 ? '0 2px 10px rgba(15,23,42,0.06)' : '0 1px 4px rgba(15,23,42,0.04)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      minWidth: tier <= 1 ? 180 : tier <= 2 ? 160 : 140,
      maxWidth: tier <= 1 ? 220 : 180,
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', background: islandColor }} title={node.island} />
      <div style={{
        width: tier <= 1 ? 48 : tier <= 2 ? 40 : 34,
        height: tier <= 1 ? 48 : tier <= 2 ? 40 : 34,
        borderRadius: '50%',
        background: avatarBg(node.color),
        border: `2px solid ${node.color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: tier <= 1 ? 14 : 11, fontWeight: 900, color: node.color,
        marginBottom: 8, flexShrink: 0,
      }}>
        {getInitials(node.name)}
      </div>
      <div style={{ fontSize: tier <= 1 ? 14 : tier <= 2 ? 12 : 11, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, marginBottom: 3 }}>
        {node.name}
      </div>
      <div style={{ fontSize: tier <= 1 ? 10 : 9, fontWeight: 700, color: node.color, lineHeight: 1.3 }}>
        {node.title}
      </div>
      {node.note && (
        <div style={{
          fontSize: 8, fontWeight: 700, borderRadius: 4, padding: '1px 6px', marginTop: 4,
          color: node.note.includes('Management') ? '#0f766e' : '#92400e',
          background: node.note.includes('Management') ? '#f0fdfa' : '#fffbeb',
        }}>
          {node.note.includes('Management') ? '★ Management Team' : node.note}
        </div>
      )}
    </div>
  );
}

// ── Island section — groups people by island under a superintendent ──────
function IslandSection({ label, color, borderColor, superNode, officeStaff = [] }: {
  label: string; color: string; borderColor: string;
  superNode?: OrgNode; officeStaff?: OrgNode[];
}) {
  const allPeople = [...officeStaff, ...(superNode ? [superNode] : [])];
  if (allPeople.length === 0) return null;

  return (
    <div style={{
      background: `${color}08`,
      border: `2px solid ${borderColor}`,
      borderRadius: 18, padding: '14px 16px 20px',
      minWidth: 280,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
        color, textAlign: 'center', marginBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
        {label}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
        {officeStaff.map(person => (
          <div key={person.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <NodeCard node={person} />
          </div>
        ))}
        {superNode && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <NodeCard node={superNode} />
            {superNode.children.length > 0 && (
              <>
                <div style={{ width: 2, height: 12, background: '#e2e8f0' }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 500 }}>
                  {superNode.children.map(child => (
                    <NodeCard key={child.id} node={child} compact={superNode.children.length > 4} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '6px 12px', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0' }}>
      {Object.entries(ISLAND_COLOR).slice(0, 4).map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{label}</span>
        </div>
      ))}
      <div style={{ width: 1, height: 14, background: '#e2e8f0', margin: '0 4px' }} />
      <span style={{ fontSize: 10, color: '#94a3b8' }}>Live from crew database</span>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────
export default function OrgChartPanel() {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    fetch('/api/crew')
      .then(r => r.json())
      .then(d => {
        setCrew(d.all || []);
        setLastUpdated(new Date().toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit',
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const orgTree = buildOrgTree(crew);

  // Extract sections for layout
  const owner = orgTree;
  const gm = orgTree?.children[0];
  const gmReports = gm?.children || [];

  // Group GM's reports by island for display
  const mauiOffice = gmReports.filter(n =>
    n.island.toLowerCase() === 'maui' || n.note?.toLowerCase().includes('maui')
  );
  const oahuOffice = gmReports.filter(n =>
    n.island.toLowerCase() === 'oahu' && !mauiOffice.includes(n)
  );
  const otherOffice = gmReports.filter(n =>
    !mauiOffice.includes(n) && !oahuOffice.includes(n)
  );

  // Find superintendents for island sections
  const mauiSuper = mauiOffice.find(n => n.note?.includes('Superintendent'));
  const oahuSuper = oahuOffice.find(n => n.note?.includes('Superintendent'));
  const mauiStaff = mauiOffice.filter(n => n !== mauiSuper);
  const oahuStaff = oahuOffice.filter(n => n !== oahuSuper);

  return (
    <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>People & Assets</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Org Chart</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              {crew.length} people · Live from crew database
              {lastUpdated && (
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 12 }}>
                  Updated: {lastUpdated}
                </span>
              )}
            </p>
          </div>
          <Legend />
        </div>
      </div>

      {loading ? (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', padding: 48, textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading org chart...</div>
        </div>
      ) : !orgTree ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No crew data available</div>
      ) : (
        <div style={{ overflowX: 'auto', paddingBottom: 24 }}>
          <div style={{ minWidth: 900 }}>
            {/* Owner */}
            {owner && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 0 }}>
                <NodeCard node={owner} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 2, height: 20, background: '#e2e8f0' }} />
            </div>

            {/* GM */}
            {gm && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 0 }}>
                <NodeCard node={{ ...gm, children: [] }} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 2, height: 20, background: '#e2e8f0' }} />
            </div>

            {/* Horizontal connector */}
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
              <div style={{ height: 2, background: '#e2e8f0', width: '85%', maxWidth: 1100 }} />
            </div>

            {/* Island offices */}
            <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 2, height: 16, background: '#e2e8f0' }} />
                <IslandSection
                  label="Maui Office — HQ"
                  color="#0f766e"
                  borderColor="rgba(15,118,110,0.15)"
                  superNode={mauiSuper}
                  officeStaff={mauiStaff}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 2, height: 16, background: '#e2e8f0' }} />
                <IslandSection
                  label="Oahu Office"
                  color="#0369a1"
                  borderColor="rgba(3,105,161,0.15)"
                  superNode={oahuSuper}
                  officeStaff={oahuStaff}
                />
              </div>
              {otherOffice.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 2, height: 16, background: '#e2e8f0' }} />
                  <IslandSection
                    label="Other"
                    color="#64748b"
                    borderColor="rgba(100,116,139,0.15)"
                    officeStaff={otherOffice}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer stats */}
      {!loading && crew.length > 0 && (
        <div style={{ marginTop: 20, padding: '14px 20px', background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Headcount', value: crew.length },
            { label: 'Management', value: crew.filter(c => ['gm','owner','pm','estimator','admin_mgr','service_pm','sales'].some(r => c.role.toLowerCase().includes(r))).length },
            { label: 'Superintendents', value: crew.filter(c => c.role.toLowerCase().includes('super')).length },
            { label: 'Journeymen', value: crew.filter(c => c.role.toLowerCase().includes('journeyman')).length },
            { label: 'Apprentices', value: crew.filter(c => c.role.toLowerCase().includes('apprentice')).length },
            { label: 'Islands', value: [...new Set(crew.map(c => c.island).filter(Boolean))].length },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: '#0f172a' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
