'use client';
import { useEffect, useState } from 'react';

type Record_t = Record<string, string>;

export default function CustomersPanel() {
  const [records, setRecords] = useState<Record_t[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'customers' | 'gc'>('gc');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/customers?tab=${tab}&search=${encodeURIComponent(search)}`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setTotal(d.total || 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tab, search]);

  function doSearch() { setSearch(searchInput); }

  const nameKey = tab === 'gc' ? 'Company Name' : 'Name';
  const contactKey = tab === 'gc' ? 'Primary Contact' : 'Primary Contact';
  const emailKey = tab === 'gc' ? 'Contact Email' : 'Email';
  const phoneKey = tab === 'gc' ? 'Contact Phone' : 'Phone';
  const countKey = tab === 'gc' ? 'Bid Count' : 'Job Count';
  const idKey = tab === 'gc' ? 'GC ID' : 'Customer ID';

  return (
    <div style={{ padding: '32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Admin</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Customer Database</h1>
          <div style={{ fontSize: 12, color: '#94a3b8', paddingBottom: 4 }}>Live · Smartsheet migration</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24,
        padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Service customers', value: '275', helper: 'From work order history' },
          { label: 'GC contacts', value: '111', helper: 'From 11 years of bids' },
          { label: 'Showing', value: loading ? '...' : String(total), helper: 'Current filter' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {([['gc','GC Contacts'],['customers','Service Customers']] as const).map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); setSearch(''); setSearchInput(''); }} style={{
            padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            border: tab === k ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0',
            background: tab === k ? 'rgba(240,253,250,0.96)' : 'white',
            color: tab === k ? '#0f766e' : '#64748b', cursor: 'pointer',
          }}>{l}</button>
        ))}
        <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 200 }}>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder={`Search ${tab === 'gc' ? 'GC name, contact, email' : 'customer name, island, contact'}...`}
            style={{ flex: 1, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '8px 14px', fontSize: 13, color: '#0f172a', outline: 'none' }} />
          <button onClick={doSearch} style={{ padding: '8px 16px', borderRadius: 12, background: 'rgba(240,253,250,0.96)', border: '1px solid rgba(15,118,110,0.2)', color: '#0f766e', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Search</button>
          {search && <button onClick={() => { setSearch(''); setSearchInput(''); }} style={{ padding: '8px 12px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Clear</button>}
        </div>
      </div>

      {loading && (
        <div style={{ background: 'white', borderRadius: 20, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading customer database...</div>
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 2px 12px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 140px 140px 60px 32px', padding: '10px 20px', background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid #f1f5f9' }}>
            {['ID', tab === 'gc' ? 'Company' : 'Customer', 'Contact', tab === 'gc' ? 'Email' : 'Island', tab === 'gc' ? 'Bids' : 'Jobs', ''].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>{h}</div>
            ))}
          </div>

          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {records.slice(0, 100).map(r => {
              const id = r[idKey] || '';
              const isExpanded = expanded === id;
              const count = parseInt(r[countKey] || '0');
              return (
                <div key={id}>
                  <div onClick={() => setExpanded(isExpanded ? null : id)}
                    style={{ display: 'grid', gridTemplateColumns: '100px 1fr 140px 140px 60px 32px', padding: '10px 20px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: isExpanded ? 'rgba(240,253,250,0.4)' : 'white', transition: 'background 0.1s' }}>
                    <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>{id}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', paddingRight: 12, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r[nameKey]}</div>
                    <div style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r[contactKey] || '—'}</div>
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r[emailKey] || r['Island'] || '—'}</div>
                    <div style={{ fontSize: 12, fontWeight: count > 5 ? 700 : 400, color: count > 10 ? '#0f766e' : '#64748b', display: 'flex', alignItems: 'center' }}>{count || '—'}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isExpanded ? '▲' : '▼'}</div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '12px 20px', background: 'rgba(248,250,252,0.6)', borderBottom: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
                      {Object.entries(r).filter(([k,v]) => v && k !== idKey && k !== nameKey).map(([k,v]) => (
                        <div key={k}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>{k}</div>
                          <div style={{ fontSize: 12, color: '#334155' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {records.length === 0 && !loading && (
              <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>No records found</div>
            )}
            {records.length > 100 && (
              <div style={{ padding: '12px 20px', fontSize: 12, color: '#94a3b8', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>Showing first 100 of {records.length} — use search to filter</div>
            )}
          </div>

          <div style={{ padding: '10px 20px', borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#94a3b8', background: 'rgba(248,250,252,0.5)' }}>
            {total} records · Click any row to see full details · Data from Smartsheet work orders + bid log
          </div>
        </div>
      )}
    </div>
  );
}
