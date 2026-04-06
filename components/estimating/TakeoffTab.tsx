'use client';
import React, { useState, useEffect, useCallback } from 'react';
import ExpandableTable, { ColumnDef, ExpandableRow } from '@/components/shared/ExpandableTable';
import type { BidSummary } from '@/components/estimating/EstimatingWorkspace';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubView = 'systems' | 'doors' | 'glass' | 'sealant' | 'fasteners' | 'flashing';

type Row = Record<string, string>;

interface TakeoffData {
  assembly_summary: Row[];
  doors: Row[];
  glass: Row[];
  sealant: Row[];
  fasteners: Row[];
  flashing: Row[];
}

// ─── Design helpers ───────────────────────────────────────────────────────────

const FONT = '-apple-system, "SF Pro Display", Inter, system-ui, sans-serif';

const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  HARD:      { color: '#0f766e', bg: 'rgba(20,184,166,0.12)' },
  ALLOWANCE: { color: '#b45309', bg: 'rgba(245,158,11,0.12)' },
  TBD:       { color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  KAI:       { color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLOR[status?.toUpperCase()] ?? { color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: '0.1em',
      textTransform: 'uppercase' as const,
      color: s.color,
      background: s.bg,
      fontFamily: FONT,
    }}>
      {status || '—'}
    </span>
  );
}

function DetailField({ label, value, editable = false }: {
  label: string;
  value: string;
  editable?: boolean;
}) {
  return (
    <div style={{ marginBottom: 2 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
        {label}:{' '}
      </span>
      <span style={{
        fontSize: 11,
        color: editable ? '#0f766e' : '#374151',
        fontWeight: editable ? 600 : 400,
      }}>
        {value || '—'}
      </span>
    </div>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px 16px', marginBottom: 8 }}>
      {children}
    </div>
  );
}

function CalcBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(15,118,110,0.04)',
      border: '1px solid rgba(20,184,166,0.2)',
      borderRadius: 8,
      padding: '8px 12px',
      marginTop: 8,
      fontSize: 11,
      fontFamily: 'monospace',
      color: '#0f172a',
      lineHeight: 1.8,
    }}>
      {children}
    </div>
  );
}

function num(v: string | undefined, decimals = 2): string {
  const n = parseFloat(v ?? '');
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

// ─── Add Row Form ─────────────────────────────────────────────────────────────

interface AddRowFormProps {
  subView: SubView;
  bidVersionId: string;
  onSave: (row: Row) => void;
  onCancel: () => void;
}

function AddRowForm({ subView, bidVersionId, onSave, onCancel }: AddRowFormProps) {
  const [fields, setFields] = useState<Row>({ Bid_Version_ID: bidVersionId });
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) {
    setFields(prev => {
      const next = { ...prev, [k]: v };
      // Auto-calculate glass derived fields
      if (subView === 'glass') {
        const dloW = parseFloat(next['DLO_Width_in'] ?? '') || 0;
        const dloH = parseFloat(next['DLO_Height_in'] ?? '') || 0;
        const bite = parseFloat(next['Bite_Per_Side'] ?? '') || 0;
        const allowPct = parseFloat(next['Allowance_Pct'] ?? '') || 0;
        const qty = parseInt(next['Qty_EA'] ?? '') || 0;
        if (dloW > 0 && dloH > 0) {
          next['Glass_Width_in'] = String(+(dloW + 2 * bite).toFixed(3));
          next['Glass_Height_in'] = String(+(dloH + 2 * bite).toFixed(3));
          const dloSF = (dloW * dloH) / 144;
          next['DLO_SF'] = dloSF.toFixed(2);
          const buySF = dloSF * (1 + allowPct);
          next['Buy_SF'] = buySF.toFixed(2);
          if (qty > 0) next['Total_Buy_SF'] = (buySF * qty).toFixed(2);
        }
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const tableKey = subView === 'systems' ? 'assembly_summary' : subView;
      const res = await fetch(`/api/estimating/takeoff/${bidVersionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: tableKey, row: fields }),
      });
      const data = await res.json();
      if (data.ok) {
        onSave(data.row);
      }
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    border: '1px solid rgba(20,184,166,0.35)',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: FONT,
    color: '#0f172a',
    background: 'rgba(240,253,250,0.6)',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const calcStyle: React.CSSProperties = {
    ...inputStyle,
    background: 'rgba(249,115,22,0.05)',
    color: '#b45309',
    fontWeight: 600,
    border: '1px solid rgba(249,115,22,0.25)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#64748b',
    display: 'block',
    marginBottom: 3,
  };

  function field(key: string, label: string, type: 'text' | 'number' = 'text', isCalc = false) {
    return (
      <div key={key}>
        <label style={labelStyle}>{label}</label>
        <input
          type={type}
          value={fields[key] ?? ''}
          onChange={e => set(key, e.target.value)}
          readOnly={isCalc}
          style={isCalc ? calcStyle : inputStyle}
          placeholder={isCalc ? 'auto-calculated' : ''}
        />
      </div>
    );
  }

  function select(key: string, label: string, options: string[]) {
    return (
      <div key={key}>
        <label style={labelStyle}>{label}</label>
        <select
          value={fields[key] ?? ''}
          onChange={e => set(key, e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">Select…</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  const formGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '10px 14px',
    marginBottom: 12,
  };

  const STATUS_OPTIONS = ['HARD', 'ALLOWANCE', 'TBD'];
  const SYSTEM_TYPES = ['Curtainwall', 'Storefront', 'Window Wall', 'Doors', 'Skylights', 'Shower Glass', 'Railings', 'Other'];
  const QTY_STATUS = STATUS_OPTIONS;

  return (
    <div style={{
      background: 'rgba(240,253,250,0.5)',
      border: '1px solid rgba(20,184,166,0.25)',
      borderRadius: 12,
      padding: '16px 18px',
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', marginBottom: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        New {subView === 'systems' ? 'System' : subView.charAt(0).toUpperCase() + subView.slice(1)} Entry
      </div>

      {subView === 'systems' && (
        <div style={formGridStyle}>
          {select('System_Type', 'System Type', SYSTEM_TYPES)}
          {field('Assembly_ID', 'Assembly ID')}
          {field('Location', 'Location')}
          {field('Qty_SF_DLO', 'Qty SF (DLO)', 'number')}
          {field('Qty_LF', 'Qty LF', 'number')}
          {field('Qty_EA', 'Qty EA', 'number')}
          {select('Qty_Status', 'Status', QTY_STATUS)}
          {select('Access_Type', 'Access Type', ['Ground Easy', 'Upper Floors', 'Swing Stage', 'Interior', 'Restricted', 'Other'])}
          {select('Complexity_Level', 'Complexity', ['Low', 'Medium', 'High', 'Extreme'])}
          {field('Key_Assumptions', 'Key Assumptions')}
          {field('Drawing_Refs', 'Drawing Refs')}
          {field('Spec_Refs', 'Spec Refs')}
        </div>
      )}

      {subView === 'doors' && (
        <div style={formGridStyle}>
          {field('Door_Tag', 'Door Tag')}
          {field('Door_Type', 'Door Type')}
          {field('Location', 'Location')}
          {field('Qty_EA', 'Qty EA', 'number')}
          {field('System_Type_Context', 'System Context')}
          {field('Assembly_ID', 'Assembly ID')}
          {select('Glazed_Lite_YN', 'Glazed Lite', ['TRUE', 'FALSE'])}
          {select('Qty_Status', 'Status', QTY_STATUS)}
          {field('Assumptions', 'Assumptions')}
          {field('Drawing_Refs', 'Drawing Refs')}
        </div>
      )}

      {subView === 'glass' && (
        <div>
          <div style={formGridStyle}>
            {select('System_Type', 'System Type', SYSTEM_TYPES)}
            {field('Assembly_ID', 'Assembly ID')}
            {field('Location', 'Location')}
            {field('Glass_Type_Code', 'Glass Type Code')}
            {field('DLO_Width_in', 'DLO Width (in)', 'number')}
            {field('DLO_Height_in', 'DLO Height (in)', 'number')}
            {field('Bite_Per_Side', 'Bite Per Side (in)', 'number')}
            {field('Glass_Width_in', 'Glass Width (in)', 'number', true)}
            {field('Glass_Height_in', 'Glass Height (in)', 'number', true)}
            {field('DLO_SF', 'DLO SF', 'number', true)}
            {field('Allowance_Pct', 'Allowance %', 'number')}
            {field('Buy_SF', 'Buy SF', 'number', true)}
            {field('Qty_EA', 'Qty EA', 'number')}
            {field('Total_Buy_SF', 'Total Buy SF', 'number', true)}
            {select('Lite_Area_Tier', 'Area Tier', ['Small', 'Medium', 'Large', 'XL'])}
            {select('Qty_Status', 'Status', QTY_STATUS)}
            {field('Drawing_Refs', 'Drawing Refs')}
          </div>
          {(fields['DLO_Width_in'] && fields['DLO_Height_in']) && (
            <CalcBox>
              <div style={{ fontWeight: 700, marginBottom: 4, fontFamily: FONT, fontSize: 10, color: '#0f766e', letterSpacing: '0.08em', textTransform: 'uppercase' }}>DLO + Bite Calculation</div>
              Glass Width = {fields['DLO_Width_in'] || '?'}" + (2 × {fields['Bite_Per_Side'] || '0'}") = <strong>{fields['Glass_Width_in'] || '?'}"</strong>{'\n'}
              Glass Height = {fields['DLO_Height_in'] || '?'}" + (2 × {fields['Bite_Per_Side'] || '0'}") = <strong>{fields['Glass_Height_in'] || '?'}"</strong>{'\n'}
              DLO SF = ({fields['DLO_Width_in']}" × {fields['DLO_Height_in']}") / 144 = <strong>{fields['DLO_SF'] || '?'} SF</strong>{'\n'}
              Buy SF = {fields['DLO_SF'] || '?'} × (1 + {fields['Allowance_Pct'] || '0'}) = <strong>{fields['Buy_SF'] || '?'} SF</strong>
            </CalcBox>
          )}
        </div>
      )}

      {subView === 'sealant' && (
        <div style={formGridStyle}>
          {select('System_Type', 'System Type', SYSTEM_TYPES)}
          {field('Assembly_ID', 'Assembly ID')}
          {field('Joint_Bucket', 'Joint Bucket')}
          {field('Location', 'Location')}
          {field('Sealant_Type', 'Sealant Type')}
          {field('Joint_Size_WxD', 'Joint Size W×D')}
          {field('Qty_LF', 'Qty LF', 'number')}
          {field('Waste_Pct', 'Waste %', 'number')}
          {select('Backer_Rod_YN', 'Backer Rod', ['TRUE', 'FALSE'])}
          {select('Qty_Status', 'Status', QTY_STATUS)}
          {field('Drawing_Refs', 'Drawing Refs')}
          {field('Spec_Refs', 'Spec Refs')}
        </div>
      )}

      {subView === 'fasteners' && (
        <div style={formGridStyle}>
          {select('System_Type', 'System Type', SYSTEM_TYPES)}
          {field('Assembly_ID', 'Assembly ID')}
          {field('Application', 'Application')}
          {field('Fastener_Type', 'Fastener Type')}
          {field('Size', 'Size')}
          {field('Material_Grade', 'Material Grade')}
          {field('Substrate', 'Substrate')}
          {field('Spacing_or_Basis', 'Spacing / Basis')}
          {field('Qty_EA', 'Qty EA', 'number')}
          {field('Waste_Pct', 'Waste %', 'number')}
          {select('Qty_Status', 'Status', QTY_STATUS)}
          {field('Drawing_Refs', 'Drawing Refs')}
        </div>
      )}

      {subView === 'flashing' && (
        <div style={formGridStyle}>
          {select('System_Type', 'System Type', SYSTEM_TYPES)}
          {field('Assembly_ID', 'Assembly ID')}
          {field('Item_Description', 'Item Description')}
          {field('Material', 'Material')}
          {field('Profile_Dims', 'Profile Dims')}
          {field('Developed_Width', 'Developed Width')}
          {field('Thickness', 'Thickness')}
          {field('Finish', 'Finish')}
          {field('Qty_LF', 'Qty LF', 'number')}
          {field('Qty_EA', 'Qty EA', 'number')}
          {field('Waste_Pct', 'Waste %', 'number')}
          {select('Qty_Status', 'Status', QTY_STATUS)}
          {field('Drawing_Refs', 'Drawing Refs')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '7px 16px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: 'white',
            fontSize: 11,
            fontWeight: 700,
            color: '#64748b',
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '7px 20px',
            borderRadius: 8,
            border: 'none',
            background: saving ? '#94a3b8' : '#0f766e',
            color: 'white',
            fontSize: 11,
            fontWeight: 800,
            cursor: saving ? 'default' : 'pointer',
            fontFamily: FONT,
            letterSpacing: '0.06em',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Sub-views ─────────────────────────────────────────────────────────────────

function SystemsView({ rows, bidVersionId, onUpdate, onDelete, onAdd }: {
  rows: Row[];
  bidVersionId: string;
  onUpdate: (rowId: string, field: string, value: string) => void;
  onDelete: (rowId: string) => void;
  onAdd: (row: Row) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const columns: ColumnDef<Row>[] = [
    { key: 'System_Type',  label: 'System Type',  width: 160 },
    { key: 'Assembly_ID',  label: 'Assembly ID',   width: 140, editable: true },
    { key: 'Location',     label: 'Location',      width: 180, editable: true },
    { key: 'Qty_SF_DLO',   label: 'SF (DLO)',      width: 90,  type: 'number', editable: true },
    { key: 'Qty_LF',       label: 'LF',            width: 70,  type: 'number', editable: true },
    { key: 'Qty_EA',       label: 'EA',            width: 60,  type: 'number', editable: true },
    {
      key: 'Qty_Status',
      label: 'Status',
      width: 100,
      render: (v) => <StatusBadge status={String(v)} />,
    },
  ];

  const tableRows: ExpandableRow<Row>[] = rows.map(r => ({
    id: r['Line_ID'] || r['Assembly_ID'] || JSON.stringify(r),
    data: r,
    rowStyle: r['Qty_Status'] === 'KAI' ? 'generated' : 'editable',
    expandedContent: (data) => (
      <div>
        <DetailGrid>
          <DetailField label="Access Type" value={data['Access_Type']} editable />
          <DetailField label="Complexity" value={data['Complexity_Level']} editable />
          <DetailField label="Door Package" value={data['Door_Package_On_Doors_Tab']} />
          <DetailField label="Drawing Refs" value={data['Drawing_Refs']} editable />
          <DetailField label="Spec Refs" value={data['Spec_Refs']} editable />
          <DetailField label="Special Conditions" value={data['Special_Conditions']} editable />
          <DetailField label="Install Basis Note" value={data['Install_Basis_Note']} editable />
        </DetailGrid>
        <DetailField label="Key Assumptions" value={data['Key_Assumptions']} editable />
        <DetailField label="Notes" value={data['Notes']} editable />
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button
            onClick={() => onDelete(data['Line_ID'])}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
          >
            Delete Row
          </button>
        </div>
      </div>
    ),
  }));

  const totalSF = rows.reduce((a, r) => a + (parseFloat(r['Qty_SF_DLO'] ?? '') || 0), 0);
  const totalLF = rows.reduce((a, r) => a + (parseFloat(r['Qty_LF'] ?? '') || 0), 0);
  const totalEA = rows.reduce((a, r) => a + (parseInt(r['Qty_EA'] ?? '') || 0), 0);

  async function handleCellEdit(rowId: string, key: string, value: string) {
    onUpdate(rowId, key, value);
    await fetch(`/api/estimating/takeoff/${bidVersionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'assembly_summary', rowId, updates: { [key]: value } }),
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {rows.length} assemblies · {num(String(totalSF), 0)} SF · {num(String(totalLF), 0)} LF · {totalEA} EA
        </div>
        <button onClick={() => setAddOpen(v => !v)} style={addBtnStyle}>
          + Add System
        </button>
      </div>
      {addOpen && (
        <AddRowForm
          subView="systems"
          bidVersionId={bidVersionId}
          onSave={row => { onAdd(row); setAddOpen(false); }}
          onCancel={() => setAddOpen(false)}
        />
      )}
      <ExpandableTable
        columns={columns}
        rows={tableRows}
        onCellEdit={handleCellEdit}
        emptyMessage="No systems added yet. Click + Add System to start."
        totals={{ Qty_SF_DLO: num(String(totalSF), 0), Qty_LF: num(String(totalLF), 0), Qty_EA: String(totalEA) }}
      />
    </div>
  );
}

function DoorsView({ rows, bidVersionId, onUpdate, onDelete, onAdd }: {
  rows: Row[];
  bidVersionId: string;
  onUpdate: (rowId: string, field: string, value: string) => void;
  onDelete: (rowId: string) => void;
  onAdd: (row: Row) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const columns: ColumnDef<Row>[] = [
    { key: 'Door_Tag',   label: 'Door Tag',   width: 100 },
    { key: 'Door_Type',  label: 'Door Type',  width: 160, editable: true },
    { key: 'Location',   label: 'Location',   width: 180, editable: true },
    { key: 'Qty_EA',     label: 'Qty EA',     width: 70,  type: 'number', editable: true },
    {
      key: 'Qty_Status',
      label: 'Status',
      width: 100,
      render: (v) => <StatusBadge status={String(v)} />,
    },
  ];

  const tableRows: ExpandableRow<Row>[] = rows.map(r => ({
    id: r['Door_Line_ID'] || r['Door_Tag'] || JSON.stringify(r),
    data: r,
    rowStyle: r['Qty_Status'] === 'KAI' ? 'generated' : 'editable',
    expandedContent: (data) => (
      <div>
        <DetailGrid>
          <DetailField label="System Context" value={data['System_Type_Context']} />
          <DetailField label="Assembly ID" value={data['Assembly_ID']} />
          <DetailField label="Glazed Lite" value={data['Glazed_Lite_YN']} />
          <DetailField label="Drawing Refs" value={data['Drawing_Refs']} editable />
        </DetailGrid>
        <DetailField label="Assumptions" value={data['Assumptions']} editable />
        <DetailField label="Notes" value={data['Notes']} editable />
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => onDelete(data['Door_Line_ID'])}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
          >
            Delete Row
          </button>
        </div>
      </div>
    ),
  }));

  const totalEA = rows.reduce((a, r) => a + (parseInt(r['Qty_EA'] ?? '') || 0), 0);

  async function handleCellEdit(rowId: string, key: string, value: string) {
    onUpdate(rowId, key, value);
    await fetch(`/api/estimating/takeoff/${bidVersionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'doors', rowId, updates: { [key]: value } }),
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {rows.length} doors · {totalEA} EA total
        </div>
        <button onClick={() => setAddOpen(v => !v)} style={addBtnStyle}>
          + Add Door
        </button>
      </div>
      {addOpen && (
        <AddRowForm
          subView="doors"
          bidVersionId={bidVersionId}
          onSave={row => { onAdd(row); setAddOpen(false); }}
          onCancel={() => setAddOpen(false)}
        />
      )}
      <ExpandableTable
        columns={columns}
        rows={tableRows}
        onCellEdit={handleCellEdit}
        emptyMessage="No doors added yet. Click + Add Door to start."
        totals={{ Qty_EA: String(totalEA) }}
      />
    </div>
  );
}

function GlassView({ rows, bidVersionId, onUpdate, onDelete, onAdd }: {
  rows: Row[];
  bidVersionId: string;
  onUpdate: (rowId: string, field: string, value: string) => void;
  onDelete: (rowId: string) => void;
  onAdd: (row: Row) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const columns: ColumnDef<Row>[] = [
    { key: 'Glass_Type_Code', label: 'Glass Type',   width: 160 },
    { key: 'Location',        label: 'Location',     width: 160, editable: true },
    { key: 'DLO_Width_in',    label: 'DLO W"',       width: 70,  type: 'number', editable: true },
    { key: 'DLO_Height_in',   label: 'DLO H"',       width: 70,  type: 'number', editable: true },
    { key: 'Bite_Per_Side',   label: 'Bite"',         width: 60,  type: 'number', editable: true },
    { key: 'Qty_EA',          label: 'Qty',           width: 55,  type: 'number', editable: true },
    { key: 'Total_Buy_SF',    label: 'Buy SF Total', width: 100, type: 'number' },
    {
      key: 'Qty_Status',
      label: 'Status',
      width: 90,
      render: (v) => <StatusBadge status={String(v)} />,
    },
  ];

  const tableRows: ExpandableRow<Row>[] = rows.map(r => {
    const dloW = parseFloat(r['DLO_Width_in'] ?? '') || 0;
    const dloH = parseFloat(r['DLO_Height_in'] ?? '') || 0;
    const bite = parseFloat(r['Bite_Per_Side'] ?? '') || 0;
    const glassW = dloW + 2 * bite;
    const glassH = dloH + 2 * bite;
    const dloSF = (dloW * dloH) / 144;
    const allowPct = parseFloat(r['Allowance_Pct'] ?? '') || 0;
    const buySF = dloSF * (1 + allowPct);
    const qty = parseInt(r['Qty_EA'] ?? '') || 0;
    const totalBuySF = buySF * qty;

    return {
      id: r['Glass_Line_ID'] || r['Glass_Type_Code'] || JSON.stringify(r),
      data: r,
      rowStyle: r['Qty_Status'] === 'KAI' ? 'generated' : 'editable',
      expandedContent: (data) => (
        <div>
          {/* DLO + Bite Calculation — the critical math */}
          <CalcBox>
            <div style={{ fontWeight: 700, marginBottom: 6, fontFamily: FONT, fontSize: 10, color: '#0f766e', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
              DLO + Bite Calculation
            </div>
            <div>Glass Width  = {dloW}" + (2 × {bite}") = <strong>{num(String(glassW), 3)}"</strong></div>
            <div>Glass Height = {dloH}" + (2 × {bite}") = <strong>{num(String(glassH), 3)}"</strong></div>
            <div style={{ marginTop: 4 }}>
              DLO SF       = ({dloW}" × {dloH}") / 144 = <strong>{num(String(dloSF))} SF</strong>
            </div>
            <div>
              Buy SF       = {num(String(dloSF))} SF × (1 + {(allowPct * 100).toFixed(0)}% allowance) = <strong>{num(String(buySF))} SF</strong>
            </div>
            <div style={{ marginTop: 4, borderTop: '1px solid rgba(20,184,166,0.2)', paddingTop: 4 }}>
              Total Buy SF = {num(String(buySF))} SF × {qty} EA = <strong>{num(String(totalBuySF))} SF</strong>
            </div>
          </CalcBox>
          <div style={{ marginTop: 8 }}>
            <DetailGrid>
              <DetailField label="System Type" value={data['System_Type']} />
              <DetailField label="Assembly ID" value={data['Assembly_ID']} />
              <DetailField label="Lite Area Tier" value={data['Lite_Area_Tier']} />
              <DetailField label="Allowance %" value={data['Allowance_Pct'] ? `${(parseFloat(data['Allowance_Pct']) * 100).toFixed(0)}%` : '—'} />
              <DetailField label="Glass Width" value={data['Glass_Width_in'] || num(String(glassW), 3) + '"'} />
              <DetailField label="Glass Height" value={data['Glass_Height_in'] || num(String(glassH), 3) + '"'} />
              <DetailField label="DLO SF" value={data['DLO_SF'] || num(String(dloSF))} />
              <DetailField label="Buy SF" value={data['Buy_SF'] || num(String(buySF))} />
              <DetailField label="Drawing Refs" value={data['Drawing_Refs']} editable />
              <DetailField label="Spec Refs" value={data['Spec_Refs']} editable />
            </DetailGrid>
          </div>
          <DetailField label="Notes" value={data['Notes']} editable />
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => onDelete(data['Glass_Line_ID'])}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
            >
              Delete Row
            </button>
          </div>
        </div>
      ),
    };
  });

  const totalBuySF = rows.reduce((a, r) => {
    const dloW = parseFloat(r['DLO_Width_in'] ?? '') || 0;
    const dloH = parseFloat(r['DLO_Height_in'] ?? '') || 0;
    const allowPct = parseFloat(r['Allowance_Pct'] ?? '') || 0;
    const qty = parseInt(r['Qty_EA'] ?? '') || 0;
    const dloSF = (dloW * dloH) / 144;
    const buySF = dloSF * (1 + allowPct);
    return a + buySF * qty;
  }, 0);

  const totalQty = rows.reduce((a, r) => a + (parseInt(r['Qty_EA'] ?? '') || 0), 0);

  async function handleCellEdit(rowId: string, key: string, value: string) {
    onUpdate(rowId, key, value);
    await fetch(`/api/estimating/takeoff/${bidVersionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'glass', rowId, updates: { [key]: value } }),
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {rows.length} lite types · {totalQty} EA · {num(String(totalBuySF))} total buy SF
          <span style={{ marginLeft: 8, fontSize: 10, color: '#0f766e', fontWeight: 600 }}>
            Expand rows to verify DLO + bite math
          </span>
        </div>
        <button onClick={() => setAddOpen(v => !v)} style={addBtnStyle}>
          + Add Glass
        </button>
      </div>
      {addOpen && (
        <AddRowForm
          subView="glass"
          bidVersionId={bidVersionId}
          onSave={row => { onAdd(row); setAddOpen(false); }}
          onCancel={() => setAddOpen(false)}
        />
      )}
      <ExpandableTable
        columns={columns}
        rows={tableRows}
        onCellEdit={handleCellEdit}
        emptyMessage="No glass entries yet. Click + Add Glass to start."
        totals={{ Total_Buy_SF: num(String(totalBuySF)), Qty_EA: String(totalQty) }}
      />
    </div>
  );
}

function SealantView({ rows, bidVersionId, onUpdate, onDelete, onAdd }: {
  rows: Row[];
  bidVersionId: string;
  onUpdate: (rowId: string, field: string, value: string) => void;
  onDelete: (rowId: string) => void;
  onAdd: (row: Row) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const columns: ColumnDef<Row>[] = [
    { key: 'Joint_Bucket',  label: 'Joint Bucket',  width: 160 },
    { key: 'Sealant_Type',  label: 'Sealant Type',  width: 160, editable: true },
    { key: 'Location',      label: 'Location',      width: 160, editable: true },
    { key: 'Qty_LF',        label: 'Qty LF',        width: 80,  type: 'number', editable: true },
    { key: 'Waste_Pct',     label: 'Waste %',       width: 70,  editable: true },
    {
      key: 'Qty_Status',
      label: 'Status',
      width: 90,
      render: (v) => <StatusBadge status={String(v)} />,
    },
  ];

  const tableRows: ExpandableRow<Row>[] = rows.map(r => ({
    id: r['Seal_Line_ID'] || r['Joint_Bucket'] || JSON.stringify(r),
    data: r,
    rowStyle: r['Qty_Status'] === 'KAI' ? 'generated' : 'editable',
    expandedContent: (data) => (
      <div>
        <DetailGrid>
          <DetailField label="System Type" value={data['System_Type']} />
          <DetailField label="Assembly ID" value={data['Assembly_ID']} />
          <DetailField label="Joint Size W×D" value={data['Joint_Size_WxD']} />
          <DetailField label="Backer Rod" value={data['Backer_Rod_YN']} />
          <DetailField label="Drawing Refs" value={data['Drawing_Refs']} editable />
          <DetailField label="Spec Refs" value={data['Spec_Refs']} editable />
        </DetailGrid>
        <DetailField label="Notes" value={data['Notes']} editable />
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => onDelete(data['Seal_Line_ID'])}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
          >
            Delete Row
          </button>
        </div>
      </div>
    ),
  }));

  const totalLF = rows.reduce((a, r) => a + (parseFloat(r['Qty_LF'] ?? '') || 0), 0);

  async function handleCellEdit(rowId: string, key: string, value: string) {
    onUpdate(rowId, key, value);
    await fetch(`/api/estimating/takeoff/${bidVersionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'sealant', rowId, updates: { [key]: value } }),
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {rows.length} sealant lines · {num(String(totalLF), 0)} LF total
        </div>
        <button onClick={() => setAddOpen(v => !v)} style={addBtnStyle}>
          + Add Sealant
        </button>
      </div>
      {addOpen && (
        <AddRowForm
          subView="sealant"
          bidVersionId={bidVersionId}
          onSave={row => { onAdd(row); setAddOpen(false); }}
          onCancel={() => setAddOpen(false)}
        />
      )}
      <ExpandableTable
        columns={columns}
        rows={tableRows}
        onCellEdit={handleCellEdit}
        emptyMessage="No sealant entries yet. Click + Add Sealant to start."
        totals={{ Qty_LF: num(String(totalLF), 0) }}
      />
    </div>
  );
}

function FastenersView({ rows, bidVersionId, onUpdate, onDelete, onAdd }: {
  rows: Row[];
  bidVersionId: string;
  onUpdate: (rowId: string, field: string, value: string) => void;
  onDelete: (rowId: string) => void;
  onAdd: (row: Row) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const columns: ColumnDef<Row>[] = [
    { key: 'Fastener_Type',  label: 'Fastener Type',  width: 160 },
    { key: 'Substrate',      label: 'Substrate',      width: 120, editable: true },
    { key: 'Material_Grade', label: 'Grade',          width: 90,  editable: true },
    { key: 'Qty_EA',         label: 'Qty EA',         width: 80,  type: 'number', editable: true },
    {
      key: 'Qty_Status',
      label: 'Status',
      width: 90,
      render: (v) => <StatusBadge status={String(v)} />,
    },
  ];

  const tableRows: ExpandableRow<Row>[] = rows.map(r => ({
    id: r['Fast_Line_ID'] || r['Fastener_Type'] || JSON.stringify(r),
    data: r,
    rowStyle: r['Qty_Status'] === 'KAI' ? 'generated' : 'editable',
    expandedContent: (data) => (
      <div>
        <DetailGrid>
          <DetailField label="System Type" value={data['System_Type']} />
          <DetailField label="Assembly ID" value={data['Assembly_ID']} />
          <DetailField label="Application" value={data['Application']} />
          <DetailField label="Size" value={data['Size']} />
          <DetailField label="Spacing / Basis" value={data['Spacing_or_Basis']} />
          <DetailField label="Waste %" value={data['Waste_Pct']} />
          <DetailField label="Drawing Refs" value={data['Drawing_Refs']} editable />
          <DetailField label="Spec Refs" value={data['Spec_Refs']} editable />
        </DetailGrid>
        <DetailField label="Notes" value={data['Notes']} editable />
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => onDelete(data['Fast_Line_ID'])}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
          >
            Delete Row
          </button>
        </div>
      </div>
    ),
  }));

  const totalEA = rows.reduce((a, r) => a + (parseInt(r['Qty_EA'] ?? '') || 0), 0);

  async function handleCellEdit(rowId: string, key: string, value: string) {
    onUpdate(rowId, key, value);
    await fetch(`/api/estimating/takeoff/${bidVersionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'fasteners', rowId, updates: { [key]: value } }),
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {rows.length} fastener lines · {totalEA} EA total
        </div>
        <button onClick={() => setAddOpen(v => !v)} style={addBtnStyle}>
          + Add Fastener
        </button>
      </div>
      {addOpen && (
        <AddRowForm
          subView="fasteners"
          bidVersionId={bidVersionId}
          onSave={row => { onAdd(row); setAddOpen(false); }}
          onCancel={() => setAddOpen(false)}
        />
      )}
      <ExpandableTable
        columns={columns}
        rows={tableRows}
        onCellEdit={handleCellEdit}
        emptyMessage="No fastener entries yet. Click + Add Fastener to start."
        totals={{ Qty_EA: String(totalEA) }}
      />
    </div>
  );
}

function FlashingView({ rows, bidVersionId, onUpdate, onDelete, onAdd }: {
  rows: Row[];
  bidVersionId: string;
  onUpdate: (rowId: string, field: string, value: string) => void;
  onDelete: (rowId: string) => void;
  onAdd: (row: Row) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const columns: ColumnDef<Row>[] = [
    { key: 'Item_Description', label: 'Description',  width: 200 },
    { key: 'Material',         label: 'Material',     width: 120, editable: true },
    { key: 'Qty_LF',           label: 'Qty LF',       width: 75,  type: 'number', editable: true },
    { key: 'Qty_EA',           label: 'Qty EA',       width: 70,  type: 'number', editable: true },
    {
      key: 'Qty_Status',
      label: 'Status',
      width: 90,
      render: (v) => <StatusBadge status={String(v)} />,
    },
  ];

  const tableRows: ExpandableRow<Row>[] = rows.map(r => ({
    id: r['Flash_Line_ID'] || r['Item_Description'] || JSON.stringify(r),
    data: r,
    rowStyle: r['Qty_Status'] === 'KAI' ? 'generated' : 'editable',
    expandedContent: (data) => (
      <div>
        <DetailGrid>
          <DetailField label="System Type" value={data['System_Type']} />
          <DetailField label="Assembly ID" value={data['Assembly_ID']} />
          <DetailField label="Profile Dims" value={data['Profile_Dims']} />
          <DetailField label="Developed Width" value={data['Developed_Width']} />
          <DetailField label="Thickness" value={data['Thickness']} />
          <DetailField label="Finish" value={data['Finish']} />
          <DetailField label="Waste %" value={data['Waste_Pct']} />
          <DetailField label="Drawing Refs" value={data['Drawing_Refs']} editable />
          <DetailField label="Spec Refs" value={data['Spec_Refs']} editable />
        </DetailGrid>
        <DetailField label="Notes" value={data['Notes']} editable />
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => onDelete(data['Flash_Line_ID'])}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
          >
            Delete Row
          </button>
        </div>
      </div>
    ),
  }));

  const totalLF = rows.reduce((a, r) => a + (parseFloat(r['Qty_LF'] ?? '') || 0), 0);
  const totalEA = rows.reduce((a, r) => a + (parseInt(r['Qty_EA'] ?? '') || 0), 0);

  async function handleCellEdit(rowId: string, key: string, value: string) {
    onUpdate(rowId, key, value);
    await fetch(`/api/estimating/takeoff/${bidVersionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'flashing', rowId, updates: { [key]: value } }),
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {rows.length} flashing lines · {num(String(totalLF), 0)} LF · {totalEA} EA
        </div>
        <button onClick={() => setAddOpen(v => !v)} style={addBtnStyle}>
          + Add Flashing
        </button>
      </div>
      {addOpen && (
        <AddRowForm
          subView="flashing"
          bidVersionId={bidVersionId}
          onSave={row => { onAdd(row); setAddOpen(false); }}
          onCancel={() => setAddOpen(false)}
        />
      )}
      <ExpandableTable
        columns={columns}
        rows={tableRows}
        onCellEdit={handleCellEdit}
        emptyMessage="No flashing entries yet. Click + Add Flashing to start."
        totals={{ Qty_LF: num(String(totalLF), 0), Qty_EA: String(totalEA) }}
      />
    </div>
  );
}

// ─── Shared add button style ───────────────────────────────────────────────────

const addBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid rgba(20,184,166,0.4)',
  background: 'rgba(240,253,250,0.8)',
  color: '#0f766e',
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: FONT,
  letterSpacing: '0.04em',
};

// ─── Sub-view pills ────────────────────────────────────────────────────────────

const SUB_VIEWS: { id: SubView; label: string }[] = [
  { id: 'systems',   label: 'Systems' },
  { id: 'doors',     label: 'Doors' },
  { id: 'glass',     label: 'Glass' },
  { id: 'sealant',   label: 'Sealant' },
  { id: 'fasteners', label: 'Fasteners' },
  { id: 'flashing',  label: 'Flashing' },
];

// ─── Main TakeoffTab Component ────────────────────────────────────────────────

interface TakeoffTabProps {
  bid: BidSummary;
}

export default function TakeoffTab({ bid }: TakeoffTabProps) {
  const [activeView, setActiveView] = useState<SubView>('systems');
  const [data, setData] = useState<TakeoffData>({
    assembly_summary: [],
    doors: [],
    glass: [],
    sealant: [],
    fasteners: [],
    flashing: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimating/takeoff/${bid.bidVersionId}`);
      const json = await res.json();
      if (json.tables) {
        setData(prev => ({ ...prev, ...json.tables }));
      } else if (json.error) {
        setError(json.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load takeoff data');
    } finally {
      setLoading(false);
    }
  }, [bid.bidVersionId]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Shared mutation handlers ─────────────────────────────────────────────

  function makeUpdateHandler(tableKey: keyof TakeoffData, idField: string) {
    return (rowId: string, field: string, value: string) => {
      setData(prev => ({
        ...prev,
        [tableKey]: prev[tableKey].map(r =>
          r[idField] === rowId ? { ...r, [field]: value } : r
        ),
      }));
    };
  }

  async function handleDelete(tableKey: keyof TakeoffData, idField: string, rowId: string) {
    const apiTable = tableKey === 'assembly_summary' ? 'assembly_summary' : tableKey;
    setData(prev => ({
      ...prev,
      [tableKey]: prev[tableKey].filter(r => r[idField] !== rowId),
    }));
    await fetch(`/api/estimating/takeoff/${bid.bidVersionId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: apiTable, rowId }),
    });
  }

  function makeAddHandler(tableKey: keyof TakeoffData) {
    return (row: Row) => {
      setData(prev => ({ ...prev, [tableKey]: [...prev[tableKey], row] }));
    };
  }

  // ─── Counts for pill badges ───────────────────────────────────────────────

  const counts: Record<SubView, number> = {
    systems:   data.assembly_summary.length,
    doors:     data.doors.length,
    glass:     data.glass.length,
    sealant:   data.sealant.length,
    fasteners: data.fasteners.length,
    flashing:  data.flashing.length,
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 13, fontFamily: FONT }}>
        Loading takeoff data…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
          Failed to load takeoff data: {error}
        </div>
        <button
          onClick={load}
          style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', fontFamily: FONT }}>

      {/* Sub-view pill selector */}
      <div style={{
        display: 'flex',
        gap: 6,
        marginBottom: 20,
        overflowX: 'auto',
        paddingBottom: 2,
        flexWrap: 'nowrap',
      }}>
        {SUB_VIEWS.map(({ id, label }) => {
          const active = activeView === id;
          const count = counts[id];
          return (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              style={{
                padding: '6px 16px',
                borderRadius: 999,
                border: active ? 'none' : '1px solid #e2e8f0',
                background: active
                  ? 'linear-gradient(135deg, #0f766e, #14b8a6)'
                  : 'white',
                color: active ? 'white' : '#475569',
                fontSize: 11,
                fontWeight: active ? 800 : 600,
                cursor: 'pointer',
                fontFamily: FONT,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                boxShadow: active ? '0 2px 8px rgba(15,118,110,0.2)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              {label}
              {count > 0 && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  borderRadius: 999,
                  background: active ? 'rgba(255,255,255,0.25)' : 'rgba(20,184,166,0.12)',
                  color: active ? 'white' : '#0f766e',
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '0 4px',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: 16,
        marginBottom: 16,
        fontSize: 10,
        color: '#94a3b8',
        alignItems: 'center',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#14b8a6', display: 'inline-block' }} />
          Editable fields (green)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f97316', display: 'inline-block' }} />
          Kai-generated (orange)
        </span>
        <span style={{ color: '#0f766e', fontWeight: 600 }}>
          Click rows to expand detail
        </span>
      </div>

      {/* Active sub-view */}
      {activeView === 'systems' && (
        <SystemsView
          rows={data.assembly_summary}
          bidVersionId={bid.bidVersionId}
          onUpdate={makeUpdateHandler('assembly_summary', 'Line_ID')}
          onDelete={(rowId) => handleDelete('assembly_summary', 'Line_ID', rowId)}
          onAdd={makeAddHandler('assembly_summary')}
        />
      )}

      {activeView === 'doors' && (
        <DoorsView
          rows={data.doors}
          bidVersionId={bid.bidVersionId}
          onUpdate={makeUpdateHandler('doors', 'Door_Line_ID')}
          onDelete={(rowId) => handleDelete('doors', 'Door_Line_ID', rowId)}
          onAdd={makeAddHandler('doors')}
        />
      )}

      {activeView === 'glass' && (
        <GlassView
          rows={data.glass}
          bidVersionId={bid.bidVersionId}
          onUpdate={makeUpdateHandler('glass', 'Glass_Line_ID')}
          onDelete={(rowId) => handleDelete('glass', 'Glass_Line_ID', rowId)}
          onAdd={makeAddHandler('glass')}
        />
      )}

      {activeView === 'sealant' && (
        <SealantView
          rows={data.sealant}
          bidVersionId={bid.bidVersionId}
          onUpdate={makeUpdateHandler('sealant', 'Seal_Line_ID')}
          onDelete={(rowId) => handleDelete('sealant', 'Seal_Line_ID', rowId)}
          onAdd={makeAddHandler('sealant')}
        />
      )}

      {activeView === 'fasteners' && (
        <FastenersView
          rows={data.fasteners}
          bidVersionId={bid.bidVersionId}
          onUpdate={makeUpdateHandler('fasteners', 'Fast_Line_ID')}
          onDelete={(rowId) => handleDelete('fasteners', 'Fast_Line_ID', rowId)}
          onAdd={makeAddHandler('fasteners')}
        />
      )}

      {activeView === 'flashing' && (
        <FlashingView
          rows={data.flashing}
          bidVersionId={bid.bidVersionId}
          onUpdate={makeUpdateHandler('flashing', 'Flash_Line_ID')}
          onDelete={(rowId) => handleDelete('flashing', 'Flash_Line_ID', rowId)}
          onAdd={makeAddHandler('flashing')}
        />
      )}

    </div>
  );
}
