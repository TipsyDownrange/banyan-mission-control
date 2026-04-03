/**
 * Construction Schedule Export PDF
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { S, C, Letterhead, SectionHead, DocFooter, renderToPDF } from './pdf-templates';

export type ScheduleTask = {
  phase: string;            // "Submittal" | "Procurement" | "Construction" | "Closeout"
  task_name: string;
  assigned_to?: string;
  men?: number;
  duration_days?: number;
  start_date: string;
  end_date: string;
  pct_complete: number;     // 0-100
  at_risk?: boolean;
  predecessors?: string;
  notes?: string;
};

export type ScheduleData = {
  project_name: string;
  kID: string;
  pm_name: string;
  superintendent?: string;
  as_of_date: string;
  tasks: ScheduleTask[];
  notes?: string;
};

const PHASE_COLOR: Record<string, string> = {
  'Submittal':    C.blue,
  'Procurement':  '#7c3aed',
  'Construction': C.navy,
  'Closeout':     '#16a34a',
};

function SchedulePDF({ data }: { data: ScheduleData }) {
  const phases = ['Submittal', 'Procurement', 'Construction', 'Closeout'];
  const byPhase = phases.reduce((acc, p) => {
    acc[p] = data.tasks.filter(t => t.phase === p);
    return acc;
  }, {} as Record<string, ScheduleTask[]>);

  const overallPct = data.tasks.length
    ? Math.round(data.tasks.reduce((s, t) => s + t.pct_complete, 0) / data.tasks.length)
    : 0;

  return (
    <Document>
      <Page size="LETTER" style={{ ...S.page, fontSize: 8.5 }} orientation="landscape">
        <Letterhead docNumber={`Schedule — ${data.kID}`} date={data.as_of_date} />

        <View style={[S.docTitleRow, { marginBottom: 12 }]}>
          <Text style={S.docTitle}>Construction Schedule</Text>
          <Text style={S.docMeta}>As of {data.as_of_date}</Text>
        </View>

        {/* Header block */}
        <View style={{ border: `1.5 solid ${C.orange}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
          <View style={{ padding: '8 12', backgroundColor: C.bg, flexDirection: 'row', flexWrap: 'wrap' }}>
            {[
              ['Project',    data.project_name],
              ['kID',        data.kID],
              ['PM',         data.pm_name],
              ['Super',      data.superintendent || '—'],
              ['As of Date', data.as_of_date],
              ['Overall',    `${overallPct}% Complete`],
            ].map(([label, value]) => (
              <View key={label} style={{ width: '33%', flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5, paddingRight: 10 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.slateLight, textTransform: 'uppercase', letterSpacing: 0.5, width: 60, paddingTop: 1 }}>{label}</Text>
                <Text style={{ fontSize: 9, color: label === 'Overall' ? C.navy : C.text, fontFamily: label === 'Overall' ? 'Helvetica-Bold' : 'Helvetica', flex: 1 }}>{value}</Text>
              </View>
            ))}
          </View>
          {/* Progress bar */}
          <View style={{ backgroundColor: C.orangeBg, borderTop: `1 solid ${C.orangeBorder}`, padding: '6 12' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.orange, width: 100 }}>Overall Progress</Text>
              <View style={{ flex: 1, height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden', marginRight: 10 }}>
                <View style={{ width: `${overallPct}%`, height: 8, backgroundColor: C.navy, borderRadius: 4 }} />
              </View>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy, width: 36, textAlign: 'right' }}>{overallPct}%</Text>
            </View>
          </View>
        </View>

        {/* Tasks by phase */}
        {phases.filter(p => byPhase[p]?.length > 0).map(phase => (
          <View key={phase}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 5 }}>
              <View style={{ width: 4, height: 14, backgroundColor: PHASE_COLOR[phase] || C.navy, borderRadius: 2, marginRight: 8 }} />
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: PHASE_COLOR[phase] || C.navy, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {phase}
              </Text>
              <Text style={{ fontSize: 8, color: C.slateLight, marginLeft: 8 }}>({byPhase[phase].length} tasks)</Text>
            </View>
            <View style={{ borderRadius: 8, overflow: 'hidden', border: `1 solid ${C.border}`, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', backgroundColor: C.navy, padding: '4 8' }}>
                {[['Task', 2.5], ['Assigned', 1], ['Men', 0.3], ['Start', 0.7], ['End', 0.7], ['Days', 0.35], ['% Done', 0.45], ['Status', 0.6]].map(([label, flex]) => (
                  <Text key={String(label)} style={{ flex: flex as number, fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.white, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: typeof flex === 'number' && flex < 1 ? 'center' : 'left' }}>
                    {String(label)}
                  </Text>
                ))}
              </View>
              {byPhase[phase].map((task, i) => (
                <View key={i} style={{ flexDirection: 'row', padding: '4 8', backgroundColor: task.at_risk ? '#fff7ed' : i % 2 === 1 ? C.bg : C.white, borderTop: `0.5 solid ${C.border}`, alignItems: 'center' }}>
                  <Text style={{ flex: 2.5, fontSize: 8.5, color: C.text, lineHeight: 1.3 }}>{task.task_name}{task.at_risk ? ' ⚠' : ''}</Text>
                  <Text style={{ flex: 1, fontSize: 8, color: C.subtext }}>{task.assigned_to || '—'}</Text>
                  <Text style={{ flex: 0.3, fontSize: 8.5, color: C.text, textAlign: 'center' }}>{task.men || '—'}</Text>
                  <Text style={{ flex: 0.7, fontSize: 8, color: C.subtext }}>{task.start_date}</Text>
                  <Text style={{ flex: 0.7, fontSize: 8, color: C.subtext }}>{task.end_date}</Text>
                  <Text style={{ flex: 0.35, fontSize: 8, color: C.subtext, textAlign: 'center' }}>{task.duration_days || '—'}</Text>
                  <View style={{ flex: 0.45, alignItems: 'center' }}>
                    <View style={{ width: 30, height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ width: `${task.pct_complete}%`, height: 5, backgroundColor: task.pct_complete === 100 ? '#16a34a' : C.blue, borderRadius: 3 }} />
                    </View>
                    <Text style={{ fontSize: 7, color: C.slateLight, marginTop: 1, textAlign: 'center' }}>{task.pct_complete}%</Text>
                  </View>
                  <Text style={{ flex: 0.6, fontSize: 7.5, color: task.at_risk ? C.orange : task.pct_complete === 100 ? '#16a34a' : C.slateLight, fontFamily: task.at_risk ? 'Helvetica-Bold' : 'Helvetica' }}>
                    {task.pct_complete === 100 ? 'Complete' : task.at_risk ? 'At Risk' : 'In Progress'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {data.notes && (
          <View style={{ marginTop: 8, padding: '6 10', backgroundColor: C.bg, borderRadius: 6, border: `0.5 solid ${C.border}` }}>
            <Text style={{ fontSize: 8, color: C.subtext }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Notes: </Text>{data.notes}</Text>
          </View>
        )}

        <DocFooter docNumber={`Schedule — ${data.kID}`} kID={data.kID} />
      </Page>
    </Document>
  );
}

export async function generateSchedulePDF(data: ScheduleData): Promise<Buffer> {
  return renderToPDF(<SchedulePDF data={data} />);
}
