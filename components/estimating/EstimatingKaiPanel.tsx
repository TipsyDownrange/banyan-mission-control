'use client';
import React, { useState, useRef, useEffect } from 'react';
import type { BidSummary } from '@/components/estimating/EstimatingWorkspace';

interface EstimatingKaiPanelProps {
  bid: BidSummary;
  activeTab: string;
  onBidUpdate?: (updates: Partial<BidSummary>) => void;
}

// ─── Estimating GPT Instructions (from ESTIMATING_GPT_ACTUAL_INSTRUCTIONS.md) ───
const ESTIMATING_SYSTEM_PROMPT = `You are an expert estimating copilot for Kula Glass Company, a union specialty glass and architectural aluminum subcontractor in Hawaii (BanyanOS).

Your objectives:
- Produce accurate, defensible takeoffs
- Calculate glass correctly using DLO + bite methodology (NEVER use frame/module size as glass size)
- Apply company exclusions automatically
- Normalize labor against historical benchmarks
- Preserve contractual risk posture
- Generate structured GOLD DATA outputs

Accuracy and glazing-system correctness override speed. Never fabricate quantities, glass sizes, labor productivity, or historical comparisons. If critical data is missing → mark TBD and generate an RFI.

SYSTEM TAXONOMY (MANDATORY — use only these):
Curtainwall, Window Wall, Storefront, Interior Storefront, Interior Doors, Exterior Doors, Railing, Skylights, Trellis, Automatic Entrances, Metal Screen Walls, Aluminum Composite Metal Panels, Aluminum Panels, Door Openers, Louvers

GLASS CALCULATION STANDARD (NON-NEGOTIABLE):
- Glass Width = DLO Width + (2 × Bite)
- Glass Height = DLO Height + (2 × Bite)
- DLO = visible daylight opening between sightlines
- Bite = system-specific glazing pocket engagement per side
- Always state bite assumption, show DLO calculation before final SF

LABOR POLICY:
For hospitality, resort, phased, or occupied projects: use Base_Hours plus friction factors for access logistics, room release, punch returns, limited laydown, hoisting, travel, premium-time.

GOLD DATA (mandatory for every takeoff):
Output one row per System_Type + Assembly_ID with: Job_ID, System_Type, Assembly_ID, Benchmark_Status, Drawing_Refs, Spec_Refs, Qty_SF, Qty_EA, Key_Assumptions, Access_Type, Complexity_Level, Top_Risk_Tags, Lessons_Learned.

BENCHMARK RULE:
Compare productivity to historical data. Flag deviations >10%. Assign Benchmark_Status: Stable / Elevated Risk / Outlier / NA. Never fabricate benchmark data.`;

const VALIDATE_RULES = [
  { id: 'dlo', label: 'Glass calc uses DLO+bite (not frame opening)', check: 'dlo_bite_method' },
  { id: 'taxonomy', label: 'System types from approved taxonomy', check: 'system_taxonomy' },
  { id: 'gaps', label: 'Bid Gap Log populated', check: 'bid_gaps' },
  { id: 'gold', label: 'Gold Data section populated', check: 'gold_data' },
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ValidationResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'unknown';
  note?: string;
}

const TAB_CONTEXT: Record<string, { title: string; suggestion: string; actions?: string[] }> = {
  overview: {
    title: 'Bid Overview',
    suggestion: 'Upload documents or link a Drive folder to unlock AI takeoff generation and compliance assessment.',
    actions: [],
  },
  carls: {
    title: "Simple Estimate",
    suggestion: "Kai can sync from the detailed estimate to pre-fill Simple Estimate. Manual overrides are preserved.",
    actions: ['Sync from Estimate', 'Export PDF'],
  },
  takeoff: {
    title: 'Takeoff',
    suggestion: 'Upload architectural plans and Division 08 specs to let Kai auto-generate the full takeoff.',
    actions: ['Generate Takeoff', 'Validate Takeoff'],
  },
  estimate: {
    title: 'Estimate',
    suggestion: 'Once takeoff is complete, Kai can generate the full estimate with historical cost comparisons.',
    actions: ['Generate Estimate'],
  },
  quotes: {
    title: 'Quotes',
    suggestion: 'Upload vendor quote PDFs and Kai will parse them into the standard coverage matrix.',
    actions: ['Parse Quote PDF'],
  },
  gaps: {
    title: 'Bid Gaps',
    suggestion: 'Kai will auto-populate gaps from spec/drawing analysis. Review and resolve before submitting.',
    actions: ['Auto-populate Gaps'],
  },
  proposal: {
    title: 'Proposal',
    suggestion: 'Once estimate is complete, generate the customer proposal with one click.',
    actions: ['Generate Proposal', "Generate Estimate PDF"],
  },
  gold: {
    title: 'Gold Data',
    suggestion: 'Historical data is read-only during estimating. You can update actuals after project completion.',
  },
};

export default function EstimatingKaiPanel({ bid, activeTab, onBidUpdate }: EstimatingKaiPanelProps) {
  const ctx = TAB_CONTEXT[activeTab] ?? TAB_CONTEXT.overview;

  // Upload state
  const dropInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadResults, setUploadResults] = useState<Array<{ name: string; link?: string; folder: string }>>([]);
  const [dragOver, setDragOver] = useState(false);

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(`${files.length} file${files.length > 1 ? 's' : ''}`);
    setUploadResults([]);
    const results: Array<{ name: string; link?: string; folder: string }> = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const form = new FormData();
        form.append('file', file);
        form.append('bidKID', bid.bidVersionId);
        form.append('bidName', bid.projectName ?? 'Unknown');
        form.append('estimator', bid.estimator ?? '');
        // Let the upload API auto-detect the subfolder from filename/extension
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (data.success) {
          results.push({ name: data.fileName, link: data.webViewLink, folder: data.path?.split('/').slice(-2, -1)[0] || 'auto-sorted' });
        }
      }
      setUploadResults(results);
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(null);
    }
  }

  // Trigger Takeoff state
  const [showTakeoffTrigger, setShowTakeoffTrigger] = useState(false);
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; mimeType: string; webViewLink: string; folder?: string }>>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  // Folder link state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [folderUrl, setFolderUrl] = useState(bid.bidFolderUrl ?? '');
  const [folderSaving, setFolderSaving] = useState(false);

  // Ask Kai chat state
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Validate Takeoff state
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[] | null>(null);

  // GPT Instructions panel state
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  function normalizeFolderUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('https://drive.google.com/')) return trimmed;
    const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match) return `https://drive.google.com/drive/folders/${match[1]}`;
    if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)) {
      return `https://drive.google.com/drive/folders/${trimmed}`;
    }
    return trimmed;
  }

  async function handleLinkFolder() {
    const normalized = normalizeFolderUrl(folderUrl);
    if (!normalized) return;
    setFolderSaving(true);
    try {
      await fetch(`/api/estimating/bids/${bid.bidVersionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_folder_url: normalized }),
      });
      onBidUpdate?.({ bidFolderUrl: normalized });
      setShowLinkModal(false);
    } catch (err) {
      console.error('Folder link failed', err);
    } finally {
      setFolderSaving(false);
    }
  }

  async function sendChatMessage() {
    const userMsg = chatInput.trim();
    if (!userMsg || chatLoading) return;
    setChatInput('');
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: userMsg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      // Build context-rich system message with estimating instructions + job context
      const jobContext = `\n\nCURRENT JOB CONTEXT:\nJob: ${bid.projectName ?? 'Unknown'}\nBid Version: ${bid.bidVersionId}\nStatus: ${bid.status}\nEstimator: ${bid.estimator ?? 'TBD'}\nIsland: ${bid.island ?? 'TBD'}\nTotal Estimate: ${bid.totalEstimate ?? 'TBD'}`;
      const systemWithContext = ESTIMATING_SYSTEM_PROMPT + jobContext;

      const res = await fetch('/api/kai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemWithContext },
            ...newMessages,
          ],
        }),
      });
      const data = await res.json();
      setChatMessages([...newMessages, { role: 'assistant', content: data.reply ?? 'No response.' }]);
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Error contacting Kai. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleTriggerTakeoff() {
    // Get folder ID from bid's folder URL
    const folderUrl = bid.bidFolderUrl ?? '';
    const folderMatch = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
    const folderId = folderMatch ? folderMatch[1] : null;

    setShowTakeoffTrigger(true);
    setDriveFiles([]);
    setSelectedDocs([]);

    if (folderId) {
      setDriveLoading(true);
      try {
        const res = await fetch(`/api/drive/list?folderId=${folderId}`);
        const data = await res.json();
        if (Array.isArray(data.files)) {
          setDriveFiles(data.files);
        }
      } catch {
        setDriveFiles([]);
      } finally {
        setDriveLoading(false);
      }
    }
  }

  function handleLaunchTakeoffPrompt() {
    const jobName = bid.projectName ?? bid.bidVersionId;
    const docList = selectedDocs.length > 0
      ? selectedDocs.join(', ')
      : driveFiles.map(f => f.name).join(', ') || '[No documents listed]';

    const prompt = `Generate a complete takeoff for ${jobName} (${bid.bidVersionId}) using the estimating rules.

Documents available:
${docList}

Output in the standard takeoff tab format:
- One row per system type
- Include: Assembly_ID, System_Type, Qty_SF, Qty_EA, Key_Assumptions, Glass_Spec, Labor_Hours, Benchmark_Status
- Use DLO + bite methodology for all glass calculations
- Flag any missing information as TBD and generate RFI items
- Include Gold Data section at the end`;

    setShowTakeoffTrigger(false);
    setShowChat(true);
    setChatInput(prompt);
  }

  async function handleValidateTakeoff() {
    setValidating(true);
    setValidationResults(null);

    try {
      // Ask Kai to validate the current bid's takeoff against rules
      const validationPrompt = `Validate the takeoff for bid ${bid.bidVersionId} (${bid.projectName ?? 'Unknown job'}).

Check each rule and respond with a JSON array of results (ONLY the JSON, no prose):
[
  {"id": "dlo", "status": "pass|fail|warn|unknown", "note": "brief explanation"},
  {"id": "taxonomy", "status": "pass|fail|warn|unknown", "note": "brief explanation"},
  {"id": "gaps", "status": "pass|fail|warn|unknown", "note": "brief explanation"},
  {"id": "gold", "status": "pass|fail|warn|unknown", "note": "brief explanation"}
]

Rules to check:
1. dlo: Are all glass calculations using DLO+bite method? (not frame opening)
2. taxonomy: Are all system types from the approved taxonomy? (Curtainwall, Window Wall, Storefront, etc.)
3. gaps: Is the Bid Gap Log populated with at least one entry?
4. gold: Is the Gold Data section populated?

For this bid, use the context: ${bid.totalEstimate ? 'Has estimate total: ' + bid.totalEstimate : 'No estimate total yet'}. Status: ${bid.status}.`;

      const res = await fetch('/api/kai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: ESTIMATING_SYSTEM_PROMPT },
            { role: 'user', content: validationPrompt },
          ],
        }),
      });
      const data = await res.json();
      const reply: string = data.reply ?? '';

      // Try to extract JSON from reply
      const jsonMatch = reply.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ id: string; status: string; note?: string }>;
        const results: ValidationResult[] = VALIDATE_RULES.map(rule => {
          const found = parsed.find(p => p.id === rule.id);
          return {
            id: rule.id,
            label: rule.label,
            status: (found?.status ?? 'unknown') as ValidationResult['status'],
            note: found?.note,
          };
        });
        setValidationResults(results);
      } else {
        // Fallback — couldn't parse, show unknown for all
        setValidationResults(VALIDATE_RULES.map(r => ({ ...r, status: 'unknown' as const, note: 'Could not parse response' })));
      }
    } catch {
      setValidationResults(VALIDATE_RULES.map(r => ({ ...r, status: 'unknown' as const, note: 'Validation error' })));
    } finally {
      setValidating(false);
    }
  }

  const statusIcon = (s: ValidationResult['status']) =>
    s === 'pass' ? '✅' : s === 'fail' ? '❌' : s === 'warn' ? '⚠️' : '◯';
  const statusColor = (s: ValidationResult['status']) =>
    s === 'pass' ? '#059669' : s === 'fail' ? '#dc2626' : s === 'warn' ? '#d97706' : '#94a3b8';

  const totalEstimate = bid.totalEstimate
    ? (bid.totalEstimate.startsWith('$') ? bid.totalEstimate : `$${bid.totalEstimate}`)
    : null;

  return (
    <div style={{ padding: '0', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Kai Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #e2e8f0',
        background: 'linear-gradient(135deg, rgba(15,118,110,0.04), rgba(20,184,166,0.02))',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>✦</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Kai</span>
          <span style={{
            marginLeft: 'auto',
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 999,
            background: 'rgba(20,184,166,0.1)',
            color: '#0f766e',
            border: '1px solid rgba(20,184,166,0.2)',
          }}>
            {ctx.title}
          </span>
        </div>
        <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
          {ctx.suggestion}
        </p>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Compliance / Validate Takeoff */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>
              Compliance
            </div>
            <button
              onClick={handleValidateTakeoff}
              disabled={validating}
              style={{
                fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                border: '1px solid rgba(20,184,166,0.3)',
                background: validating ? '#f1f5f9' : 'rgba(240,253,250,0.8)',
                color: validating ? '#94a3b8' : '#0f766e',
                cursor: validating ? 'default' : 'pointer',
              }}
            >
              {validating ? 'Checking…' : 'Validate Takeoff'}
            </button>
          </div>

          {validationResults ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {validationResults.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 7,
                  padding: '7px 10px', borderRadius: 8,
                  background: 'rgba(248,250,252,0.8)',
                  border: `1px solid ${r.status === 'pass' ? 'rgba(5,150,105,0.15)' : r.status === 'fail' ? 'rgba(220,38,38,0.15)' : '#e2e8f0'}`,
                }}>
                  <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}>{statusIcon(r.status)}</span>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: statusColor(r.status) }}>{r.label}</div>
                    {r.note && <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>{r.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 10,
              background: 'rgba(248,250,252,0.8)', border: '1px solid #e2e8f0',
            }}>
              <span style={{ fontSize: 16 }}>◯</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Not assessed</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Click "Validate Takeoff" to check</div>
              </div>
            </div>
          )}
        </div>

        {/* Ask Kai Chat */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>
              Ask Kai
            </div>
            <button
              onClick={() => setShowChat(v => !v)}
              style={{
                fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                border: '1px solid rgba(20,184,166,0.3)',
                background: showChat ? 'rgba(20,184,166,0.12)' : 'rgba(240,253,250,0.8)',
                color: '#0f766e', cursor: 'pointer',
              }}
            >
              {showChat ? 'Close' : 'Open Chat'}
            </button>
          </div>

          {showChat && (
            <div>
              {/* Chat history */}
              <div style={{
                maxHeight: 240, overflowY: 'auto', marginBottom: 8,
                border: '1px solid #e2e8f0', borderRadius: 10,
                background: '#f8fafc', padding: '8px',
              }}>
                {chatMessages.length === 0 ? (
                  <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>
                    Ask about DLO calcs, system taxonomy, bid gaps, or any estimating question for this bid.
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} style={{
                      marginBottom: 8,
                      display: 'flex',
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                      gap: 6,
                    }}>
                      <div style={{
                        maxWidth: '80%',
                        padding: '7px 10px',
                        borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        background: msg.role === 'user' ? '#0f766e' : 'white',
                        color: msg.role === 'user' ? 'white' : '#0f172a',
                        fontSize: 11, lineHeight: 1.5,
                        border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div style={{ fontSize: 10, color: '#94a3b8', padding: '4px 8px' }}>Kai is thinking…</div>
                )}
                <div ref={chatEndRef} />
              </div>
              {/* Input */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                  placeholder={`Ask about ${bid.bidVersionId}…`}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 9, fontSize: 11,
                    border: '1px solid rgba(20,184,166,0.4)',
                    background: 'rgba(240,253,250,0.5)', outline: 'none', color: '#0f172a',
                  }}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{
                    padding: '8px 12px', borderRadius: 9, border: 'none',
                    background: chatInput.trim() && !chatLoading ? '#0f766e' : '#e2e8f0',
                    color: 'white', fontSize: 11, fontWeight: 700,
                    cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'default',
                    flexShrink: 0,
                  }}
                >↑</button>
              </div>
            </div>
          )}
        </div>

        {/* GPT Estimating Rules */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>
              Estimating Rules
            </div>
            <button
              onClick={() => setShowInstructions(v => !v)}
              style={{
                fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                border: '1px solid #e2e8f0',
                background: showInstructions ? '#f1f5f9' : 'white',
                color: '#64748b', cursor: 'pointer',
              }}
            >
              {showInstructions ? 'Hide' : 'View Rules'}
            </button>
          </div>

          {showInstructions && (
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
              padding: '10px 12px', maxHeight: 220, overflowY: 'auto',
            }}>
              {/* Key rules summary */}
              {[
                { icon: '🔢', title: 'Glass Calc', body: 'Glass W/H = DLO + (2 × Bite). Never use frame opening. Always show DLO and bite assumption.' },
                { icon: '📋', title: 'System Taxonomy', body: 'Curtainwall · Window Wall · Storefront · Interior Storefront · Interior Doors · Exterior Doors · Railing · Skylights · Trellis · Auto Entrances · Metal Screen Walls · ACM · Aluminum Panels · Door Openers · Louvers' },
                { icon: '⚠️', title: 'Bid Gap Log', body: 'Every ambiguity, scope boundary, quote omission, testing requirement, waterproofing interface, or access issue must be logged. Do not guess.' },
                { icon: '🏅', title: 'Gold Data', body: 'Mandatory on every takeoff. One row per System_Type + Assembly_ID. Benchmark_Status: Stable / Elevated Risk / Outlier / NA.' },
                { icon: '👷', title: 'Labor / Hospitality', body: 'For occupied/hospitality jobs: use Base_Hours + friction factors (access, room release, punch returns, hoisting, travel, premium time).' },
                { icon: '🛡️', title: 'Risk Posture', body: 'Never silently accept warranty liability for waterproofing/firestopping interfaces. Flag in Bid Gap Log. Use HARD / ALLOWANCE / TBD and IN / OUT / AMBIGUOUS.' },
              ].map(rule => (
                <div key={rule.title} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>
                    {rule.icon} {rule.title}
                  </div>
                  <div style={{ fontSize: 10, color: '#475569', lineHeight: 1.5 }}>{rule.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trigger Takeoff */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
            Takeoff Trigger
          </div>
          <button
            onClick={handleTriggerTakeoff}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1px solid rgba(20,184,166,0.4)',
              background: 'linear-gradient(135deg, rgba(15,118,110,0.08), rgba(20,184,166,0.05))',
              color: '#0f766e', fontSize: 12, fontWeight: 800,
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(20,184,166,0.14)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(15,118,110,0.08), rgba(20,184,166,0.05))'; }}
          >
            <span style={{ fontSize: 16 }}>📄</span>
            <div>
              <div>Generate Takeoff from Documents</div>
              <div style={{ fontSize: 9, fontWeight: 500, color: '#64748b', marginTop: 1 }}>Select docs → AI generates structured takeoff</div>
            </div>
          </button>

          {/* Takeoff Trigger Modal */}
          {showTakeoffTrigger && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            }} onClick={() => setShowTakeoffTrigger(false)}>
              <div style={{
                background: 'white', borderRadius: 16, padding: 24,
                width: '100%', maxWidth: 520, maxHeight: '80vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
              }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>📄 Generate Takeoff from Documents</div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 16 }}>
                  {bid.projectName} · {bid.bidVersionId}
                </div>

                {driveLoading ? (
                  <div style={{ fontSize: 12, color: '#94a3b8', padding: '24px 0', textAlign: 'center' }}>Loading documents from Drive…</div>
                ) : driveFiles.length > 0 ? (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                      Select documents to include ({selectedDocs.length > 0 ? selectedDocs.length + ' selected' : 'all will be used if none selected'}):
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, marginBottom: 16 }}>
                      {driveFiles.map(f => (
                        <label key={f.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 8px', borderRadius: 8,
                          cursor: 'pointer',
                          background: selectedDocs.includes(f.name) ? 'rgba(20,184,166,0.08)' : 'transparent',
                        }}>
                          <input
                            type="checkbox"
                            checked={selectedDocs.includes(f.name)}
                            onChange={e => {
                              if (e.target.checked) setSelectedDocs(prev => [...prev, f.name]);
                              else setSelectedDocs(prev => prev.filter(n => n !== f.name));
                            }}
                            style={{ accentColor: '#0f766e' }}
                          />
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>{f.name}</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              {f.folder && (
                                <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>📁 {f.folder}</span>
                              )}
                              {f.webViewLink && (
                                <a href={f.webViewLink} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize: 9, color: '#2563eb', textDecoration: 'none' }}
                                  onClick={e => e.stopPropagation()}>
                                  View ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{
                    padding: '16px', borderRadius: 10, background: '#f8fafc',
                    border: '1px solid #e2e8f0', marginBottom: 16, textAlign: 'center',
                  }}>
                    {bid.bidFolderUrl ? (
                      <>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                          Could not load documents from Drive folder. The service account may not have access.
                        </div>
                        <a href={bid.bidFolderUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                          Open Folder ↗
                        </a>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        No Drive folder linked. Link a folder first to load documents.
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
                  <button
                    onClick={() => setShowTakeoffTrigger(false)}
                    style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >Cancel</button>
                  <button
                    onClick={handleLaunchTakeoffPrompt}
                    style={{
                      padding: '8px 20px', borderRadius: 9, border: 'none',
                      background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >⚡ Generate Takeoff →</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {/* Drop Zone for document uploads */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
            Upload Documents
          </div>
          <input
            ref={dropInputRef}
            type="file"
            multiple
            accept=".pdf,.dwg,.png,.jpg,.jpeg,.tiff,.tif,.docx,.doc,.xls,.xlsx,.txt"
            style={{ display: 'none' }}
            onChange={e => handleFileUpload(e.target.files)}
          />
          <div
            onClick={() => dropInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
            style={{
              padding: '16px 12px',
              borderRadius: 10,
              border: `2px dashed ${dragOver ? '#0f766e' : 'rgba(20,184,166,0.3)'}`,
              background: dragOver ? 'rgba(20,184,166,0.08)' : 'rgba(240,253,250,0.4)',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>📄</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0f766e' }}>
              {uploading ? `Uploading ${uploading}…` : 'Drop files or click to upload'}
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
              Plans, specs, quotes, submittals — Kai auto-sorts into the right folder
            </div>
          </div>
          {uploadResults.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {uploadResults.map((r, i) => (
                <div key={i} style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✓ {r.name}
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}>→ {r.folder}</span>
                  {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: 9 }}>View ↗</a>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {ctx.actions && ctx.actions.length > 0 && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
              Quick Actions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ctx.actions.map((action) => (
                <button
                  key={action}
                  onClick={() => {
                    if (action === 'Validate Takeoff') {
                      handleValidateTakeoff();
                    } else if (action === 'Generate Takeoff') {
                      setShowChat(true);
                      setChatInput(`Generate a full takeoff for ${bid.bidVersionId} — ${bid.projectName ?? 'this job'}`);
                    } else if (action === 'Generate Estimate') {
                      setShowChat(true);
                      setChatInput(`Generate a full estimate for ${bid.bidVersionId} — ${bid.projectName ?? 'this job'}`);
                    } else if (action === 'Sync from Estimate') {
                      setShowChat(true);
                      setChatInput(`Sync the Simple Estimate for ${bid.bidVersionId} from the detailed estimate data`);
                    } else if (action === 'Export PDF') {
                      window.print();
                    } else if (action === 'Parse Quote PDF') {
                      setShowChat(true);
                      setChatInput(`Parse uploaded vendor quote PDFs for ${bid.bidVersionId} into the coverage matrix`);
                    } else if (action === 'Auto-populate Gaps') {
                      setShowChat(true);
                      setChatInput(`Analyze the takeoff and specs for ${bid.bidVersionId} and auto-populate the Bid Gap Log with scope gaps, ambiguities, and risk items`);
                    } else if (action === 'Generate Proposal') {
                      setShowChat(true);
                      setChatInput(`Generate the customer proposal for ${bid.bidVersionId} — ${bid.projectName ?? 'this job'} with pricing table, exclusions, and qualifications`);
                    } else if (action === 'Generate Estimate PDF') {
                      setShowChat(true);
                      setChatInput(`Generate the Carl's Method PDF for ${bid.bidVersionId} — ${bid.projectName ?? 'this job'}`);
                    }
                  }}
                  style={{
                    padding: '8px 12px', borderRadius: 9,
                    border: '1px solid rgba(20,184,166,0.25)',
                    background: 'rgba(240,253,250,0.6)',
                    color: '#0f766e', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(20,184,166,0.12)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(240,253,250,0.6)'; }}
                >
                  <span style={{ opacity: 0.6, fontSize: 12 }}>⚡</span>
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
            Linked Documents
          </div>
          {bid.bidFolderUrl ? (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(240,253,250,0.6)',
              border: '1px solid rgba(20,184,166,0.25)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#0f766e' }}>✓ BID FOLDER</div>
                <button
                  onClick={() => { setFolderUrl(bid.bidFolderUrl ?? ''); setShowLinkModal(true); }}
                  style={{ background: 'none', border: 'none', fontSize: 10, color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                >change</button>
              </div>
              <a
                href={bid.bidFolderUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: '#2563eb', fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span>🔗</span>Open Folder ↗
              </a>
            </div>
          ) : (
            <div style={{ padding: '12px', borderRadius: 10, background: '#f8fafc', border: '1px dashed #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>No folder linked</div>
              <button
                onClick={() => { setFolderUrl(''); setShowLinkModal(true); }}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(20,184,166,0.3)', background: 'rgba(240,253,250,0.8)', color: '#0f766e', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >🔗 Link Folder</button>
            </div>
          )}

          {showLinkModal && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            }} onClick={() => setShowLinkModal(false)}>
              <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(15,23,42,0.2)' }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Link Bid Folder</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Paste the Google Drive folder URL for this bid.</div>
                <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(37,99,235,0.3)', background: 'rgba(239,246,255,0.7)', color: '#1d4ed8', fontSize: 11, fontWeight: 700, textDecoration: 'none', marginBottom: 12 }}>
                  🗂️ Browse Google Drive →
                  <span style={{ fontSize: 10, fontWeight: 500, color: '#60a5fa', marginLeft: 4 }}>copy the folder URL, paste below</span>
                </a>
                <input
                  type="text" value={folderUrl} onChange={e => setFolderUrl(e.target.value)}
                  placeholder="Paste URL or folder ID..." autoFocus
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(20,184,166,0.4)', borderRadius: 9, fontSize: 12, color: '#0f172a', background: 'rgba(240,253,250,0.5)', outline: 'none', boxSizing: 'border-box', marginBottom: 6 }}
                />
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 14 }}>Full URLs or bare folder IDs both work.</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowLinkModal(false)} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleLinkFolder} disabled={folderSaving || !folderUrl.trim()} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: folderUrl.trim() ? '#0f766e' : '#e2e8f0', color: 'white', fontSize: 12, fontWeight: 700, cursor: folderUrl.trim() ? 'pointer' : 'default' }}>
                    {folderSaving ? 'Saving…' : 'Link Folder'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bid Summary */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
            This Bid
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Version', value: bid.bidVersionId },
              { label: 'Status', value: bid.status },
              { label: 'Total', value: totalEstimate ?? '—' },
              { label: 'Island', value: bid.island ?? '—' },
              { label: 'Estimator', value: bid.estimator ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 11, color: '#374151', fontWeight: 600, textAlign: 'right', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>{/* end scrollable */}
    </div>
  );
}
