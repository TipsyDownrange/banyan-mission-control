'use client';
import { useState, useRef, useEffect } from 'react';
import type { AppView } from '@/app/page';

type Message = { role: 'user' | 'kai'; text: string };

const CONTEXT_LABEL: Partial<Record<AppView, string>> = {
  'Overview': 'operations',
  'Event Feed': 'field operations',
  'Issues': 'field issues',
  'Projects': 'project management',
  'Schedules': 'construction schedules',
  'Submittals': 'submittals and RFIs',
  'Bid Queue': 'estimating',
  'Bid Intake': 'bid intake and estimating',
  'Crew': 'crew and personnel',
  'Today': 'your daily priorities',
  'Task Board': 'task management',
  'Approvals': 'approvals',
  'Workflows': 'scheduled workflows',
  'Cost & Usage': 'AI usage and cost',
};

export default function KaiFloat({ activeView }: { activeView: AppView }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const context = CONTEXT_LABEL[activeView] || 'BanyanOS';

  // Reset messages when context changes (user switches sections)
  const prevContextRef = useRef(context);
  useEffect(() => {
    if (prevContextRef.current !== context) {
      prevContextRef.current = context;
      setMessages([{ role: 'kai', text: `Switched to ${context}. What do you need?` }]);
    }
  }, [context]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'kai', text: `On ${context}. What do you need?` }]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, context]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text?: string) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg: Message = { role: 'user', text: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/kai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: activeView,
          messages: [...messages, userMsg].map(m => ({
            role: m.role === 'kai' ? 'assistant' : 'user',
            content: m.text,
          }))
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'kai', text: data.reply || 'No response.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'kai', text: 'Connection error.' }]);
    }
    setLoading(false);
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 20px', borderRadius: 999,
            background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
            color: 'white', fontSize: 14, fontWeight: 700,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(15,118,110,0.35), 0 1px 4px rgba(0,0,0,0.1)',
            zIndex: 1000, letterSpacing: '-0.01em',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
        >
          
          Ask Kai
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          width: 380, height: 520,
          background: 'white', borderRadius: 24,
          border: '1px solid rgba(148,163,184,0.2)',
          boxShadow: '0 20px 60px rgba(15,23,42,0.15), 0 4px 16px rgba(15,23,42,0.08)',
          display: 'flex', flexDirection: 'column',
          zIndex: 1000, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #071722 0%, #0c2330 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: '#14b8a6' }}>◎</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>Kai</div>
                <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{context}</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(148,163,184,0.7)', fontSize: 18, cursor: 'pointer', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '10px 14px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: m.role === 'user' ? 'linear-gradient(135deg, #0f766e, #14b8a6)' : '#f8fafc',
                  color: m.role === 'user' ? 'white' : '#0f172a',
                  fontSize: 13, lineHeight: 1.5,
                  border: m.role === 'kai' ? '1px solid #e2e8f0' : 'none',
                }}>
                  {m.role === 'kai' && <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(15,118,110,0.6)', marginBottom: 4 }}>KAI</div>}
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#14b8a6', animation: 'bounce 1s ease infinite', animationDelay: `${i*150}ms`, display: 'inline-block' }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {messages.length <= 1 && (
            <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                activeView === 'Bid Intake' ? 'What needs attention today?' : null,
                activeView === 'Projects' ? 'Any projects at risk?' : null,
                activeView === 'Issues' ? 'What\'s blocking work?' : null,
                'Summarize my day',
                'What should I prioritize?',
              ].filter(Boolean).slice(0,3).map((s, i) => (
                <button key={i} onClick={() => send(s!)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 999, border: '1px solid #e2e8f0', background: 'white', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '8px 12px 14px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: '8px 14px' }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Ask about ${context}...`}
                style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#0f172a' }}
              />
              <button onClick={() => send()} disabled={!input.trim() || loading}
                style={{ width: 28, height: 28, borderRadius: '50%', background: input.trim() ? 'linear-gradient(135deg, #0f766e, #14b8a6)' : '#e2e8f0', border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
          <style>{`@keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }`}</style>
        </div>
      )}
    </>
  );
}
