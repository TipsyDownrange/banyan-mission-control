'use client';
import { useState, useRef } from 'react';

type WODraft = {
  woNumber: string; dateReceived: string; status: string;
  customerName: string; address: string; city: string; island: string;
  contactPerson: string; contactPhone: string; contactEmail: string;
  description: string; systemType: string; urgency: string;
  estimatedHours: string; notes: string;
};

const FL = (label: string, auto?: boolean) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b' }}>{label}</span>
    {auto && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.2)' }}>Auto</span>}
    {!auto && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, padding: '1px 6px', borderRadius: 999, background: 'rgba(15,118,110,0.1)', color: '#0f766e', border: '1px solid rgba(15,118,110,0.2)' }}>Input</span>}
  </div>
);

const INPUT_STYLE = (auto?: boolean): React.CSSProperties => ({
  width: '100%', padding: '10px 14px', borderRadius: 12,
  border: auto ? '1px solid rgba(249,115,22,0.3)' : '1px solid #e2e8f0',
  background: auto ? 'rgba(255,247,237,0.6)' : 'white',
  fontSize: 13, color: '#0f172a', outline: 'none',
  fontStyle: auto ? 'italic' : 'normal',
});

const SYSTEM_TYPES = ['Storefront','Window Wall','Curtainwall','Exterior Doors','Interior Doors','Shower Enclosure','Mirror','Skylights','Railing','Automatic Entrances','Other'];
const ISLANDS = ['Oahu','Maui','Kauai','Hawaii','Molokai','Lanai'];

export default function ServiceIntake({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'input' | 'review' | 'done'>('input');
  const [rawInput, setRawInput] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<WODraft | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);

  function toggleListen() {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const SR = (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      || (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) { alert('Voice not supported in this browser'); return; }
    const rec = new SR(); rec.lang = 'en-US'; rec.continuous = false;
    rec.onresult = (e: SpeechRecognitionEvent) => setRawInput(prev => prev + ' ' + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  }

  async function extractFields() {
    if (!rawInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/service/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: rawInput }),
      });
      const data = await res.json();
      if (data.workOrder) { setDraft(data.workOrder); setStep('review'); }
    } catch { alert('Error processing lead'); }
    setLoading(false);
  }

  function updateField(key: keyof WODraft, val: string) {
    setDraft(prev => prev ? { ...prev, [key]: val } : null);
  }

  function submitWO() {
    // TODO: write to Smartsheet + Google Sheet
    alert(`Work order ${draft?.woNumber} created! Write-back to Smartsheet coming next.`);
    setStep('done');
  }

  if (step === 'done') return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdfa', border: '2px solid rgba(15,118,110,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Work Order Created</div>
      <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>{draft?.woNumber} · {draft?.customerName}</div>
      <button onClick={onClose} style={{ padding: '12px 24px', borderRadius: 14, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Done</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4 }}>Service</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            {step === 'input' ? 'New Lead Intake' : 'Review Work Order'}
          </h2>
        </div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 16, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* STEP 1: Input */}
        {step === 'input' && (
          <div style={{ display: 'grid', gap: 20 }}>
            <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(15,23,42,0.03)', border: '1px dashed rgba(148,163,184,0.4)' }}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(13,148,136,0.7)', marginBottom: 6 }}>KAI</div>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                Describe the lead in plain English — customer name, location, what they need. Or tap the mic and speak it. I'll extract all the fields automatically.
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 8 }}>Describe the lead</div>
              <textarea
                value={rawInput}
                onChange={e => setRawInput(e.target.value)}
                placeholder="e.g. Maui Federal Credit Union in Wailuku, they need a new entry door and transom, dark bronze storefront, contact is Clayton Fuchigami at 808-872-4333, pretty urgent..."
                rows={5}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', resize: 'none', lineHeight: 1.5 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={toggleListen} style={{
                flex: 1, padding: '12px', borderRadius: 14, fontSize: 13, fontWeight: 700,
                border: listening ? '1px solid rgba(239,68,68,0.3)' : '1px solid #e2e8f0',
                background: listening ? 'rgba(254,242,242,0.9)' : 'white',
                color: listening ? '#ef4444' : '#64748b', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={listening ? '#ef4444' : 'currentColor'}>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z"/>
                </svg>
                {listening ? 'Listening... tap to stop' : 'Tap to speak'}
              </button>

              <button onClick={extractFields} disabled={!rawInput.trim() || loading}
                style={{ flex: 2, padding: '12px', borderRadius: 14, fontSize: 13, fontWeight: 700,
                  background: rawInput.trim() ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0',
                  color: rawInput.trim() ? 'white' : '#94a3b8', border: 'none', cursor: rawInput.trim() ? 'pointer' : 'default',
                  boxShadow: rawInput.trim() ? '0 4px 16px rgba(15,118,110,0.3)' : 'none',
                }}>
                {loading ? 'Extracting...' : 'Extract Fields →'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Review */}
        {step === 'review' && draft && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(240,253,250,0.96)', border: '1px solid rgba(15,118,110,0.2)', display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(13,148,136,0.7)', flexShrink: 0, marginTop: 2 }}>KAI</span>
              <span style={{ fontSize: 12, color: '#475569' }}>Fields extracted. Orange = auto-filled, review and correct. Green = your input required. Hit Create WO when ready.</span>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)' }} />
                <span style={{ color: '#94a3b8' }}>Auto-filled by Kai</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'white', border: '1px solid #e2e8f0' }} />
                <span style={{ color: '#94a3b8' }}>Your input</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div>{FL('WO Number', true)}</div><input style={INPUT_STYLE(true)} value={draft.woNumber} onChange={e => updateField('woNumber', e.target.value)} /></div>
              <div><div>{FL('Date Received', true)}</div><input style={INPUT_STYLE(true)} value={draft.dateReceived} onChange={e => updateField('dateReceived', e.target.value)} /></div>
            </div>

            <div><div>{FL('Customer / Job Name', true)}</div><input style={INPUT_STYLE(true)} value={draft.customerName} onChange={e => updateField('customerName', e.target.value)} /></div>
            <div><div>{FL('Address', true)}</div><input style={INPUT_STYLE(true)} value={draft.address} onChange={e => updateField('address', e.target.value)} /></div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div>{FL('City', true)}</div><input style={INPUT_STYLE(true)} value={draft.city} onChange={e => updateField('city', e.target.value)} /></div>
              <div><div>{FL('Island', true)}</div>
                <select style={INPUT_STYLE(true)} value={draft.island} onChange={e => updateField('island', e.target.value)}>
                  <option value="">Select island</option>
                  {ISLANDS.map(i => <option key={i}>{i}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div>{FL('Contact Person', true)}</div><input style={INPUT_STYLE(true)} value={draft.contactPerson} onChange={e => updateField('contactPerson', e.target.value)} /></div>
              <div><div>{FL('Contact Phone', true)}</div><input style={INPUT_STYLE(true)} value={draft.contactPhone} onChange={e => updateField('contactPhone', e.target.value)} /></div>
            </div>

            <div><div>{FL('Description', true)}</div>
              <textarea style={{ ...INPUT_STYLE(true), resize: 'none' }} rows={3} value={draft.description} onChange={e => updateField('description', e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div>{FL('System Type', true)}</div>
                <select style={INPUT_STYLE(true)} value={draft.systemType} onChange={e => updateField('systemType', e.target.value)}>
                  <option value="">Select type</option>
                  {SYSTEM_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><div>{FL('Urgency', true)}</div>
                <select style={INPUT_STYLE(true)} value={draft.urgency} onChange={e => updateField('urgency', e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="low">Low priority</option>
                </select>
              </div>
            </div>

            <div><div>{FL('Assigned To')}</div>
              <select style={INPUT_STYLE()} value={draft.notes || ''} onChange={e => updateField('notes', e.target.value)}>
                <option value="">Assign crew...</option>
                <option>Joey Ritthaler</option>
                <option>Joey Ritthaler, Nate Nakamura</option>
                <option>Joey Ritthaler, Karl Nakamura Sr.</option>
                <option>Nate Nakamura</option>
              </select>
            </div>

            <div><div>{FL('Additional Notes')}</div>
              <textarea style={{ ...INPUT_STYLE(), resize: 'none' }} rows={2} placeholder="Any additional notes..." value={''} onChange={() => {}} />
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {step === 'review' && (
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={() => setStep('input')} style={{ flex: 1, padding: '12px', borderRadius: 14, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ← Re-enter
          </button>
          <button onClick={submitWO} style={{ flex: 2, padding: '12px', borderRadius: 14, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.3)' }}>
            Create Work Order
          </button>
        </div>
      )}
    </div>
  );
}
