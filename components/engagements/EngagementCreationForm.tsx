'use client';
import { useEffect, useMemo, useState } from 'react';

type SiteOption = { site_id: string; site_name: string; address?: string; city?: string; island?: string; org_id: string; org_name: string; org_kid?: string };
type UserOption = { user_id: string; name: string; email: string; role: string };

const ENGAGEMENT_TYPES = ['project','work_order_small','work_order_large','warranty_small','warranty_large','maintenance','internal'];
const DRIVE_TEMPLATES = ['project_full','wo_small','wo_large'];

export default function EngagementCreationForm() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [pmUsers, setPmUsers] = useState<UserOption[]>([]);
  const [siteSearch, setSiteSearch] = useState('');
  const [siteId, setSiteId] = useState('');
  const [engagementType, setEngagementType] = useState('project');
  const [routingDecision, setRoutingDecision] = useState<'service_wo' | 'project'>('project');
  const [routingRationale, setRoutingRationale] = useState('');
  const [pmAssignedUserId, setPmAssignedUserId] = useState('');
  const [driveTemplate, setDriveTemplate] = useState('project_full');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/engagements/options')
      .then(r => r.json())
      .then(d => { setSites(d.sites || []); setPmUsers(d.pm_users || []); })
      .catch(e => setMessage(String(e)));
  }, []);

  const filteredSites = useMemo(() => {
    const q = siteSearch.toLowerCase();
    return sites.filter(s => !q || `${s.site_name} ${s.address || ''} ${s.org_name}`.toLowerCase().includes(q)).slice(0, 12);
  }, [sites, siteSearch]);

  const selectedSite = sites.find(s => s.site_id === siteId);

  async function submit() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/engagements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          engagement_type: engagementType,
          routing_decision: routingDecision,
          routing_rationale: routingRationale,
          pm_assigned_user_id: pmAssignedUserId || null,
          drive_folder_template: driveTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessage(`Created ${data.data?.kid || 'engagement'} · Drive folder ready`);
      setSiteSearch(''); setSiteId(''); setRoutingRationale(''); setPmAssignedUserId('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ padding: 18, borderRadius: 20, background: 'white', border: '1px solid rgba(226,232,240,0.92)', boxShadow: '0 10px 26px rgba(15,23,42,0.05)', display: 'grid', gap: 14, marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' }}>PM Handoff</div>
        <h2 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 900, color: 'var(--color-ink-primary)', letterSpacing: '-0.03em' }}>Create Engagement</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, color: '#475569' }}>
          Address / Site
          <input value={siteSearch} onChange={e => setSiteSearch(e.target.value)} placeholder="Search address, site, or org..." style={{ padding: '9px 12px', borderRadius: 12, border: '1px solid var(--color-surface-border)' }} />
          <select value={siteId} onChange={e => setSiteId(e.target.value)} style={{ padding: '9px 12px', borderRadius: 12, border: '1px solid var(--color-surface-border)' }}>
            <option value="">Select address...</option>
            {filteredSites.map(s => <option key={s.site_id} value={s.site_id}>{s.site_name} · {s.org_name}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, color: '#475569' }}>
          Primary org
          <input readOnly value={selectedSite?.org_name || ''} placeholder="Auto-filled from selected address" style={{ padding: '9px 12px', borderRadius: 12, border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }} />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, color: '#475569' }}>
          Engagement type
          <select value={engagementType} onChange={e => setEngagementType(e.target.value)} style={{ padding: '9px 12px', borderRadius: 12, border: '1px solid var(--color-surface-border)' }}>
            {ENGAGEMENT_TYPES.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, color: '#475569' }}>
          Routing decision
          <select value={routingDecision} onChange={e => setRoutingDecision(e.target.value as 'service_wo' | 'project')} style={{ padding: '9px 12px', borderRadius: 12, border: '1px solid var(--color-surface-border)' }}>
            <option value="project">Project</option>
            <option value="service_wo">Service WO</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, color: '#475569' }}>
          PM / Service PM
          <select value={pmAssignedUserId} onChange={e => setPmAssignedUserId(e.target.value)} style={{ padding: '9px 12px', borderRadius: 12, border: '1px solid var(--color-surface-border)' }}>
            <option value="">Awaiting handoff</option>
            {pmUsers.map(u => <option key={u.user_id} value={u.user_id}>{u.name || u.email} · {u.role}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, color: '#475569' }}>
          Drive template
          <select value={driveTemplate} onChange={e => setDriveTemplate(e.target.value)} style={{ padding: '9px 12px', borderRadius: 12, border: '1px solid var(--color-surface-border)' }}>
            {DRIVE_TEMPLATES.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      </div>

      <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, color: '#475569' }}>
        Routing rationale <span style={{ color: 'var(--bos-color-ink-tertiary)', fontWeight: 600 }}>required when routing is set</span>
        <textarea value={routingRationale} onChange={e => setRoutingRationale(e.target.value)} rows={3} style={{ padding: '9px 12px', borderRadius: 12, border: '1px solid var(--color-surface-border)', resize: 'vertical' }} />
      </label>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={submit} disabled={saving || !siteId || !routingRationale.trim()} style={{ padding: '9px 16px', borderRadius: 12, border: '1px solid rgba(15,118,110,0.28)', background: 'rgba(240,253,250,0.96)', color: 'var(--bos-color-brand-primary-deep)', fontSize: 12, fontWeight: 900, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Creating…' : 'Create Engagement'}
        </button>
        {message && <span style={{ fontSize: 13, fontWeight: 700, color: message.includes('Created') ? 'var(--bos-color-brand-primary-deep)' : 'var(--color-red-700)' }}>{message}</span>}
      </div>
    </section>
  );
}
