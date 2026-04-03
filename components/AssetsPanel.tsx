'use client';
import { useState, useEffect, useCallback, memo } from 'react';

type Vehicle = {
  asset_id: string; license_plate: string; year: string; make: string; model: string;
  color: string; type: string; vin: string; island: string; assigned_to: string;
  registration_exp: string; safety_exp: string; insurance_exp: string;
  last_service_date: string; notes: string; status: string;
};

type Equipment = {
  asset_id: string; name: string; category: string; make: string; model: string;
  serial_number: string; island: string; assigned_to: string; purchase_date: string;
  last_service_date: string; next_service_due: string; notes: string; status: string;
};

const ISLAND_COLOR: Record<string, string> = {
  Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e',
};

const INP: React.CSSProperties = {
  width: '100%', padding: '6px 9px', borderRadius: 8,
  border: '1px solid #e2e8f0', background: 'white',
  fontSize: 12, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
};

function isExpiringSoon(dateStr: string): boolean {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    return d.getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000; // 60 days
  } catch { return false; }
}

function isExpired(dateStr: string): boolean {
  if (!dateStr) return false;
  try { return new Date(dateStr).getTime() < Date.now(); }
  catch { return false; }
}

type VehicleCardProps = {
  v: Vehicle; isEditing: boolean; draft: Partial<Vehicle>;
  onEditStart: (id: string) => void; onDraftChange: (field: keyof Vehicle, val: string) => void;
  onSave: (id: string) => void; onCancel: () => void; saving: boolean;
};

const VehicleCard = memo(function VehicleCard({ v, isEditing, draft, onEditStart, onDraftChange, onSave, onCancel, saving }: VehicleCardProps) {
  const d = isEditing ? { ...v, ...draft } : v;
  const regExp = isExpired(d.registration_exp);
  const regSoon = !regExp && isExpiringSoon(d.registration_exp);

  return (
    <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${isEditing ? 'rgba(15,118,110,0.2)' : '#e2e8f0'}`, padding: '12px 14px', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
      {isEditing ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div><div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>License Plate</div><input value={draft.license_plate ?? v.license_plate} onChange={e => onDraftChange('license_plate', e.target.value)} style={INP} /></div>
            <div><div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Year / Make / Model</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input value={draft.year ?? v.year} onChange={e => onDraftChange('year', e.target.value)} style={{ ...INP, width: 50 }} placeholder="Year" />
                <input value={draft.make ?? v.make} onChange={e => onDraftChange('make', e.target.value)} style={{ ...INP, flex: 1 }} placeholder="Make" />
                <input value={draft.model ?? v.model} onChange={e => onDraftChange('model', e.target.value)} style={{ ...INP, flex: 1 }} placeholder="Model" />
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div><div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Island</div>
              <select value={draft.island ?? v.island} onChange={e => onDraftChange('island', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                <option>Maui</option><option>Oahu</option><option>Kauai</option><option>Hawaii</option>
              </select>
            </div>
            <div><div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Assigned To</div><input value={draft.assigned_to ?? v.assigned_to} onChange={e => onDraftChange('assigned_to', e.target.value)} style={INP} /></div>
            <div><div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Status</div>
              <select value={draft.status ?? v.status} onChange={e => onDraftChange('status', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                <option>Active</option><option>Out of Service</option><option>In Shop</option><option>Retired</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div><div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Reg. Expires</div><input type="date" value={draft.registration_exp ?? v.registration_exp} onChange={e => onDraftChange('registration_exp', e.target.value)} style={INP} /></div>
            <div><div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Safety Expires</div><input type="date" value={draft.safety_exp ?? v.safety_exp} onChange={e => onDraftChange('safety_exp', e.target.value)} style={INP} /></div>
            <div><div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Last Service</div><input type="date" value={draft.last_service_date ?? v.last_service_date} onChange={e => onDraftChange('last_service_date', e.target.value)} style={INP} /></div>
          </div>
          <div><div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Notes</div><input value={draft.notes ?? v.notes} onChange={e => onDraftChange('notes', e.target.value)} style={INP} placeholder="Notes..." /></div>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button onClick={() => onSave(v.asset_id)} disabled={saving} style={{ padding: '4px 12px', borderRadius: 8, background: saving ? '#e2e8f0' : '#0f766e', color: saving ? '#94a3b8' : 'white', border: 'none', fontSize: 10, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={onCancel} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{v.license_plate}</span>
                {v.island && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 999, color: ISLAND_COLOR[v.island] || '#64748b', border: '1px solid currentColor', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{v.island}</span>}
                {v.status !== 'Active' && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, color: '#b91c1c', background: '#fef2f2', border: '1px solid rgba(185,28,28,0.2)' }}>{v.status}</span>}
              </div>
              <div style={{ fontSize: 12, color: '#334155' }}>{v.year} {v.make} {v.model} {v.color && `· ${v.color}`} {v.type && `· ${v.type}`}</div>
              {v.assigned_to && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>→ {v.assigned_to}</div>}
            </div>
            <button onClick={() => onEditStart(v.asset_id)} style={{ padding: '3px 8px', borderRadius: 8, border: '1px solid rgba(15,118,110,0.2)', background: 'rgba(240,253,250,0.8)', color: '#0f766e', fontSize: 9, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Edit</button>
          </div>
          {/* Expiry badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {v.registration_exp && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, background: regExp ? '#fef2f2' : regSoon ? '#fffbeb' : '#f0fdfa', color: regExp ? '#b91c1c' : regSoon ? '#92400e' : '#0f766e', fontWeight: 700, border: `1px solid ${regExp ? 'rgba(185,28,28,0.2)' : regSoon ? 'rgba(245,158,11,0.2)' : 'rgba(15,118,110,0.2)'}` }}>Reg: {v.registration_exp}</span>}
            {v.last_service_date && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, background: '#f8fafc', color: '#64748b', fontWeight: 600, border: '1px solid #e2e8f0' }}>Last service: {v.last_service_date}</span>}
            {v.notes && <span style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>{v.notes}</span>}
          </div>
        </div>
      )}
    </div>
  );
});

export default function AssetsPanel() {
  const [tab, setTab] = useState<'vehicles' | 'equipment'>('vehicles');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Vehicle | Equipment>>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [islandFilter, setIslandFilter] = useState('All');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/assets?type=vehicles').then(r => r.json()),
      fetch('/api/assets?type=equipment').then(r => r.json()),
    ]).then(([vd, ed]) => {
      setVehicles(vd.assets || []);
      setEquipment(ed.assets || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const onEditStart = useCallback((id: string) => { setEditing(id); setDraft({}); }, []);
  const onDraftChange = useCallback((field: string, val: string) => { setDraft(p => ({ ...p, [field]: val })); }, []);
  const onCancel = useCallback(() => { setEditing(null); setDraft({}); }, []);

  const onSave = useCallback(async (id: string) => {
    setSaving(true);
    await fetch('/api/assets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: tab, asset_id: id, ...draft }),
    });
    setSaving(false);
    setEditing(null);
    setDraft({});
    load();
  }, [tab, draft, load]);

  async function addItem() {
    setSaving(true);
    await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: tab, ...newItem }),
    });
    setSaving(false);
    setShowAdd(false);
    setNewItem({});
    load();
  }

  const filteredVehicles = islandFilter === 'All' ? vehicles : vehicles.filter(v => v.island === islandFilter);
  const islands = ['All', 'Oahu', 'Maui', 'Kauai', 'Hawaii'];
  const expiringSoon = vehicles.filter(v => isExpiringSoon(v.registration_exp) || isExpired(v.registration_exp)).length;

  return (
    <div style={{ padding: '32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>People & Assets</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Assets</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['vehicles', 'equipment'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', border: tab === t ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0', background: tab === t ? 'rgba(240,253,250,0.96)' : 'white', color: tab === t ? '#0f766e' : '#64748b', cursor: 'pointer' }}>
                {t === 'vehicles' ? `Vehicles (${vehicles.length})` : `Equipment (${equipment.length})`}
              </button>
            ))}
            <button onClick={() => setShowAdd(true)} style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,118,110,0.3)' }}>
              + Add {tab === 'vehicles' ? 'Vehicle' : 'Equipment'}
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {expiringSoon > 0 && tab === 'vehicles' && (
        <div style={{ padding: '10px 16px', borderRadius: 12, background: '#fffbeb', border: '1px solid rgba(245,158,11,0.3)', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 16 }}>
          {expiringSoon} vehicle{expiringSoon > 1 ? 's' : ''} with expiring or expired registration/safety/insurance — review below
        </div>
      )}

      {/* Island filter */}
      {tab === 'vehicles' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {islands.map(isl => (
            <button key={isl} onClick={() => setIslandFilter(isl)} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, border: islandFilter === isl ? `1px solid ${ISLAND_COLOR[isl] || '#0f766e'}` : '1px solid #e2e8f0', background: islandFilter === isl ? `${ISLAND_COLOR[isl] || '#0f766e'}12` : 'white', color: islandFilter === isl ? (ISLAND_COLOR[isl] || '#0f766e') : '#64748b', cursor: 'pointer' }}>
              {isl} {isl !== 'All' ? `(${vehicles.filter(v => v.island === isl).length})` : `(${vehicles.length})`}
            </button>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading assets...</div>}

      {/* Vehicle grid */}
      {!loading && tab === 'vehicles' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 10 }}>
          {filteredVehicles.map(v => (
            <VehicleCard key={v.asset_id} v={v}
              isEditing={editing === v.asset_id}
              draft={draft as Partial<Vehicle>}
              onEditStart={onEditStart}
              onDraftChange={onDraftChange as (field: keyof Vehicle, val: string) => void}
              onSave={onSave}
              onCancel={onCancel}
              saving={saving}
            />
          ))}
          {filteredVehicles.length === 0 && <div style={{ gridColumn: '1/-1', padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No vehicles for this filter</div>}
        </div>
      )}

      {/* Equipment list */}
      {!loading && tab === 'equipment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {equipment.map(eq => (
            <div key={eq.asset_id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{eq.name || '—'}</span>
                  {eq.island && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 999, color: ISLAND_COLOR[eq.island] || '#64748b', border: '1px solid currentColor' }}>{eq.island}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{eq.category} {eq.make && `· ${eq.make}`} {eq.model && `· ${eq.model}`}</div>
                {eq.assigned_to && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>→ {eq.assigned_to}</div>}
              </div>
              {eq.next_service_due && (
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 999, background: isExpiringSoon(eq.next_service_due) ? '#fffbeb' : '#f0fdfa', color: isExpiringSoon(eq.next_service_due) ? '#92400e' : '#0f766e', fontWeight: 700, border: '1px solid currentColor', flexShrink: 0 }}>
                  Service: {eq.next_service_due}
                </span>
              )}
            </div>
          ))}
          {equipment.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No equipment logged yet — click + Add Equipment to start</div>}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 24, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 24px 64px rgba(15,23,42,0.15)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Add {tab === 'vehicles' ? 'Vehicle' : 'Equipment'}</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {tab === 'vehicles' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' }}>License Plate</label><input value={newItem.license_plate || ''} onChange={e => setNewItem(p => ({ ...p, license_plate: e.target.value }))} style={INP} /></div>
                    <div><label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' }}>Year</label><input value={newItem.year || ''} onChange={e => setNewItem(p => ({ ...p, year: e.target.value }))} style={INP} /></div>
                    <div><label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' }}>Make</label><input value={newItem.make || ''} onChange={e => setNewItem(p => ({ ...p, make: e.target.value }))} style={INP} /></div>
                    <div><label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' }}>Model</label><input value={newItem.model || ''} onChange={e => setNewItem(p => ({ ...p, model: e.target.value }))} style={INP} /></div>
                    <div><label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' }}>Island</label>
                      <select value={newItem.island || 'Maui'} onChange={e => setNewItem(p => ({ ...p, island: e.target.value }))} style={{ ...INP, cursor: 'pointer' }}>
                        <option>Maui</option><option>Oahu</option><option>Kauai</option><option>Hawaii</option>
                      </select>
                    </div>
                    <div><label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' }}>Type</label>
                      <select value={newItem.type || 'Truck'} onChange={e => setNewItem(p => ({ ...p, type: e.target.value }))} style={{ ...INP, cursor: 'pointer' }}>
                        <option>Truck</option><option>Van</option><option>Glass Truck</option><option>Box Truck</option><option>Pickup</option><option>Car</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div><label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' }}>Name</label><input value={newItem.name || ''} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} style={INP} placeholder="e.g. Magnetic Drill, Scissor Lift" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' }}>Category</label>
                      <select value={newItem.category || 'Tools'} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))} style={{ ...INP, cursor: 'pointer' }}>
                        <option>Tools</option><option>Lift Equipment</option><option>Safety Equipment</option><option>Glazing Equipment</option><option>Power Tools</option><option>Other</option>
                      </select>
                    </div>
                    <div><label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' }}>Island</label>
                      <select value={newItem.island || 'Maui'} onChange={e => setNewItem(p => ({ ...p, island: e.target.value }))} style={{ ...INP, cursor: 'pointer' }}>
                        <option>Maui</option><option>Oahu</option><option>Kauai</option><option>Hawaii</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => { setShowAdd(false); setNewItem({}); }} style={{ flex: 1, padding: 11, borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addItem} disabled={saving} style={{ flex: 2, padding: 11, borderRadius: 12, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Adding...' : `Add ${tab === 'vehicles' ? 'Vehicle' : 'Equipment'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
