'use client';
import { useState, useEffect, useRef } from 'react';
import { useVoice } from './useVoice';


type OnboardingStep = 'welcome' | 'meet-kai' | 'workspace' | 'chat' | 'routines' | 'done';
type Message = { role: 'kai' | 'user'; text: string; options?: string[] };

const ROLE_QUESTIONS: Record<string, { workspace: string; tips: string[]; routines: string[] }> = {
  'admin': {
    workspace: 'Admin & Finance',
    tips: ['Track recurring tasks and deadlines', 'Monitor compliance items', 'Process documents and approvals'],
    routines: ['Weekly compliance check', 'Daily task summary', 'Document expiration alerts'],
  },
  'gm': {
    workspace: 'Everything — you see the full picture',
    tips: ['Operations overview for company health', 'Project cards for quick status', 'Dispatch board for crew management'],
    routines: ['Morning briefing with priorities', 'Weekly project health summary', 'Daily cost check'],
  },
  'pm': {
    workspace: 'Projects',
    tips: ['Project cards show your KPIs at a glance', 'Click into any project for submittals, RFIs, change orders', 'QA/Install tracks field progress'],
    routines: ['Monday project status summary', 'Submittal aging alerts', 'RFI response reminders'],
  },
  'estimator': {
    workspace: 'Estimating',
    tips: ['Bid Queue shows all active bids with deadlines', 'Estimator Workspace is your personal bid tracker', 'Due dates turn red when approaching'],
    routines: ['Daily bid deadline reminder', 'Weekly pipeline summary', 'New bid assignment alerts'],
  },
  'service_pm': {
    workspace: 'Service',
    tips: ['Kanban board tracks every work order', 'Create leads with one click — Kai fills the rest', 'Dispatch with crew multi-select by island'],
    routines: ['New lead notifications', 'Aging quote reminders', 'Weekly completed WO summary'],
  },
  'super': {
    workspace: 'Operations',
    tips: ['Dispatch board shows your crew assignments', 'Schedule view for the next 14 days', 'Field issues flagged in real time'],
    routines: ['Tomorrow\'s crew assignments at 6 PM', 'Open issue alerts', 'Weather check before dispatch'],
  },
  'field': {
    workspace: 'Your daily schedule and tasks',
    tips: ['Check your schedule every morning', 'Log daily reports before 3:30 PM', 'Report field issues immediately with photos'],
    routines: ['Tomorrow\'s schedule reminder at 6 PM', 'Daily report reminder at 3 PM'],
  },
};

export default function OnboardingFlow({ userRole, onComplete }: { userRole: string; onComplete: () => void }) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [welcomeSlide, setWelcomeSlide] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [selectedRoutines, setSelectedRoutines] = useState<Set<string>>(new Set());
  const [painPoint, setPainPoint] = useState('');
  const [updatePref, setUpdatePref] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { speaking, listening, voiceEnabled, setVoiceEnabled, speak, stopSpeaking, startListening, stopListening } = useVoice();
  const userName = typeof window !== 'undefined' ? (localStorage.getItem('banyan_demo_user') || 'there').split(' ')[0] : 'there';
  const roleConfig = ROLE_QUESTIONS[userRole] || ROLE_QUESTIONS['field'];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function addKaiMessage(text: string, options?: string[]) {
    setTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'kai', text, options }]);
      setTyping(false);
      // Kai speaks the message
      if (voiceEnabled) speak(text.replace(/\*\*/g, ''));
    }, 600);
  }

  function addUserMessage(text: string) {
    setMessages(prev => [...prev, { role: 'user', text }]);
  }

  // Welcome slides
  const SLIDES = [
    {
      title: 'Welcome to BanyanOS',
      subtitle: 'The operating system for Kula Glass',
      icon: '△',
      desc: 'Everything you need — projects, scheduling, field reports, estimating — all in one place.',
    },
    {
      title: 'Your AI-Powered Workspace',
      subtitle: 'Built for glazing professionals',
      icon: '◈',
      desc: 'Every section is designed for how you actually work. No spreadsheet hunting. No email digging.',
    },
    {
      title: 'Meet Kai',
      subtitle: 'Your AI assistant',
      icon: '✦',
      desc: "I'm here to help you work smarter. I know your projects, your schedule, and your team. Just ask.",
    },
  ];

  function startChat() {
    setStep('chat');
    setTimeout(() => {
      addKaiMessage(`Hey ${userName}! I'm Kai — your AI assistant inside BanyanOS. I already know you're part of the Kula Glass team, but I'd love to learn a little more about how you work so I can be more helpful. Ready?`, ['Let\'s do it', 'Sure']);
    }, 300);
  }

  function handleChatResponse(text: string) {
    addUserMessage(text);

    // Conversation flow based on message count
    const userMsgCount = messages.filter(m => m.role === 'user').length + 1;

    if (userMsgCount === 1) {
      // After "Let's do it"
      addKaiMessage(`Great! So your role here is ${userRole === 'gm' ? 'General Manager' : userRole === 'pm' ? 'Project Manager' : userRole === 'estimator' ? 'Estimator' : userRole === 'service_pm' ? 'Service Manager' : userRole === 'super' ? 'Superintendent' : userRole === 'admin' ? 'Admin' : 'Field Crew'}. Your main workspace will be **${roleConfig.workspace}**.

What's the hardest part of your typical work day? The thing that eats the most time or causes the most frustration?`);
    } else if (userMsgCount === 2) {
      // They shared their pain point
      setPainPoint(text);
      addKaiMessage(`That's really helpful to know — I'll keep that in mind. A lot of what BanyanOS does is designed to fix exactly that kind of thing.

How do you prefer to get updates — in the app when you open it, push notifications, email summaries, or all of the above?`, ['In the app', 'Email summaries', 'All of the above']);
    } else if (userMsgCount === 3) {
      setUpdatePref(text);
      setStep('routines');
    }
  }

  function finishOnboarding() {
    // Save onboarding data
    const data = {
      user: typeof window !== 'undefined' ? localStorage.getItem('banyan_demo_user') : '',
      role: userRole,
      painPoint,
      updatePref,
      routines: Array.from(selectedRoutines),
      completedAt: new Date().toISOString(),
    };
    
    // Store in localStorage for now
    localStorage.setItem('banyan_onboarding', JSON.stringify(data));
    localStorage.setItem('banyan_onboarded', 'true');
    
    // TODO: POST to /api/onboarding to save profile + create routines
    
    setStep('done');
    setTimeout(onComplete, 2000);
  }

  // Shared styles
  const PAGE: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'linear-gradient(160deg, #071722 0%, #0c2330 50%, #102c39 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif',
    color: '#f8fafc', overflow: 'hidden',
  };

  // ─── WELCOME SLIDES ────────────────────────
  if (step === 'welcome') {
    const slide = SLIDES[welcomeSlide];
    return (
      <div style={PAGE}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: '0 24px' }}>
          <div style={{ marginBottom: 24 }}>
            {welcomeSlide === 0 ? (
              <img src="/banyan-logo-white.png" alt="BanyanOS" style={{ width: 120, height: 'auto', opacity: 0.9 }} />
            ) : welcomeSlide === 1 ? (
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect x="8" y="8" width="48" height="48" rx="16" fill="#14b8a6" opacity="0.12"/>
                <rect x="16" y="16" width="32" height="32" rx="10" fill="#14b8a6" opacity="0.2"/>
                <path d="M28 24h8v4h-8zm-4 8h16v4H24zm-2 8h20v4H22z" fill="#14b8a6" opacity="0.5"/>
              </svg>
            ) : (
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="32" r="24" fill="#14b8a6" opacity="0.1"/>
                <circle cx="32" cy="32" r="12" fill="#14b8a6" opacity="0.25"/>
                <circle cx="32" cy="32" r="4" fill="#14b8a6"/>
                <path d="M32 8v8M32 48v8M8 32h8M48 32h8" stroke="#14b8a6" strokeWidth="1.5" opacity="0.3"/>
              </svg>
            )}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 8px' }}>
            {slide.title.includes('Banyan') ? <>Banyan<span style={{ color: '#14b8a6' }}>OS</span></> : slide.title}
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(148,163,184,0.7)', margin: '0 0 12px' }}>{slide.subtitle}</p>
          <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.5)', lineHeight: 1.6, margin: '0 0 40px' }}>{slide.desc}</p>

          {/* Dots */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
            {SLIDES.map((_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === welcomeSlide ? '#14b8a6' : 'rgba(148,163,184,0.3)', transition: 'background 0.3s' }} />
            ))}
          </div>

          {welcomeSlide < SLIDES.length - 1 ? (
            <button onClick={() => setWelcomeSlide(prev => prev + 1)}
              style={{ padding: '14px 48px', borderRadius: 14, background: 'rgba(20,184,166,0.15)', border: '1.5px solid rgba(20,184,166,0.3)', color: '#5eead4', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Next
            </button>
          ) : (
            <button onClick={startChat}
              style={{ padding: '14px 48px', borderRadius: 14, background: 'linear-gradient(135deg, #0f766e, #14b8a6)', border: 'none', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(20,184,166,0.3)' }}>
              Talk to Kai →
            </button>
          )}

          <button onClick={() => { localStorage.setItem('banyan_onboarded', 'true'); onComplete(); }}
            style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'rgba(148,163,184,0.4)', fontSize: 12, cursor: 'pointer' }}>
            Skip onboarding
          </button>
        </div>
      </div>
    );
  }

  // ─── CHAT WITH KAI ─────────────────────────
  if (step === 'chat') {
    return (
      <div style={{ ...PAGE, justifyContent: 'flex-end' }}>
        <div style={{ width: '100%', maxWidth: 600, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ padding: '20px 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#5eead4', letterSpacing: '0.1em' }}>✦ KAI</div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', marginTop: 4 }}>Getting to know you</div>
            </div>
            <button onClick={() => { setVoiceEnabled(!voiceEnabled); if (speaking) stopSpeaking(); }}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '6px 12px', cursor: 'pointer', color: voiceEnabled ? '#5eead4' : '#64748b', fontSize: 12, fontWeight: 700 }}>
              {voiceEnabled ? 'Voice' : 'Muted'}
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                <div style={{
                  maxWidth: '80%', padding: '12px 16px', borderRadius: 16,
                  background: msg.role === 'user' ? 'rgba(20,184,166,0.2)' : 'rgba(255,255,255,0.06)',
                  border: msg.role === 'user' ? '1px solid rgba(20,184,166,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  fontSize: 14, lineHeight: 1.6, color: msg.role === 'user' ? '#5eead4' : '#e2e8f0',
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {/* Quick reply options */}
            {messages.length > 0 && messages[messages.length - 1].options && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {messages[messages.length - 1].options!.map((opt, i) => (
                  <button key={i} onClick={() => handleChatResponse(opt)}
                    style={{ padding: '8px 18px', borderRadius: 999, background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)', color: '#5eead4', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {opt}
                  </button>
                ))}
              </div>
            )}
            {typing && (
              <div style={{ display: 'flex', gap: 4, padding: '8px 0' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(20,184,166,0.4)', animation: `pulse 1s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
                <style>{`@keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 24px 24px' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Mic button */}
              <button
                onMouseDown={() => startListening((text) => { handleChatResponse(text); })}
                onMouseUp={() => stopListening()}
                onTouchStart={() => startListening((text) => { handleChatResponse(text); })}
                onTouchEnd={() => stopListening()}
                style={{
                  width: 48, height: 48, borderRadius: 14, flexShrink: 0, cursor: 'pointer',
                  background: listening ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
                  border: listening ? '1.5px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  color: listening ? '#f87171' : '#94a3b8', fontSize: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: listening ? 'pulse-mic 1s ease-in-out infinite' : 'none',
                }}>
                
              </button>
              <style>{`@keyframes pulse-mic { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }`}</style>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { handleChatResponse(input.trim()); setInput(''); } }}
                placeholder={listening ? 'Listening...' : 'Type or hold  to speak...'}
                style={{ flex: 1, padding: '14px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 14, outline: 'none' }}
              />
              <button onClick={() => { if (input.trim()) { handleChatResponse(input.trim()); setInput(''); } }}
                style={{ padding: '14px 20px', borderRadius: 14, background: 'rgba(20,184,166,0.2)', border: '1px solid rgba(20,184,166,0.3)', color: '#5eead4', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Send
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: 'rgba(148,163,184,0.4)' }}>
              {speaking ? 'Kai is speaking...' : listening ? 'Listening...' : 'Hold mic to speak · Type to text'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── ROUTINES SETUP ────────────────────────
  if (step === 'routines') {
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 500, padding: '0 24px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#5eead4', letterSpacing: '0.1em', marginBottom: 8 }}>✦ ROUTINES</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>Set Up Your Automations</h2>
            <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.6)', margin: 0 }}>
              Kai can send you helpful updates on a schedule. Pick what sounds useful — you can always change these later.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {roleConfig.routines.map((routine, i) => {
              const selected = selectedRoutines.has(routine);
              return (
                <button key={i} onClick={() => {
                  setSelectedRoutines(prev => {
                    const next = new Set(prev);
                    selected ? next.delete(routine) : next.add(routine);
                    return next;
                  });
                }}
                  style={{
                    padding: '16px 20px', borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                    background: selected ? 'rgba(20,184,166,0.12)' : 'rgba(255,255,255,0.04)',
                    border: selected ? '1.5px solid rgba(20,184,166,0.4)' : '1.5px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    background: selected ? '#14b8a6' : 'transparent',
                    border: selected ? 'none' : '2px solid rgba(148,163,184,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 14, fontWeight: 800,
                  }}>
                    {selected && '✓'}
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: selected ? '#5eead4' : 'rgba(148,163,184,0.7)' }}>
                    {routine}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={finishOnboarding}
              style={{ padding: '14px 40px', borderRadius: 14, background: 'linear-gradient(135deg, #0f766e, #14b8a6)', border: 'none', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(20,184,166,0.3)' }}>
              {selectedRoutines.size > 0 ? `Set up ${selectedRoutines.size} routine${selectedRoutines.size > 1 ? 's' : ''} →` : 'Skip for now →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── DONE ──────────────────────────────────
  if (step === 'done') {
    return (
      <div style={PAGE}>
        <div style={{ textAlign: 'center' }}>
          <img src="/banyan-logo-white.png" alt="BanyanOS" style={{ width: 80, height: 'auto', opacity: 0.9, marginBottom: 20 }} />
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>You're all set!</h2>
          <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.6)' }}>
            Welcome to BanyanOS. Kai is always here if you need help.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
