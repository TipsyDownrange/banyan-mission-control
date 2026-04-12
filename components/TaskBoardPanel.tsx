'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

type TaskStatus = 'queued' | 'in_progress' | 'waiting' | 'done' | 'blocked';
type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
type ActionLogEntry = { ts: string; action: string; by: string };

type Task = {
  id: string;
  title: string;
  detail: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  blockedBy?: string;
  parentTaskId?: string;
  phase?: string;
  source?: string;
  sortOrder?: number;
  actionLog?: ActionLogEntry[];
};

const PRIORITY_DOT: Record<string, string> = {
  critical: '#b91c1c', high: '#d97706', medium: '#2563eb', low: '#94a3b8',
};
const STATUS_PILL: Record<string, { color: string; bg: string; label: string }> = {
  queued:      { color: '#64748b', bg: '#f1f5f9', label: 'Queued' },
  in_progress: { color: '#0f766e', bg: '#f0fdfa', label: 'In Progress' },
  waiting:     { color: '#d97706', bg: '#fffbeb', label: 'Waiting' },
  blocked:     { color: '#b91c1c', bg: '#fef2f2', label: 'Blocked' },
  done:        { color: '#15803d', bg: '#f0fdf4', label: 'Done' },
};
const PHASE_ORDER = ['Phase 0','Phase 1','Phase 2','Phase 3','Phase 4','Phase 5','Phase 6','Inbox'];
const SOURCE_ICONS: Record<string,string> = { BUG:'🐛', FEATURE:'💡', QUESTION:'❓', FEEDBACK:'💬' };

function relTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}
function fmtTs(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}

// ── Task Row (list view) ──────────────────────────────────────────────────
function TaskRow({ task, onClick, onDragStart, onDragOver, onDrop }: {
  task: Task; onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const sc = STATUS_PILL[task.status] || STATUS_PILL.queued;
  const dotColor = PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium;
  const feedbackType = task.title.match(/^\[(\w+)\]/)?.[1] || '';
  const icon = task.source === 'feedback' ? (SOURCE_ICONS[feedbackType] || '💬') : null;

  return (
    <div
      draggable={task.source !== 'feedback'}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
        borderRadius:8, background:'white', border:'1px solid #f1f5f9',
        cursor:'pointer', userSelect:'none',
        transition:'box-shadow 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow='0 2px 8px rgba(15,23,42,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow='none')}
    >
      {/* Priority dot or feedback icon */}
      {icon
        ? <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
        : <div style={{width:8,height:8,borderRadius:'50%',background:dotColor,flexShrink:0}}/>
      }
      {/* Title */}
      <div style={{flex:1,fontSize:13,fontWeight:600,color:'#0f172a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        {task.title}
      </div>
      {/* Assigned */}
      {task.assignedTo && (
        <span style={{fontSize:11,color:'#94a3b8',flexShrink:0}}>→ {task.assignedTo}</span>
      )}
      {/* Status pill */}
      <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999,background:sc.bg,color:sc.color,flexShrink:0,textTransform:'uppercase',letterSpacing:'0.05em'}}>
        {sc.label}
      </span>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────
function DetailPanel({ task, onClose, onUpdate }: {
  task: Task; onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (id: string, fields: Record<string,any>) => Promise<void>;
}) {
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDetail, setEditDetail] = useState(task.detail);
  const [editPhase, setEditPhase] = useState(task.phase || '');
  const [editPriority, setEditPriority] = useState(task.priority);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [promotingPhase, setPromotingPhase] = useState('');
  const [showPromote, setShowPromote] = useState(false);
  const [saving, setSaving] = useState(false);

  const sc = STATUS_PILL[task.status] || STATUS_PILL.queued;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function save(fields: Record<string,any>) {
    setSaving(true);
    await onUpdate(task.id, fields);
    setSaving(false);
  }

  async function addNote() {
    if (!noteText.trim()) return;
    const existing = task.actionLog || [];
    const updated = [...existing, { ts: new Date().toISOString(), action: `note: "${noteText.trim()}"`, by: 'Sean' }];
    await save({ actionLog: JSON.stringify(updated) });
    setNoteText(''); setAddingNote(false);
  }

  const statusFlow = [
    { key:'queued', label:'Queued' },
    { key:'in_progress', label:'In Progress' },
    { key:'done', label:'Done' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.3)',zIndex:500}}/>
      {/* Panel */}
      <div style={{
        position:'fixed',top:0,right:0,bottom:0,zIndex:501,
        width:'min(480px,100vw)',background:'white',
        boxShadow:'-4px 0 24px rgba(15,23,42,0.12)',
        display:'flex',flexDirection:'column',
        animation:'slideIn 200ms ease-out',
      }}>
        <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* Header */}
        <div style={{padding:'16px 20px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:20,padding:0,lineHeight:1}}>←</button>
          <div style={{flex:1,fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{task.phase || 'Unassigned'} · {task.category}</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:18,padding:0,lineHeight:1}}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{flex:1,overflowY:'auto',padding:'20px'}}>

          {/* Title */}
          <input value={editTitle} onChange={e=>setEditTitle(e.target.value)}
            onBlur={()=>editTitle!==task.title&&save({title:editTitle})}
            style={{width:'100%',fontSize:18,fontWeight:800,color:'#0f172a',border:'none',outline:'none',background:'transparent',marginBottom:8,padding:0,boxSizing:'border-box'}}
          />
          <div style={{fontSize:11,color:'#94a3b8',marginBottom:16}}>Created {fmtTs(task.createdAt)} · Updated {relTime(task.updatedAt)}</div>

          {/* Status stepper */}
          <div style={{background:'#f8fafc',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
            <div style={{display:'flex',gap:6,marginBottom:10}}>
              {statusFlow.map((s,i) => {
                const isActive = task.status === s.key || (s.key==='in_progress' && (task.status==='in_progress'||task.status==='waiting'||task.status==='blocked'));
                const isDone = task.status==='done';
                return (
                  <button key={s.key} onClick={()=>task.status!==s.key&&save({status:s.key as TaskStatus})} disabled={isDone}
                    style={{flex:1,padding:'7px',borderRadius:8,fontSize:11,fontWeight:700,cursor:isDone?'default':'pointer',border:'none',
                      background:task.status===s.key?'#0f766e':isActive&&s.key==='in_progress'?'rgba(15,118,110,0.12)':'#f1f5f9',
                      color:task.status===s.key?'white':'#64748b',transition:'all 0.1s',
                    }}>
                    {i===0?'●':i===1?'→':''} {s.label}
                  </button>
                );
              })}
            </div>
            <div style={{display:'flex',gap:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'#94a3b8',marginBottom:3}}>Priority</div>
                <select value={editPriority} onChange={e=>{setEditPriority(e.target.value as TaskPriority);save({priority:e.target.value as TaskPriority});}}
                  style={{width:'100%',padding:'5px 8px',borderRadius:7,border:'1px solid #e2e8f0',fontSize:12,outline:'none',background:'white',cursor:'pointer'}}>
                  {['critical','high','medium','low'].map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'#94a3b8',marginBottom:3}}>Phase</div>
                <select value={editPhase} onChange={e=>{setEditPhase(e.target.value);save({phase:e.target.value});}}
                  style={{width:'100%',padding:'5px 8px',borderRadius:7,border:'1px solid #e2e8f0',fontSize:12,outline:'none',background:'white',cursor:'pointer'}}>
                  <option value=''>Unassigned</option>
                  {PHASE_ORDER.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Description */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',color:'#94a3b8',marginBottom:6}}>Description</div>
            <div style={{height:1,background:'#f1f5f9',marginBottom:8}}/>
            <textarea value={editDetail} onChange={e=>setEditDetail(e.target.value)}
              onBlur={()=>editDetail!==task.detail&&save({detail:editDetail})}
              style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,lineHeight:1.6,outline:'none',resize:'vertical',minHeight:80,boxSizing:'border-box'}}
            />
          </div>

          {/* Inbox actions */}
          {task.source==='feedback' && task.status!=='done' && (
            <div style={{marginBottom:16,padding:'12px',background:'rgba(254,243,199,0.4)',borderRadius:10,border:'1px solid rgba(217,119,6,0.15)'}}>
              <div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',color:'#92400e',marginBottom:8}}>Inbox Actions</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                <button onClick={()=>setShowPromote(p=>!p)} style={{padding:'6px 12px',borderRadius:7,border:'1px solid rgba(15,118,110,0.3)',background:'#f0fdfa',color:'#0f766e',fontSize:11,fontWeight:700,cursor:'pointer'}}>✅ Promote to Roadmap</button>
                <button onClick={()=>save({status:'done'})} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #fca5a5',background:'#fef2f2',color:'#b91c1c',fontSize:11,fontWeight:700,cursor:'pointer'}}>🗑️ Dismiss</button>
              </div>
              {showPromote && (
                <div style={{display:'flex',gap:6,marginTop:8}}>
                  <select value={promotingPhase} onChange={e=>setPromotingPhase(e.target.value)}
                    style={{flex:1,padding:'6px',borderRadius:7,border:'1px solid #e2e8f0',fontSize:12,outline:'none'}}>
                    <option value=''>Pick phase…</option>
                    {PHASE_ORDER.filter(p=>p!=='Inbox').map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                  {promotingPhase && <button onClick={()=>{save({source:'manual',phase:promotingPhase});setShowPromote(false);}} style={{padding:'6px 14px',borderRadius:7,border:'none',background:'#0f766e',color:'white',fontSize:12,fontWeight:700,cursor:'pointer'}}>Move</button>}
                </div>
              )}
            </div>
          )}

          {/* Action Log */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',color:'#94a3b8',marginBottom:6}}>Action Log</div>
            <div style={{height:1,background:'#f1f5f9',marginBottom:8}}/>
            {(task.actionLog||[]).length === 0 && <div style={{fontSize:12,color:'#cbd5e1'}}>No actions logged yet.</div>}
            {(task.actionLog||[]).map((entry,i) => (
              <div key={i} style={{display:'flex',gap:8,marginBottom:6,fontSize:12}}>
                <span style={{color:'#94a3b8',flexShrink:0,fontFamily:'monospace'}}>{fmtTs(entry.ts)}</span>
                <span style={{color:'#334155'}}>{entry.action}</span>
                {entry.by && <span style={{color:'#94a3b8'}}>— {entry.by}</span>}
              </div>
            ))}
            {addingNote ? (
              <div style={{display:'flex',gap:6,marginTop:8}}>
                <input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder='Add a note…' autoFocus
                  style={{flex:1,padding:'7px 10px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,outline:'none'}}
                  onKeyDown={e=>{if(e.key==='Enter')addNote();if(e.key==='Escape'){setAddingNote(false);setNoteText('');}}}
                />
                <button onClick={addNote} style={{padding:'7px 12px',borderRadius:8,border:'none',background:'#0f766e',color:'white',fontSize:12,fontWeight:700,cursor:'pointer'}}>Add</button>
                <button onClick={()=>{setAddingNote(false);setNoteText('');}} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #e2e8f0',background:'white',color:'#64748b',fontSize:12,cursor:'pointer'}}>Cancel</button>
              </div>
            ) : (
              <button onClick={()=>setAddingNote(true)} style={{marginTop:6,fontSize:11,fontWeight:700,color:'#0369a1',background:'none',border:'none',cursor:'pointer',padding:0}}>+ Add Note</button>
            )}
          </div>
        </div>

        {/* Footer actions */}
        {task.status !== 'done' && (
          <div style={{padding:'12px 20px',borderTop:'1px solid #f1f5f9',display:'flex',gap:8}}>
            {(task.status==='queued'||task.status==='waiting') && (
              <button onClick={()=>save({status:'in_progress'})} disabled={saving}
                style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#0f766e,#14b8a6)',color:'white',fontSize:13,fontWeight:800,cursor:'pointer'}}>
                🚀 Start
              </button>
            )}
            {task.status==='in_progress' && (<>
              <button onClick={()=>save({status:'waiting'})} disabled={saving}
                style={{flex:1,padding:'11px',borderRadius:10,border:'1px solid #e2e8f0',background:'white',color:'#64748b',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                ⏸ Pause
              </button>
              <button onClick={()=>save({status:'done'})} disabled={saving}
                style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'#15803d',color:'white',fontSize:13,fontWeight:800,cursor:'pointer'}}>
                ✓ Complete
              </button>
            </>)}
            {(task.status as string)!=='done' && (
              <button onClick={()=>save({status:'done',detail:task.detail+'\n\n— Dismissed'})} disabled={saving}
                style={{padding:'11px 14px',borderRadius:10,border:'1px solid #fca5a5',background:'#fef2f2',color:'#b91c1c',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                🗑
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function TaskBoardPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'roadmap'|'inbox'|'archive'>('roadmap');
  const [filterPill, setFilterPill] = useState('all');
  const [archiveFilter, setArchiveFilter] = useState('all');
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const [selectedTask, setSelectedTask] = useState<Task|null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [newPhase, setNewPhase] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newCategory, setNewCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const dragItem = useRef<string|null>(null);
  const dragOver = useRef<string|null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.tasks) setTasks(data.tasks);
    } catch(e) { console.error('[TaskBoard]', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => {
    const t = setInterval(fetchTasks, 60000);
    return () => clearInterval(t);
  }, [fetchTasks]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleUpdate(id: string, fields: Record<string,any>) {
    setTasks(prev => prev.map(t => t.id===id ? {...t,...fields} : t));
    if (selectedTask?.id === id) setSelectedTask(prev => prev ? {...prev,...fields} : null);
    await fetch('/api/tasks', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({task_id:id,...fields})})
      .catch(e => console.error('[update]',e));
  }

  async function handleDrop(phase: string) {
    if (!dragItem.current || !dragOver.current || dragItem.current===dragOver.current) return;
    const phaseTasks = tasks.filter(t=>(t.phase||'Unassigned')===phase&&t.status!=='done'&&t.source!=='feedback');
    const from = phaseTasks.findIndex(t=>t.id===dragItem.current);
    const to = phaseTasks.findIndex(t=>t.id===dragOver.current);
    if (from===-1||to===-1) return;
    const reordered = [...phaseTasks];
    const [moved] = reordered.splice(from,1);
    reordered.splice(to,0,moved);
    const newOrder = reordered.map(t=>t.id);
    setTasks(prev => {
      const map = new Map(prev.map(t=>[t.id,t]));
      newOrder.forEach((id,i)=>{ const t=map.get(id); if(t) map.set(id,{...t,sortOrder:i+1}); });
      return [...map.values()];
    });
    await fetch('/api/tasks/reorder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phase,order:newOrder})})
      .catch(e=>console.error('[reorder]',e));
    dragItem.current=null; dragOver.current=null;
  }

  async function createTask() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const now = new Date().toISOString();
    const id = `TSK-${Date.now()}`;
    const task: Task = {id,title:newTitle,detail:newDetail,status:'queued',priority:newPriority as TaskPriority,category:newCategory,assignedTo:'Sean',createdAt:now,updatedAt:now,phase:newPhase,source:'manual',sortOrder:999,actionLog:[{ts:now,action:'created',by:'Sean'}]};
    await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tasks:[task]})}).catch(e=>console.error('[create]',e));
    setTasks(prev=>[...prev,task]);
    setNewTitle('');setNewDetail('');setNewPhase('');setNewCategory('');setNewPriority('medium');setShowNewTask(false);setCreating(false);
  }

  // Derived
  const roadmapTasks = tasks.filter(t=>t.source!=='feedback'&&t.status!=='done');
  const inboxTasks = tasks.filter(t=>(t.source==='feedback'||t.source==='suggestion')&&t.status!=='done');
  const archiveTasks = tasks.filter(t=>t.status==='done');

  const filteredRoadmap = roadmapTasks.filter(t=>{
    if (filterPill==='critical') return t.priority==='critical'||t.priority==='high';
    if (filterPill==='in_progress') return t.status==='in_progress';
    if (filterPill==='waiting') return t.status==='waiting'||t.status==='blocked';
    return true;
  });

  // Phase groups sorted
  const phaseGroups = new Map<string,Task[]>();
  for (const t of filteredRoadmap) {
    const ph = t.phase||'Unassigned';
    if (!phaseGroups.has(ph)) phaseGroups.set(ph,[]);
    phaseGroups.get(ph)!.push(t);
  }
  for (const [,arr] of phaseGroups) arr.sort((a,b)=>(a.sortOrder||999)-(b.sortOrder||999));
  const sortedPhases = [...phaseGroups.keys()].sort((a,b)=>{
    const ai=PHASE_ORDER.indexOf(a),bi=PHASE_ORDER.indexOf(b);
    if(ai===-1&&bi===-1) return a.localeCompare(b);
    if(ai===-1) return 1; if(bi===-1) return -1;
    return ai-bi;
  });

  function phaseProgress(ph:string) {
    const all = tasks.filter(t=>(t.phase||'Unassigned')===ph&&t.source!=='feedback');
    return {total:all.length,done:all.filter(t=>t.status==='done').length};
  }

  const filteredArchive = archiveTasks.filter(t=>{
    if (archiveFilter==='roadmap') return t.source!=='feedback';
    if (archiveFilter==='feedback') return t.source==='feedback';
    return true;
  }).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));

  const INP: React.CSSProperties = {width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,outline:'none',boxSizing:'border-box',background:'white'};

  return (
    <div style={{padding:'24px',maxWidth:860,margin:'0 auto'}}>
      {/* Header */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:'0.16em',textTransform:'uppercase',color:'#94a3b8',marginBottom:4}}>AI Command</div>
        <div style={{fontSize:26,fontWeight:900,color:'#0f172a',letterSpacing:'-0.03em',marginBottom:4}}>Command Center</div>
        <div style={{fontSize:13,color:'#64748b',marginBottom:12}}>{roadmapTasks.length} active · {inboxTasks.length} inbox · {archiveTasks.length} completed</div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setShowNewTask(p=>!p)} style={{padding:'8px 16px',borderRadius:10,background:'linear-gradient(135deg,#0f766e,#14b8a6)',color:'white',border:'none',fontSize:13,fontWeight:700,cursor:'pointer'}}>+ New Task</button>
          <button onClick={fetchTasks} style={{padding:'8px 14px',borderRadius:10,background:'white',border:'1px solid #e2e8f0',color:'#64748b',fontSize:13,fontWeight:700,cursor:'pointer'}}>↻</button>
        </div>
      </div>

      {/* New Task */}
      {showNewTask && (
        <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:16,marginBottom:20,display:'flex',flexDirection:'column',gap:10}}>
          <input style={INP} placeholder='Task title *' value={newTitle} onChange={e=>setNewTitle(e.target.value)} autoFocus />
          <textarea style={{...INP,resize:'none'}} rows={2} placeholder='Detail (optional)' value={newDetail} onChange={e=>setNewDetail(e.target.value)} />
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            <select style={INP} value={newPhase} onChange={e=>setNewPhase(e.target.value)}>
              <option value=''>Phase…</option>
              {PHASE_ORDER.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select style={INP} value={newPriority} onChange={e=>setNewPriority(e.target.value)}>
              {['critical','high','medium','low'].map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <input style={INP} placeholder='Category' value={newCategory} onChange={e=>setNewCategory(e.target.value)} />
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setShowNewTask(false)} style={{flex:1,padding:'9px',borderRadius:10,border:'1px solid #e2e8f0',background:'white',color:'#64748b',fontSize:13,fontWeight:700,cursor:'pointer'}}>Cancel</button>
            <button onClick={createTask} disabled={!newTitle.trim()||creating} style={{flex:2,padding:'9px',borderRadius:10,border:'none',background:'#0f766e',color:'white',fontSize:13,fontWeight:700,cursor:'pointer'}}>{creating?'Creating…':'Create Task'}</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:20,background:'#f1f5f9',borderRadius:12,padding:3}}>
        {([['roadmap','📋 Roadmap',roadmapTasks.length],['inbox','📥 Kai Inbox',inboxTasks.length],['archive','✓ Archive',archiveTasks.length]] as const).map(([k,label,count])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'8px',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer',border:'none',background:tab===k?'#0f766e':'transparent',color:tab===k?'white':'#64748b'}}>
            {label} {count>0&&<span style={{marginLeft:5,padding:'1px 6px',borderRadius:999,background:tab===k?'rgba(255,255,255,0.25)':'#e2e8f0',fontSize:10}}>{count}</span>}
          </button>
        ))}
      </div>

      {loading && <div style={{textAlign:'center',color:'#94a3b8',padding:'40px 0',fontSize:13}}>Loading…</div>}

      {/* ROADMAP */}
      {!loading && tab==='roadmap' && (<>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
          {([['all',`All · ${roadmapTasks.length}`],['critical',`Critical/High · ${roadmapTasks.filter(t=>t.priority==='critical'||t.priority==='high').length}`],['in_progress',`In Progress · ${roadmapTasks.filter(t=>t.status==='in_progress').length}`],['waiting',`Waiting · ${roadmapTasks.filter(t=>t.status==='waiting'||t.status==='blocked').length}`]] as const).map(([k,label])=>(
            <button key={k} onClick={()=>setFilterPill(k)} style={{padding:'4px 12px',borderRadius:999,fontSize:11,fontWeight:700,cursor:'pointer',border:filterPill===k?'1.5px solid #0f766e':'1px solid #e2e8f0',background:filterPill===k?'#f0fdfa':'white',color:filterPill===k?'#0f766e':'#64748b'}}>{label}</button>
          ))}
        </div>
        {sortedPhases.length===0 && <div style={{textAlign:'center',color:'#94a3b8',padding:'40px 0',fontSize:13}}>No tasks yet. Add one to get started.</div>}
        {sortedPhases.map(ph=>{
          const phaseTasks=phaseGroups.get(ph)||[];
          const {total,done}=phaseProgress(ph);
          const pct=total>0?Math.round(done/total*100):0;
          const collapsed=collapsedPhases.has(ph);
          return (
            <div key={ph} style={{marginBottom:20}}>
              <button onClick={()=>setCollapsedPhases(prev=>{const n=new Set(prev);n.has(ph)?n.delete(ph):n.add(ph);return n;})}
                style={{width:'100%',display:'flex',alignItems:'center',gap:8,background:'none',border:'none',cursor:'pointer',padding:'4px 0',textAlign:'left',marginBottom:4}}>
                <span style={{fontSize:10,color:'#334155',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.12em'}}>{collapsed?'▶':'▼'} {ph}</span>
                <span style={{fontSize:11,color:'#94a3b8'}}>{done}/{total}</span>
                <span style={{fontSize:11,color:'#94a3b8',marginLeft:'auto'}}>{phaseTasks.length} showing</span>
              </button>
              <div style={{height:3,background:'#f1f5f9',borderRadius:999,marginBottom:8,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${pct}%`,background:pct===100?'#15803d':'#14b8a6',borderRadius:999}}/>
              </div>
              {!collapsed && (
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {phaseTasks.map(t=>(
                    <TaskRow key={t.id} task={t}
                      onClick={()=>setSelectedTask(t)}
                      onDragStart={()=>{dragItem.current=t.id;}}
                      onDragOver={e=>{e.preventDefault();dragOver.current=t.id;}}
                      onDrop={()=>handleDrop(ph)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </>)}

      {/* INBOX */}
      {!loading && tab==='inbox' && (
        inboxTasks.length===0
          ? <div style={{textAlign:'center',color:'#94a3b8',padding:'60px 0',fontSize:13}}>No new feedback — everything&apos;s been triaged. ✓</div>
          : <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {[...inboxTasks].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).map(t=>(
                <TaskRow key={t.id} task={t} onClick={()=>setSelectedTask(t)} />
              ))}
            </div>
      )}

      {/* ARCHIVE */}
      {!loading && tab==='archive' && (<>
        <div style={{display:'flex',gap:6,marginBottom:16}}>
          {([['all',`All · ${archiveTasks.length}`],['roadmap',`Roadmap · ${archiveTasks.filter(t=>t.source!=='feedback').length}`],['feedback',`Feedback · ${archiveTasks.filter(t=>t.source==='feedback').length}`]] as const).map(([k,label])=>(
            <button key={k} onClick={()=>setArchiveFilter(k)} style={{padding:'4px 12px',borderRadius:999,fontSize:11,fontWeight:700,cursor:'pointer',border:archiveFilter===k?'1.5px solid #0f766e':'1px solid #e2e8f0',background:archiveFilter===k?'#f0fdfa':'white',color:archiveFilter===k?'#0f766e':'#64748b'}}>{label}</button>
          ))}
        </div>
        {filteredArchive.length===0
          ? <div style={{textAlign:'center',color:'#94a3b8',padding:'40px 0',fontSize:13}}>Nothing completed yet.</div>
          : <div style={{display:'flex',flexDirection:'column',gap:4,opacity:0.7}}>
              {filteredArchive.map(t=><TaskRow key={t.id} task={t} onClick={()=>setSelectedTask(t)}/>)}
            </div>
        }
      </>)}

      {/* Detail Panel */}
      {selectedTask && (
        <DetailPanel
          task={tasks.find(t=>t.id===selectedTask.id)||selectedTask}
          onClose={()=>setSelectedTask(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
