'use client';
import React, { useState } from 'react';

export type ColumnType = 'text' | 'number' | 'currency' | 'status' | 'badge';

export interface ColumnDef<T = Record<string, unknown>> {
  key: string;
  label: string;
  width?: number | string;
  editable?: boolean;
  type?: ColumnType;
  render?: (value: unknown, row: T) => React.ReactNode;
}

export interface ExpandableRow<T = Record<string, unknown>> {
  id: string;
  data: T;
  expandedContent?: (row: T) => React.ReactNode;
  /** 'editable' = green, 'generated' = orange, 'normal' = default */
  rowStyle?: 'editable' | 'generated' | 'normal';
}

interface ExpandableTableProps<T = Record<string, unknown>> {
  columns: ColumnDef<T>[];
  rows: ExpandableRow<T>[];
  onCellEdit?: (rowId: string, key: string, value: string) => void;
  emptyMessage?: string;
  stickyHeader?: boolean;
  /** Show total row at bottom */
  totals?: Partial<Record<string, React.ReactNode>>;
}

function formatCurrency(val: unknown): string {
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(n)) return String(val ?? '—');
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatNumber(val: unknown): string {
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(n)) return String(val ?? '—');
  return n.toLocaleString('en-US');
}

function formatValue(val: unknown, type?: ColumnType): string {
  if (val === null || val === undefined || val === '') return '—';
  switch (type) {
    case 'currency': return formatCurrency(val);
    case 'number': return formatNumber(val);
    default: return String(val);
  }
}

export default function ExpandableTable<T = Record<string, unknown>>({
  columns,
  rows,
  onCellEdit,
  emptyMessage = 'No data',
  stickyHeader = true,
  totals,
}: ExpandableTableProps<T>) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; key: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  function toggleRow(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
    setEditingCell(null);
  }

  function startEdit(rowId: string, key: string, currentVal: unknown) {
    setEditingCell({ rowId, key });
    setEditValue(String(currentVal ?? ''));
  }

  function commitEdit() {
    if (editingCell && onCellEdit) {
      onCellEdit(editingCell.rowId, editingCell.key, editValue);
    }
    setEditingCell(null);
    setEditValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') { setEditingCell(null); setEditValue(''); }
  }

  if (rows.length === 0) {
    return (
      <div style={{
        padding: '32px 16px',
        textAlign: 'center',
        fontSize: 13,
        color: 'var(--bos-color-ink-tertiary)',
        background: 'white',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 12,
      }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--color-surface-border)', background: 'white' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
        <thead>
          <tr style={{
            background: 'var(--color-ink-primary)',
            position: stickyHeader ? 'sticky' : undefined,
            top: stickyHeader ? 0 : undefined,
            zIndex: stickyHeader ? 1 : undefined,
          }}>
            {/* Expand chevron column */}
            <th style={{ width: 32, padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }} />
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(148,163,184,0.9)',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  width: col.width,
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const isExpanded = expandedId === row.id;
            const isLast = rowIdx === rows.length - 1;

            // Row background based on style
            let rowBg = 'white';
            if (row.rowStyle === 'editable') rowBg = 'rgba(240,253,250,0.4)';
            if (row.rowStyle === 'generated') rowBg = 'rgba(255,247,237,0.4)';

            return (
              <React.Fragment key={row.id}>
                {/* Summary Row */}
                <tr
                  onClick={() => toggleRow(row.id)}
                  style={{
                    background: isExpanded ? (row.rowStyle === 'generated' ? 'rgba(255,247,237,0.7)' : 'rgba(240,253,250,0.7)') : rowBg,
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                    borderBottom: !isExpanded && !isLast ? '1px solid #f1f5f9' : 'none',
                  }}
                  onMouseEnter={e => {
                    if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface)';
                  }}
                  onMouseLeave={e => {
                    if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = rowBg;
                  }}
                >
                  {/* Chevron */}
                  <td style={{
                    padding: '10px 8px',
                    textAlign: 'center',
                    color: isExpanded ? 'var(--bos-color-brand-primary-deep)' : 'var(--bos-color-ink-tertiary)',
                    fontSize: 12,
                    userSelect: 'none',
                    verticalAlign: 'middle',
                    borderLeft: row.rowStyle === 'editable' ? '3px solid #14b8a6'
                      : row.rowStyle === 'generated' ? '3px solid #f97316'
                      : '3px solid transparent',
                  }}>
                    {row.expandedContent ? (isExpanded ? '▼' : '▶') : ''}
                  </td>

                  {columns.map((col) => {
                    const val = (row.data as Record<string, unknown>)[col.key];
                    const isEditing = editingCell?.rowId === row.id && editingCell?.key === col.key;
                    const isCellEditable = col.editable && onCellEdit;

                    let cellBg = 'transparent';
                    let cellColor = '#1e293b';
                    if (col.type === 'currency') { cellColor = 'var(--color-ink-primary)'; }
                    if (col.type === 'status') { cellColor = 'var(--bos-color-ink-disabled)'; }
                    if (col.editable && row.rowStyle === 'editable') cellBg = 'rgba(20,184,166,0.06)';
                    if (col.editable && row.rowStyle === 'generated') cellBg = 'rgba(249,115,22,0.06)';

                    return (
                      <td
                        key={col.key}
                        style={{
                          padding: '10px 12px',
                          fontSize: 12,
                          color: cellColor,
                          fontWeight: col.type === 'currency' ? 700 : 400,
                          verticalAlign: 'middle',
                          background: cellBg,
                          cursor: isCellEditable ? 'text' : 'pointer',
                          maxWidth: col.width ? undefined : 240,
                        }}
                        onClick={isCellEditable ? (e) => {
                          e.stopPropagation();
                          startEdit(row.id, col.key, val);
                        } : undefined}
                      >
                        {isEditing && isCellEditable ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={handleKeyDown}
                            onClick={e => e.stopPropagation()}
                            style={{
                              width: '100%',
                              padding: '3px 6px',
                              border: '1px solid #14b8a6',
                              borderRadius: 4,
                              fontSize: 12,
                              color: 'var(--color-ink-primary)',
                              background: 'white',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                        ) : col.render ? (
                          col.render(val, row.data)
                        ) : (
                          <span style={{
                            color: isCellEditable
                              ? (row.rowStyle === 'generated' ? '#b45309' : 'var(--bos-color-brand-primary-deep)')
                              : cellColor,
                          }}>
                            {formatValue(val, col.type)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Expanded Content Row */}
                {isExpanded && row.expandedContent && (
                  <tr>
                    <td colSpan={columns.length + 1} style={{
                      padding: 0,
                      borderBottom: '2px solid var(--color-surface-border)',
                      background: row.rowStyle === 'generated' ? 'rgba(255,247,237,0.25)' : 'rgba(240,253,250,0.25)',
                    }}>
                      <div style={{ padding: '12px 16px 16px 40px' }}>
                        {row.expandedContent(row.data)}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}

          {/* Totals Row */}
          {totals && (
            <tr style={{
              background: 'var(--color-ink-primary)',
              borderTop: '2px solid var(--color-surface-border)',
            }}>
              <td />
              {columns.map((col) => (
                <td key={col.key} style={{
                  padding: '10px 12px',
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'var(--color-surface)',
                }}>
                  {totals[col.key] ?? ''}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
