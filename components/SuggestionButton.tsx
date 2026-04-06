'use client';
import { useState } from 'react';
export default function SuggestionButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: text,
          email: '',
          name: typeof window !== 'undefined' ? localStorage.getItem('banyan_demo_user') || '' : '',
        }),
      });
      setSubmitted(true);
      setText('');
      setTimeout(() => { setSubmitted(false); setOpen(false); }, 2000);
    } catch {
      // Silent fail
    }
    setSubmitting(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        title="Got a suggestion? Tell Kai!"
        style={{
          position: 'fixed', bottom: 80, right: 24, zIndex: 999,
          width: 44, height: 44, borderRadius: 999,
          background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(15,118,110,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 20, fontWeight: 800,
        }}>
        💡
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 50,
      width: 340, background: 'white', borderRadius: 20,
      border: '1px solid #e2e8f0', boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #071722, #0c2330)', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>💡 Got an idea?</div>
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.7)', marginTop: 2 }}>Tell Kai in plain English — Sean will review it</div>
          </div>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#059669', fontWeight: 700 }}>
            ✅ Logged! Sean will review your suggestion.
          </div>
        ) : (
          <>
            <textarea
              value={text} onChange={e => setText(e.target.value)}
              placeholder="It would be nice if..."
              style={{ width: '100%', height: 80, padding: 12, borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <button onClick={submit} disabled={submitting || !text.trim()}
              style={{
                width: '100%', marginTop: 8, padding: '12px', borderRadius: 12,
                background: text.trim() ? 'linear-gradient(135deg, #0f766e, #14b8a6)' : '#e2e8f0',
                border: 'none', color: text.trim() ? 'white' : '#94a3b8',
                fontSize: 14, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'default',
              }}>
              {submitting ? 'Sending...' : 'Submit Suggestion'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
