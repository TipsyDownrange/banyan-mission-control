'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

type Message = { role: 'user' | 'kai'; text: string; ts: string };

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

export default function KaiPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'kai', text: 'Kai online. Ask me anything about your jobs, crew, or data — or give me a task.', ts: now() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function now() {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speak greeting on first load
  const greetedRef = useRef(false);
  useEffect(() => {
    if (!greetedRef.current && voiceMode) {
      greetedRef.current = true;
      setTimeout(() => speak('Kai online. Ready when you are.'), 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceMode || typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.05;
    utt.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Alex') || v.lang === 'en-US');
    if (preferred) utt.voice = preferred;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, [voiceMode]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', text: text.trim(), ts: now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const kaiMsg: Message = { role: 'kai', text: '', ts: now() };
    setMessages(prev => [...prev, kaiMsg]);

    try {
      const res = await fetch('/api/kai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({
            role: m.role === 'kai' ? 'assistant' : 'user',
            content: m.text,
          }))
        }),
      });

      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      const reply = data.reply || 'No response.';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], text: reply };
        return updated;
      });
      speak(reply);
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], text: 'Connection error. Check API key configuration.' };
        return updated;
      });
    }

    setLoading(false);
  }, [loading, messages, speak]);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported in this browser.'); return; }

    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript || '';
      if (transcript) sendMessage(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
  }, [sendMessage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: '#f4f7f9' }}>
      {/* Header */}
      <div className="shrink-0 px-8 pt-8 pb-4 flex items-center justify-between">
        <div>
          <div className="label-upper text-ink-meta mb-1">AI Command</div>
          <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Kai</h1>
        </div>
        <div className="flex items-center gap-3">
          {speaking && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-teal-50 border border-teal-100">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              <span className="text-[11px] font-bold text-teal-700">Speaking</span>
            </div>
          )}
          <button
            onClick={() => { setVoiceMode(v => !v); window.speechSynthesis?.cancel(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border"
            style={{
              background: voiceMode ? 'rgba(15,118,110,0.1)' : 'white',
              borderColor: voiceMode ? '#0f766e' : '#e2e8f0',
              color: voiceMode ? '#0f766e' : '#64748b',
            }}
          >
            {voiceMode ? '🔊 Voice On' : '🔇 Voice Off'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 pb-4 scrollbar-hide">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[80%] rounded-2xl px-5 py-3"
                style={{
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #0f766e, #14b8a6)'
                    : 'white',
                  color: msg.role === 'user' ? 'white' : '#0f172a',
                  boxShadow: '0 1px 3px rgba(15,23,42,0.07)',
                  border: msg.role === 'kai' ? '1px solid #e2e8f0' : 'none',
                }}
              >
                {msg.role === 'kai' && (
                  <div className="label-upper text-teal-700 mb-1">Kai</div>
                )}
                <p className="text-[14px] leading-relaxed m-0 whitespace-pre-wrap">
                  {msg.text}
                  {msg.role === 'kai' && loading && i === messages.length - 1 && msg.text === '' && (
                    <span className="inline-flex gap-1 ml-1">
                      <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </p>
                <div className="text-[10px] mt-1 opacity-50">{msg.ts}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 px-8 pb-8">
        <div className="max-w-3xl mx-auto">
          <div
            className="flex items-end gap-3 p-3 rounded-2xl bg-white border border-surface-border"
            style={{ boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ask Kai anything about your jobs, crew, or data..."
              rows={1}
              className="flex-1 resize-none border-0 outline-none text-sm text-ink-primary bg-transparent placeholder-ink-meta"
              style={{ maxHeight: 120, lineHeight: '1.5' }}
            />

            {/* Voice button */}
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all"
              style={{
                background: listening ? '#ef4444' : 'rgba(15,118,110,0.1)',
                color: listening ? 'white' : '#0f766e',
              }}
              title="Hold to speak"
            >
              {listening ? (
                <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z"/>
                </svg>
              )}
            </button>

            {/* Send button */}
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: 'white' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <p className="text-[11px] text-ink-meta mt-2 text-center">Hold mic to speak · Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
