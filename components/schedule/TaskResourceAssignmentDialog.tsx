'use client';
/**
 * BAN-374 P5 — Task ↔ Resource assignment dialog.
 *
 * Opened from the Resources cell in ScheduleTab's task list.  Shows the
 * current (active) and historical assignments for the task and lets the
 * operator add or soft-remove crew members.  When adding triggers a
 * conflict (date overlap with allocation sum > 100%), the dialog surfaces
 * the offending tasks and requires the operator to "acknowledge and
 * proceed" with a free-text note.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface ResourceUserOption {
  user_id: string;
  name: string | null;
  email: string;
  active: boolean | null;
}

export interface TaskResourceRow {
  task_resource_id: string;
  schedule_task_id: string;
  user_id: string;
  role_on_task: string | null;
  allocation_percent: number;
  assigned_at: string;
  assigned_by: string;
  removed_at: string | null;
  removed_by: string | null;
  notes: string | null;
  user_name: string | null;
  user_email: string | null;
  user_active: boolean | null;
}

interface ConflictItem {
  task_resource_id: string;
  schedule_task_id: string;
  task_name: string;
  task_planned_start: string | null;
  task_planned_end: string | null;
  allocation_percent: number;
  role_on_task: string | null;
}

interface ConflictReport {
  conflicts: ConflictItem[];
  allocationSum: number;
  hasDateOverlap: boolean;
  exceedsAllocation: boolean;
}

interface Props {
  taskId: string;
  taskName: string;
  users: ResourceUserOption[];
  canWrite: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export default function TaskResourceAssignmentDialog({
  taskId,
  taskName,
  users,
  canWrite,
  onClose,
  onChanged,
}: Props) {
  const [rows, setRows] = useState<TaskResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newAllocation, setNewAllocation] = useState(100);
  const [newNotes, setNewNotes] = useState('');
  const [pendingConflict, setPendingConflict] = useState<ConflictReport | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/schedule/tasks/${taskId}/resources`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(j.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRows = useMemo(() => rows.filter((r) => !r.removed_at), [rows]);
  const historicalRows = useMemo(() => rows.filter((r) => !!r.removed_at), [rows]);

  const userOptions = useMemo(() => {
    const assignedIds = new Set(activeRows.map((r) => r.user_id));
    return users
      .filter((u) => u.active !== false && !assignedIds.has(u.user_id))
      .sort((a, b) => {
        const an = a.name ?? a.email;
        const bn = b.name ?? b.email;
        return an.localeCompare(bn);
      });
  }, [users, activeRows]);

  const resetAddForm = () => {
    setShowAdd(false);
    setNewUserId('');
    setNewRole('');
    setNewAllocation(100);
    setNewNotes('');
    setPendingConflict(null);
    setAcknowledged(false);
  };

  const submitAdd = async (ackOverride?: boolean) => {
    if (!newUserId) {
      setErr('Select a user');
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        user_id: newUserId,
        allocation_percent: newAllocation,
      };
      if (newRole.trim()) body.role_on_task = newRole.trim();
      if (newNotes.trim()) body.notes = newNotes.trim();
      if (ackOverride) body.ack_conflict = true;

      const res = await fetch(`/api/schedule/tasks/${taskId}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (res.status === 409 && j.code === 'ALLOCATION_CONFLICT') {
        setPendingConflict(j.report as ConflictReport);
        setSaving(false);
        return;
      }
      if (!res.ok) {
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      resetAddForm();
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const submitWithAck = async () => {
    if (!acknowledged) {
      setErr('Tick "I acknowledge the conflict" to proceed');
      return;
    }
    if (!newNotes.trim()) {
      setErr('A note explaining the override is required');
      return;
    }
    await submitAdd(true);
  };

  const removeRow = async (resourceId: string) => {
    if (!confirm('Remove this crew member from the task?')) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/schedule/tasks/${taskId}/resources/${resourceId}`, {
        method: 'DELETE',
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-bos-resource-assignment-dialog
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 220,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white', borderRadius: 14, padding: 20, width: 560,
          maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto', boxShadow: '0 12px 40px rgba(15,23,42,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-ink-primary)' }}>Crew on “{taskName}”</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>
              Active assignments determine who is on this task. Historical assignments are preserved for audit.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--bos-color-ink-tertiary)', fontSize: 22, cursor: 'pointer' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {err ? (
          <div
            data-bos-resource-dialog-error
            style={{
              background: '#fef2f2', color: 'var(--color-red-700)', padding: '8px 12px',
              borderRadius: 8, fontSize: 12, marginBottom: 12,
            }}
          >
            {err}
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 12 }}>Loading assignments…</p>
        ) : (
          <>
            <section data-bos-resource-active style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 700, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active ({activeRows.length})
              </h3>
              {activeRows.length === 0 ? (
                <p style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 12, fontStyle: 'italic' }}>No crew assigned.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeRows.map((r) => (
                    <li
                      key={r.task_resource_id}
                      data-bos-resource-row={r.task_resource_id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-primary)' }}>
                          {r.user_name ?? r.user_email ?? 'Unknown user'}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)' }}>
                          {r.role_on_task ?? 'crew'} · {r.allocation_percent}%
                          {r.notes ? ` · ${r.notes}` : ''}
                        </span>
                      </div>
                      {canWrite ? (
                        <button
                          type="button"
                          data-bos-resource-remove={r.task_resource_id}
                          onClick={() => removeRow(r.task_resource_id)}
                          disabled={saving}
                          style={{
                            background: 'transparent', border: '1px solid var(--color-surface-border)', borderRadius: 6,
                            padding: '4px 10px', fontSize: 11, color: 'var(--color-red-700)', cursor: 'pointer',
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {historicalRows.length > 0 ? (
              <section data-bos-resource-history style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 700, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  History ({historicalRows.length})
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {historicalRows.map((r) => (
                    <li
                      key={r.task_resource_id}
                      style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', padding: '4px 12px' }}
                    >
                      {r.user_name ?? r.user_email ?? 'Unknown'} · {r.role_on_task ?? 'crew'} · removed {r.removed_at ? r.removed_at.slice(0, 10) : ''}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {canWrite ? (
              showAdd ? (
                <section
                  data-bos-resource-add-form
                  style={{ padding: 12, background: 'var(--color-surface)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--color-ink-primary)' }}>Add resource</h3>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--bos-color-ink-disabled)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    User
                    <select
                      data-bos-resource-user-select
                      value={newUserId}
                      onChange={(e) => { setNewUserId(e.target.value); setPendingConflict(null); setAcknowledged(false); }}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-surface-border)', fontSize: 12 }}
                    >
                      <option value="">— Select crew member —</option>
                      {userOptions.map((u) => (
                        <option key={u.user_id} value={u.user_id}>
                          {u.name ?? u.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--bos-color-ink-disabled)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Role on task
                    <input
                      data-bos-resource-role-input
                      type="text"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      placeholder="lead / crew / apprentice (optional)"
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-surface-border)', fontSize: 12 }}
                    />
                  </label>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--bos-color-ink-disabled)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Allocation: {newAllocation}%
                    <input
                      data-bos-resource-allocation-slider
                      type="range"
                      min={1}
                      max={100}
                      value={newAllocation}
                      onChange={(e) => { setNewAllocation(Number(e.target.value)); setPendingConflict(null); }}
                    />
                  </label>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--bos-color-ink-disabled)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Notes
                    <textarea
                      data-bos-resource-notes-input
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="Optional — required when overriding a conflict"
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-surface-border)', fontSize: 12, fontFamily: 'inherit', minHeight: 48 }}
                    />
                  </label>

                  {pendingConflict ? (
                    <div
                      data-bos-resource-conflict-panel
                      style={{
                        background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6,
                        padding: '8px 10px', fontSize: 11, color: 'var(--color-amber-800)',
                      }}
                    >
                      <strong style={{ display: 'block', marginBottom: 4 }}>
                        Overlap — {pendingConflict.allocationSum}% total over the date range
                      </strong>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {pendingConflict.conflicts.map((c) => (
                          <li key={c.task_resource_id}>
                            {c.task_name} · {c.allocation_percent}% · {c.task_planned_start ?? '?'} → {c.task_planned_end ?? '?'}
                          </li>
                        ))}
                      </ul>
                      <label style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          data-bos-resource-ack-checkbox
                          checked={acknowledged}
                          onChange={(e) => setAcknowledged(e.target.checked)}
                        />
                        I acknowledge the conflict and want to proceed
                      </label>
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      onClick={resetAddForm}
                      disabled={saving}
                      style={{ background: 'transparent', border: '1px solid var(--color-surface-border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    {pendingConflict ? (
                      <button
                        type="button"
                        data-bos-resource-acknowledge-submit
                        onClick={submitWithAck}
                        disabled={saving}
                        style={{ background: '#b45309', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Acknowledge & assign
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-bos-resource-add-submit
                        onClick={() => submitAdd(false)}
                        disabled={saving}
                        style={{ background: 'var(--color-ink-primary)', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Assign
                      </button>
                    )}
                  </div>
                </section>
              ) : (
                <button
                  type="button"
                  data-bos-resource-add-trigger
                  onClick={() => setShowAdd(true)}
                  style={{
                    background: 'transparent', border: '1px dashed #cbd5e1', borderRadius: 8,
                    padding: '10px 12px', fontSize: 12, fontWeight: 600, color: 'var(--color-ink-primary)',
                    cursor: 'pointer', width: '100%',
                  }}
                >
                  + Add resource
                </button>
              )
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
