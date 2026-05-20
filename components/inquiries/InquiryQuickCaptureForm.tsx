'use client';

/**
 * BAN-376 Customer Pipeline — Quick Capture form.
 *
 * Spec §7.2: minimal required fields (source + customer + contact + brief
 * description).  Optional fields collapse below.  Suggested routing per
 * spec §8.2 is rendered as a pre-filled assignee_role dropdown that the
 * operator can override at any time.
 */

import { useState, type FormEvent } from 'react';
import { suggestAssignedRole } from '@/lib/inquiries/state-machine';

export const INQUIRY_SOURCES_UI = ['PHONE', 'EMAIL', 'WALK_IN', 'RFP', 'OTHER'] as const;
export const INQUIRY_VALUE_BANDS_UI = ['UNKNOWN', 'UNDER_5K', '5K_25K', '25K_100K', '100K_500K', '500K_PLUS'] as const;
export const INQUIRY_TYPE_INITIALS_UI = ['UNCLEAR', 'WORK_ORDER', 'PROJECT'] as const;
export const INQUIRY_ASSIGNED_ROLES_UI = ['', 'PM', 'SERVICE_PM', 'ESTIMATOR', 'GM', 'ADMIN'] as const;

export type InquiryQuickCaptureSubmit = (payload: Record<string, unknown>) => Promise<void> | void;

type Props = {
  onSubmit?: InquiryQuickCaptureSubmit;
  onSubmitted?: () => void;
  defaultSource?: string;
};

export default function InquiryQuickCaptureForm({ onSubmit, onSubmitted, defaultSource = 'PHONE' }: Props) {
  const [source, setSource] = useState<string>(defaultSource);
  const [customerName, setCustomerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [description, setDescription] = useState('');
  const [typeInitial, setTypeInitial] = useState<string>('UNCLEAR');
  const [valueBand, setValueBand] = useState<string>('UNKNOWN');
  const [location, setLocation] = useState('');
  const [assignedRoleOverride, setAssignedRoleOverride] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggested = suggestAssignedRole(source, valueBand);
  const effectiveAssignedRole = assignedRoleOverride || suggested || '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (!contactEmail.trim() && !contactPhone.trim()) {
      setError('Provide at least one of email or phone.');
      return;
    }

    const payload: Record<string, unknown> = {
      source,
      customer_name: customerName.trim(),
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      inquiry_description: description.trim() || null,
      inquiry_type_initial: typeInitial,
      estimated_value_band: valueBand,
      inquiry_location: location.trim() || null,
      assigned_role: effectiveAssignedRole || null,
    };

    setSubmitting(true);
    try {
      if (onSubmit) {
        await onSubmit(payload);
      } else {
        const res = await fetch('/api/inquiries', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
      }
      onSubmitted?.();
      // Reset to defaults so Tia / Jenny can log the next one without a reload.
      setCustomerName('');
      setContactEmail('');
      setContactPhone('');
      setDescription('');
      setTypeInitial('UNCLEAR');
      setValueBand('UNKNOWN');
      setLocation('');
      setAssignedRoleOverride('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capture failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Quick Capture inquiry" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Source</legend>
        <div role="radiogroup" aria-label="Source" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {INQUIRY_SOURCES_UI.map(s => (
            <label key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                type="radio"
                name="source"
                value={s}
                checked={source === s}
                onChange={() => setSource(s)}
              />
              <span>{s}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Customer name</span>
        <input
          aria-label="Customer name"
          value={customerName}
          onChange={e => setCustomerName(e.target.value)}
          required
          style={{ width: '100%', padding: 6 }}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Email</span>
          <input
            aria-label="Contact email"
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            style={{ width: '100%', padding: 6 }}
          />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Phone</span>
          <input
            aria-label="Contact phone"
            type="tel"
            value={contactPhone}
            onChange={e => setContactPhone(e.target.value)}
            style={{ width: '100%', padding: 6 }}
          />
        </label>
      </div>

      <label>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Description</span>
        <textarea
          aria-label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          style={{ width: '100%', padding: 6 }}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <label>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Type</span>
          <select aria-label="Inquiry type" value={typeInitial} onChange={e => setTypeInitial(e.target.value)} style={{ width: '100%', padding: 6 }}>
            {INQUIRY_TYPE_INITIALS_UI.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Value band</span>
          <select aria-label="Estimated value band" value={valueBand} onChange={e => setValueBand(e.target.value)} style={{ width: '100%', padding: 6 }}>
            {INQUIRY_VALUE_BANDS_UI.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Assigned role</span>
          <select
            aria-label="Assigned role"
            value={assignedRoleOverride || suggested || ''}
            onChange={e => setAssignedRoleOverride(e.target.value)}
            style={{ width: '100%', padding: 6 }}
          >
            {INQUIRY_ASSIGNED_ROLES_UI.map(r => (
              <option key={r || 'none'} value={r}>{r || '— unassigned —'}</option>
            ))}
          </select>
          {suggested && !assignedRoleOverride && (
            <span data-testid="routing-suggestion" style={{ fontSize: 10, color: '#0c4a6e' }}>
              Suggested: {suggested}
            </span>
          )}
        </label>
      </div>

      <label>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Location (optional)</span>
        <input
          aria-label="Location"
          value={location}
          onChange={e => setLocation(e.target.value)}
          style={{ width: '100%', padding: 6 }}
        />
      </label>

      {error && (
        <div role="alert" style={{ color: '#b91c1c', fontSize: 12 }}>{error}</div>
      )}

      <button type="submit" disabled={submitting} style={{ padding: '8px 14px', alignSelf: 'flex-start', background: '#0d1f2d', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
        {submitting ? 'Logging…' : 'Log inquiry'}
      </button>
    </form>
  );
}
