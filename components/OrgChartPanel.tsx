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
  Oahu: 'var(--bos-color-accent-data)', Maui: 'var(--bos-color-brand-primary-deep)', Kauai: '#6d28d9', Hawaii: 'var(--color-amber-800)',
  Lanai: '#7c3aed', Molokai: '#a16207',
};

const ROLE_COLOR: Record<string, string> = {
  owner: 'var(--color-ink-primary)', gm: 'var(--bos-color-accent-data)', pm: 'var(--bos-color-brand-primary-deep)', estimator: 'var(--bos-color-brand-primary-deep)',
  admin_mgr: '#7c3aed', admin: '#7c3aed', service_pm: '#6d28d9',
  super: 'var(--color-amber-800)', sales: 'var(--bos-color-brand-primary-deep)', pm_track: '#7c3aed',
  journeyman: 'var(--color-ink-secondary)', apprentice: 'var(--bos-color-ink-tertiary)', laborer: 'var(--bos-color-ink-tertiary)',
  glazier: 'var(--color-ink-secondary)', field: 'var(--color-ink-secondary)',
};

function getColor(role: string): string {
  const r = role.toLowerCase().replace(/\s+/g, '_');
  for (const [k, v] of Object.entries(ROLE_COLOR)) {
    if (r.includes(k)) return v;
  }
  return 'var(--bos-color-ink-disabled)';
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
    // Maui super covers Maui + all outer islands (Kauai, Lanai, Molokai, Hawaii)
    // Other supers cover only their base island
    const superIslands = [s.island.toLowerCase()];
    if (s.island.toLowerCase() === 'maui') {
      for (const outerIsland of ['kauai', 'lanai', 'molokai', 'hawaii']) {
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

  // Find Frank (Oahu operations lead) and other PMs
  const frank = pms.find(p => p.role.toLowerCase().includes('senior'));
  const oahuSuper = superNodes.find(s => s.island.toLowerCase() === 'oahu');
  const mauiSuper = superNodes.find(s => s.island.toLowerCase() === 'maui');
  const otherPms = pms.filter(p => p.name !== frank?.name);
  const adminNodes: OrgNode[] = adminStaff.map(a => toNode(a));

  // Build Frank's Oahu operations node — Frank runs Oahu, Karl Sr reports to Frank
  const frankNode: OrgNode = frank ? toNode(frank) : null as unknown as OrgNode;
  if (frankNode) {
    frankNode.note = 'Oahu Operations Lead';
    frankNode.children = oahuSuper ? [oahuSuper] : [];
  }

  // Build Sean/GM node — runs Maui + outer islands
  const gmNode: OrgNode = gm ? toNode(gm) : {
    id: 'gm', name: 'General Manager', title: 'GM', island: 'Maui', color: 'var(--bos-color-accent-data)', children: [],
  };
  if (gm) gmNode.note = 'Maui + Outer Islands';

  // Sean's direct reports: other PMs, admin staff, Nate (Maui super)
  // Frank's Oahu team is separate
  const mauiTeam = [...otherPms.map(p => { const n = toNode(p); n.note = 'Management Team'; return n; }), ...adminNodes];
  if (mauiSuper) mauiTeam.push(mauiSuper);
  gmNode.children = mauiTeam;

  // Build owner node — floats above all
  const ownerNode: OrgNode = owner ? toNode(owner) : {
    id: 'owner', name: 'Owner', title: 'Owner / President', island: 'Maui', color: 'var(--color-ink-primary)', children: [],
  };
  // Owner's direct reports: Sean (Maui+outer) and Frank (Oahu)
  ownerNode.children = [gmNode];
  if (frankNode) ownerNode.children.push(frankNode);

  return ownerNode;
}

// ── Node card component ──────────────────────────────────────────────────
function NodeCard({ node, compact = false }: { node: OrgNode; compact?: boolean }) {
  const islandColor = ISLAND_COLOR[node.island] || 'var(--bos-color-ink-disabled)';
  const isLeader = ['owner', 'gm', 'pm', 'estimator', 'admin_mgr', 'service_pm', 'sales', 'super'].some(r =>
    node.title.toLowerCase().includes(r) || node.color === 'var(--color-ink-primary)' || node.color === 'var(--bos-color-accent-data)'
  );
  const tier = node.children.length > 0 || isLeader ? (node.color === 'var(--color-ink-primary)' ? 0 : node.color === 'var(--bos-color-accent-data)' ? 1 : 2) : 3;

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
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
      <div style={{ fontSize: tier <= 1 ? 14 : tier <= 2 ? 12 : 11, fontWeight: 800, color: 'var(--color-ink-primary)', lineHeight: 1.3, marginBottom: 3 }}>
        {node.name}
      </div>
      <div style={{ fontSize: tier <= 1 ? 10 : 9, fontWeight: 700, color: node.color, lineHeight: 1.3 }}>
        {node.title}
      </div>
      {node.note && (
        <div style={{
          fontSize: 8, fontWeight: 700, borderRadius: 4, padding: '1px 6px', marginTop: 4,
          color: node.note.includes('Management') ? 'var(--bos-color-brand-primary-deep)' : 'var(--color-amber-800)',
          background: node.note.includes('Management') ? 'var(--color-teal-50)' : 'var(--color-amber-50)',
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
                <div style={{ width: 2, height: 12, background: 'var(--color-surface-border)' }} />
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
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '6px 12px', background: 'white', borderRadius: 10, border: '1px solid var(--color-surface-border)' }}>
      {Object.entries(ISLAND_COLOR).slice(0, 4).map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-disabled)' }}>{label}</span>
        </div>
      ))}
      <div style={{ width: 1, height: 14, background: 'var(--color-surface-border)', margin: '0 4px' }} />
      <span style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)' }}>Live from crew database</span>
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
  // Jody (owner) at top, then two branches: Sean (Maui+outer) and Frank (Oahu)
  const ownerNode = orgTree;
  const seanBranch = orgTree?.children.find(c => c.title.toLowerCase().includes('general manager'));
  const frankBranch = orgTree?.children.find(c => c.title.toLowerCase().includes('senior') || c.note?.includes('Oahu'));

  // Sean's reports for Maui office
  const seanReports = seanBranch?.children || [];
  const mauiSuper = seanReports.find(n => n.note?.includes('Superintendent'));
  const mauiStaff = seanReports.filter(n => n !== mauiSuper);

  // Frank's reports for Oahu office
  const frankReports = frankBranch?.children || [];
  const oahuSuper = frankReports.find(n => n.note?.includes('Superintendent'));
  const oahuStaff = frankReports.filter(n => n !== oahuSuper);

  return (
    <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--bos-color-ink-tertiary)', marginBottom: 8 }}>People & Assets</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--color-ink-primary)', margin: 0, marginBottom: 4 }}>Org Chart</h1>
            <p style={{ fontSize: 13, color: 'var(--bos-color-ink-disabled)', margin: 0 }}>
              {crew.length} people · Live from crew database
              {lastUpdated && (
                <span style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginLeft: 12 }}>
                  Updated: {lastUpdated}
                </span>
              )}
            </p>
          </div>
          <Legend />
        </div>
      </div>

      {loading ? (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid var(--color-surface-border)', padding: 48, textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: 'var(--bos-color-brand-primary)', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: 'var(--bos-color-ink-tertiary)' }}>Loading org chart...</div>
        </div>
      ) : !orgTree ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)' }}>No crew data available</div>
      ) : (
        <div style={{ overflowX: 'auto', paddingBottom: 24 }}>
          <div style={{ minWidth: 900 }}>
            {/* Owner — floats above all */}
            {ownerNode && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 0 }}>
                <NodeCard node={{ ...ownerNode, children: [] }} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 2, height: 20, background: 'var(--color-surface-border)' }} />
            </div>

            {/* Horizontal connector — two branches */}
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
              <div style={{ height: 2, background: 'var(--color-surface-border)', width: '60%', maxWidth: 800 }} />
            </div>

            {/* Two branches: Sean (Maui+Outer) and Frank (Oahu) */}
            <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start' }}>

              {/* MAUI + OUTER ISLANDS — Sean's branch */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 2, height: 16, background: 'var(--color-surface-border)' }} />
                {seanBranch && (
                  <div style={{ marginBottom: 12 }}>
                    <NodeCard node={{ ...seanBranch, children: [] }} />
                  </div>
                )}
                <div style={{ width: 2, height: 12, background: 'var(--color-surface-border)' }} />
                <IslandSection
                  label="Maui Office — HQ + Outer Islands"
                  color="var(--bos-color-brand-primary-deep)"
                  borderColor="rgba(15,118,110,0.15)"
                  superNode={mauiSuper}
                  officeStaff={mauiStaff}
                />
              </div>

              {/* OAHU — Frank's branch */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 2, height: 16, background: 'var(--color-surface-border)' }} />
                {frankBranch && (
                  <div style={{ marginBottom: 12 }}>
                    <NodeCard node={{ ...frankBranch, children: [] }} />
                  </div>
                )}
                <div style={{ width: 2, height: 12, background: 'var(--color-surface-border)' }} />
                <IslandSection
                  label="Oahu Office"
                  color="var(--bos-color-accent-data)"
                  borderColor="rgba(3,105,161,0.15)"
                  superNode={oahuSuper}
                  officeStaff={oahuStaff}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer stats */}
      {!loading && crew.length > 0 && (
        <div style={{ marginTop: 20, padding: '14px 20px', background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Headcount', value: crew.length },
            { label: 'Management', value: crew.filter(c => ['gm','owner','pm','estimator','admin_mgr','service_pm','sales'].some(r => c.role.toLowerCase().includes(r))).length },
            { label: 'Superintendents', value: crew.filter(c => c.role.toLowerCase().includes('super')).length },
            { label: 'Journeymen', value: crew.filter(c => c.role.toLowerCase().includes('journeyman')).length },
            { label: 'Apprentices', value: crew.filter(c => c.role.toLowerCase().includes('apprentice')).length },
            { label: 'Islands', value: [...new Set(crew.map(c => c.island).filter(Boolean))].length },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bos-color-ink-tertiary)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--color-ink-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
