import { CREW } from '@/lib/data';

export default function CrewPanel() {
  const management = CREW.filter(c => c.type === 'management');
  const field = CREW.filter(c => c.type === 'field');

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="label-upper text-ink-meta mb-1">People</div>
        <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Crew</h1>
        <p className="text-ink-label text-sm mt-1">{CREW.length} people · Kula Glass</p>
      </div>

      <div className="mb-6">
        <div className="label-upper text-ink-meta mb-3">Office &amp; Management</div>
        <div className="grid grid-cols-3 gap-3">
          {management.map(c => (
            <div key={c.id} className="card px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 font-extrabold text-sm shrink-0">
                {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="text-sm font-bold text-ink-heading">{c.name}</div>
                <div className="text-[11px] text-ink-meta">{c.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="label-upper text-ink-meta mb-3">Field Crew — Oahu</div>
        <div className="grid grid-cols-3 gap-3">
          {field.map(c => (
            <div key={c.id} className="card px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center text-teal-700 font-extrabold text-sm shrink-0">
                {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="text-sm font-bold text-ink-heading">{c.name}</div>
                <div className="text-[11px] text-ink-meta">{c.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
