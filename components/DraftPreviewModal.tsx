'use client';
import { useState, useMemo } from 'react';

type PreparedBy = { name: string; email: string; phone: string };

interface Totals {
  grandTotal: number;
  customerMaterials: number;
  customerLabor: number;
  getRate: number;
  getAmt: number;
}

interface WORecord {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface DraftPreviewModalProps {
  woNumber: string;
  wo: WORecord | null;
  customerEmail: string;
  customerName: string;
  preparedBy: PreparedBy;
  totals: Totals | null;
  quote: Record<string, unknown> | null;
  onClose: () => void;
  onSent: (to: string) => void;
}

const FONT = '-apple-system, "SF Pro Display", Inter, system-ui, sans-serif';
const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid #e2e8f0', background: 'white',
  fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
  fontFamily: FONT,
};

const DEFAULT_TEMPLATE = `Hi {customer_first_name},

I put together the attached proposal for {project_name}. Let me know if you have any questions or if there's anything you'd like me to adjust.

A 50% deposit of {deposit_amount} gets us started. Proposal is good for 30 days.

Appreciate the opportunity to work with you on this.

{sender_first_name}
Kula Glass — {sender_phone_ext}`;

function substitutePlaceholders(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined && val !== '' ? val : `{missing: ${key}}`;
  });
}

function extractMissingVars(text: string): string[] {
  return [...text.matchAll(/\{missing: ([^}]+)\}/g)].map(m => m[1]);
}

const FL = (label: string) => (
  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b', marginBottom: 5 }}>
    {label}
  </div>
);

export default function DraftPreviewModal({
  woNumber, wo, customerEmail, customerName, preparedBy, totals, quote, onClose, onSent,
}: DraftPreviewModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const normalizedWoNumber = woNumber.replace(/^WO-/i, '');
  const deposit = totals ? Math.round(totals.grandTotal * 50) / 100 : undefined;
  const projectName = wo?.name || wo?.description || '';

  const vars = useMemo<Record<string, string | undefined>>(() => ({
    customer_first_name: (customerName || '').split(/[\s,]+/).filter(Boolean)[0] || undefined,
    project_name: projectName || undefined,
    deposit_amount: deposit !== undefined
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(deposit)
      : undefined,
    sender_first_name: (preparedBy.name || '').split(' ').filter(Boolean)[0] || undefined,
    sender_phone_ext: preparedBy.phone || undefined,
  }), [customerName, projectName, deposit, preparedBy.name, preparedBy.phone]);

  const defaultSubject = `Kula Glass Proposal — ${projectName || 'Project'} — WO ${normalizedWoNumber}`;
  const defaultBody = useMemo(() => substitutePlaceholders(DEFAULT_TEMPLATE, vars), [vars]);

  const [to, setTo] = useState(customerEmail);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const missingVars = extractMissingVars(body);
  const pdfFilename = `Proposal-WO-${normalizedWoNumber}-${today}.pdf`;

  async function handleSend() {
    if (!to.trim()) { setError('Recipient email is required'); return; }
    setSending(true);
    setError('');
    try {
      // Prefer the full quote payload from generateQuote() if available (has lineItems etc.)
      // Fall back to totals-only payload if quote not yet generated.
      const quotePayload = quote
        ? {
            ...quote,
            woNumber,
            quoteDate: today,
            materialsTotal: totals?.customerMaterials ?? (quote.materialsTotal as number) ?? 0,
            laborSubtotal: totals?.customerLabor ?? (quote.laborSubtotal as number) ?? 0,
            getRate: totals?.getRate ?? (quote.getRate as number) ?? 4.712,
            getAmount: totals?.getAmt ?? (quote.getAmount as number) ?? 0,
            total: totals?.grandTotal ?? (quote.total as number) ?? 0,
            deposit: deposit ?? (quote.deposit as number) ?? 0,
            preparedBy,
          }
        : {
            woNumber,
            quoteDate: today,
            customerName,
            customerEmail: to.trim(),
            materialsTotal: totals?.customerMaterials || 0,
            laborSubtotal: totals?.customerLabor || 0,
            getRate: totals?.getRate || 4.712,
            getAmount: totals?.getAmt || 0,
            total: totals?.grandTotal || 0,
            deposit: deposit || 0,
            validityDays: 30,
            preparedBy,
          };

      const res = await fetch('/api/service/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote: quotePayload,
          sendEmail: true,
          emailTo: to.trim(),
          emailSubject: subject,
          emailBody: body,
        }),
      });
      const data = await res.json();
      if (data.success && data.email_sent) {
        onSent(to.trim());
      } else if (data.success && !data.email_sent) {
        setError('Proposal generated but email failed to send. Check Gmail delegation settings in Google Admin Console.');
        setSending(false);
      } else {
        setError('Email failed: ' + (data.error || 'Unknown error'));
        setSending(false);
      }
    } catch (e) {
      setError('Email failed: ' + String(e));
      setSending(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget && !sending) onClose(); }}
    >
      <div style={{
        background: 'white', borderRadius: 16,
        boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        width: '100%', maxWidth: 560, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', fontFamily: FONT,
        margin: '0 16px',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>Email to Customer</div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: 0 }}>Review &amp; Send Proposal</h2>
          </div>
          <button
            onClick={() => !sending && onClose()}
            style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: sending ? 'default' : 'pointer', fontSize: 16, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.4 : 1 }}
          >×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Missing vars warning */}
          {missingVars.length > 0 && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>
              Fill before sending: {missingVars.join(', ')} — edit the body below.
            </div>
          )}

          {/* To */}
          <div>
            {FL('To')}
            <input type="email" value={to} onChange={e => setTo(e.target.value)} style={INP} />
          </div>

          {/* Subject */}
          <div>
            {FL('Subject')}
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} style={INP} />
          </div>

          {/* Body */}
          <div>
            {FL('Message')}
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={13}
              style={{ ...INP, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          {/* Attachment */}
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{pdfFilename}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>PDF proposal — generated on send</div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => !sending && onClose()}
            style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.4 : 1, fontFamily: FONT }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !to.trim()}
            style={{
              flex: 2, padding: '11px', borderRadius: 12, border: 'none',
              background: sending || !to.trim() ? '#e2e8f0' : '#4338ca',
              color: sending || !to.trim() ? '#94a3b8' : 'white',
              fontSize: 13, fontWeight: 700,
              cursor: sending || !to.trim() ? 'default' : 'pointer',
              boxShadow: !sending && to.trim() ? '0 4px 16px rgba(67,56,202,0.3)' : 'none',
              fontFamily: FONT,
            }}
          >
            {sending ? 'Sending…' : '📧 Send Proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}
