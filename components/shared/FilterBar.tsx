'use client';
import React from 'react';

export interface FilterChip {
  id: string;
  label: string;
  count?: number;
  color?: string;
}

export interface SortOption {
  id: string;
  label: string;
}

interface FilterBarProps {
  chips?: FilterChip[];
  activeChip?: string;
  onChipChange?: (chipId: string) => void;
  sortOptions?: SortOption[];
  sortValue?: string;
  onSortChange?: (sortId: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  resultCount?: number;
  actions?: React.ReactNode;
}

export default function FilterBar({
  chips = [],
  activeChip,
  onChipChange,
  sortOptions = [],
  sortValue,
  onSortChange,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  resultCount,
  actions,
}: FilterBarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 0',
      flexWrap: 'wrap',
    }}>
      {/* Filter Chips */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
          {chips.map((chip) => {
            const isActive = activeChip === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => onChipChange?.(chip.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: isActive
                    ? `1px solid ${chip.color ?? '#14b8a6'}`
                    : '1px solid #e2e8f0',
                  background: isActive
                    ? `color-mix(in srgb, ${chip.color ?? '#14b8a6'} 12%, transparent)`
                    : 'white',
                  color: isActive ? (chip.color ?? '#0f766e') : '#64748b',
                  fontSize: 11,
                  fontWeight: isActive ? 800 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                  minHeight: 32,
                  letterSpacing: '0.01em',
                }}
              >
                {chip.label}
                {chip.count !== undefined && (
                  <span style={{
                    background: isActive ? (chip.color ?? '#14b8a6') : '#e2e8f0',
                    color: isActive ? 'white' : '#64748b',
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: 999,
                    minWidth: 16,
                    textAlign: 'center',
                  }}>{chip.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Sort Dropdown */}
      {sortOptions.length > 0 && (
        <select
          value={sortValue ?? sortOptions[0]?.id}
          onChange={(e) => onSortChange?.(e.target.value)}
          style={{
            padding: '6px 28px 6px 10px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: 'white',
            color: '#374151',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            outline: 'none',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394a3b8'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            minHeight: 32,
          }}
        >
          {sortOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      )}

      {/* Search */}
      {onSearchChange && (
        <div style={{ position: 'relative', flex: 1, minWidth: 120, maxWidth: 260 }}>
          <span style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12, color: '#94a3b8', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            style={{
              width: '100%',
              padding: '6px 10px 6px 28px',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: 12,
              color: '#374151',
              background: 'white',
              outline: 'none',
              boxSizing: 'border-box',
              minHeight: 32,
            }}
          />
        </div>
      )}

      {/* Result count */}
      {resultCount !== undefined && (
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#94a3b8',
          flexShrink: 0,
        }}>
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </span>
      )}

      {/* Actions slot */}
      {actions && <div style={{ marginLeft: 'auto', flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}
