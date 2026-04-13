import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { S, C, Letterhead, SectionHead, InfoGrid, DocFooter, renderToPDF } from './pdf-templates';

// ── Data Interface ────────────────────────────────────────────────────────────

export type DailyReportPDFData = {
  // Identity
  event_id: string;
  kid: string;
  project_name: string;
  report_date: string;       // ISO date e.g. "2026-04-12"
  submitted_at: string;      // ISO timestamp
  submitted_by: string;      // resolved display name
  submitted_by_role: string; // Foreman | Superintendent | Journeyman | etc.
  island: string;
  superintendent: string;

  // Weather
  weather: {
    temp_f?: number;
    wind_direction?: string;
    wind_speed_mph?: number;
    conditions?: string;   // Sunny | Partly Cloudy | Overcast | Rain | etc.
    rain?: string;         // None | Light | Moderate | Heavy
    raw?: string;          // raw string from API/manual entry
    auto_filled?: boolean;
  };

  // Manpower
  crew: {
    name: string;
    classification: string;
    hours: number;
    notes?: string;
  }[];
  total_crew: number;
  total_hours: number;
  manpower_prefilled?: boolean;

  // Work narrative
  work_performed: string;

  // Delays (optional)
  delays?: {
    delay_type: string;
    duration_hours?: number;
    description: string;
    caused_by?: string;
  }[];

  // Materials received (optional)
  materials_received?: {
    item: string;
    supplier?: string;
    condition?: string;
    notes?: string;
  }[];

  // Photos (optional)
  photos?: {
    filename: string;
    timestamp: string;
    drive_url: string;
    caption?: string;
  }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHST(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'Pacific/Honolulu',
    }) + ' HST';
  } catch { return iso; }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return iso; }
}

function docNumber(data: DailyReportPDFData): string {
  const yy = data.report_date.slice(2, 4);
  const mm = data.report_date.slice(5, 7);
  const dd = data.report_date.slice(8, 10);
  return `DR-${yy}${mm}${dd}-${data.kid}`;
}

// Shared table styles (mirrors Field Issue)
const T = {
  table:     { marginTop: 4, marginBottom: 8 },
  head:      { flexDirection: 'row' as const, backgroundColor: C.bg, borderBottom: `1 solid ${C.border}`, paddingVertical: 4, paddingHorizontal: 6 },
  headCell:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.slate, textTransform: 'uppercase' as const, letterSpacing: 0.3 },
  row:       { flexDirection: 'row' as const, borderBottom: `0.5 solid ${C.border}`, paddingVertical: 5, paddingHorizontal: 6 },
  rowAlt:    { flexDirection: 'row' as const, borderBottom: `0.5 solid ${C.border}`, paddingVertical: 5, paddingHorizontal: 6, backgroundColor: C.bg },
  cell:      { fontSize: 8.5, color: C.text, fontFamily: 'Helvetica' },
  cellMuted: { fontSize: 8.5, color: C.slate, fontFamily: 'Helvetica' },
  cellBold:  { fontSize: 8.5, color: C.text, fontFamily: 'Helvetica-Bold' },
  summaryRow:{ flexDirection: 'row' as const, paddingVertical: 5, paddingHorizontal: 6, backgroundColor: C.bg, borderTop: `1 solid ${C.border}` },
};

// ── PDF Component ─────────────────────────────────────────────────────────────

function DailyReportPDF({ data }: { data: DailyReportPDFData }) {
  const docNum = docNumber(data);
  const hasDelays = (data.delays || []).length > 0;
  const hasMaterials = (data.materials_received || []).length > 0;
  const hasPhotos = (data.photos || []).length > 0;

  // Parse weather from raw string if structured fields missing
  const weatherDisplay = data.weather.raw ||
    [
      data.weather.temp_f ? `${data.weather.temp_f}°F` : null,
      data.weather.wind_direction && data.weather.wind_speed_mph
        ? `${data.weather.wind_direction} ${data.weather.wind_speed_mph} mph`
        : null,
      data.weather.conditions,
      data.weather.rain && data.weather.rain !== 'None' ? `Rain: ${data.weather.rain}` : null,
    ].filter(Boolean).join('  ·  ') || 'Not reported';

  return (
    <Document>
      <Page size="LETTER" style={S.page}>

        {/* ── Letterhead ── */}
        <Letterhead docNumber={docNum} date={fmtDate(data.report_date)} />

        {/* ── Title ── */}
        <View style={S.docTitleRow}>
          <Text style={S.docTitle}>Daily Report</Text>
        </View>
        <Text style={{ ...S.bodyMuted, marginBottom: 16 }}>{fmtDate(data.report_date)}</Text>

        {/* ── Info Grid ── */}
        <InfoGrid items={[
          ['Project',        data.project_name],
          ['kID',            data.kid, true],
          ['Submitted By',   data.submitted_by],
          ['Role',           data.submitted_by_role || 'Field Crew'],
          ['Island',         data.island || '—'],
          ['Superintendent', data.superintendent || '—'],
        ]} />

        {/* ── Weather ── */}
        <SectionHead title="Weather Conditions" />
        <View style={{ ...T.table }}>
          <View style={{ flexDirection: 'row', gap: 8, backgroundColor: C.bg, border: `1 solid ${C.border}`, borderRadius: 4, padding: 10, marginBottom: 4 }}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica', color: C.text, flex: 1 }}>
              {weatherDisplay}
            </Text>
          </View>
          {data.weather.auto_filled && (
            <Text style={{ fontSize: 7.5, color: C.slateLight, fontFamily: 'Helvetica', marginTop: 2 }}>
              Auto-filled from weather API
            </Text>
          )}
        </View>

        {/* ── Manpower ── */}
        <SectionHead title="Manpower" />
        <View style={T.table}>
          <View style={T.head}>
            <Text style={{ ...T.headCell, flex: 3 }}>Name</Text>
            <Text style={{ ...T.headCell, flex: 3 }}>Classification</Text>
            <Text style={{ ...T.headCell, flex: 1, textAlign: 'right' as const }}>Hours</Text>
            <Text style={{ ...T.headCell, flex: 3 }}>Notes</Text>
          </View>
          {(data.crew || []).length > 0 ? (data.crew || []).map((c, i) => (
            <View key={i} style={i % 2 === 0 ? T.row : T.rowAlt}>
              <Text style={{ ...T.cellBold, flex: 3 }}>{c.name}</Text>
              <Text style={{ ...T.cell, flex: 3 }}>{c.classification}</Text>
              <Text style={{ ...T.cellBold, flex: 1, textAlign: 'right' as const }}>{c.hours}</Text>
              <Text style={{ ...T.cellMuted, flex: 3 }}>{c.notes || '—'}</Text>
            </View>
          )) : (
            <View style={T.row}>
              <Text style={{ ...T.cellMuted, flex: 1 }}>Manpower count: {data.total_crew || 0}</Text>
            </View>
          )}
          {/* Summary row */}
          <View style={T.summaryRow}>
            <Text style={{ ...T.headCell, flex: 3 }}> </Text>
            <Text style={{ ...T.headCell, flex: 3 }}>Total Crew: {data.total_crew}</Text>
            <Text style={{ ...T.headCell, flex: 1, textAlign: 'right' as const }}> </Text>
            <Text style={{ ...T.headCell, flex: 3 }}>Total Hours: {data.total_hours}</Text>
          </View>
        </View>
        {data.manpower_prefilled && (
          <Text style={{ fontSize: 7.5, color: C.slateLight, fontFamily: 'Helvetica', marginTop: -4, marginBottom: 8 }}>
            Pre-filled from dispatch schedule
          </Text>
        )}

        {/* ── Work Performed ── */}
        <SectionHead title="Work Performed" />
        <View style={{ backgroundColor: C.bg, border: `1 solid ${C.border}`, borderRadius: 4, padding: 10, marginBottom: 12 }}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica', color: C.text, lineHeight: 1.6 }}>
            {data.work_performed || 'No work description provided.'}
          </Text>
        </View>

        {/* ── Delays (conditional) ── */}
        {hasDelays && <>
          <SectionHead title="Delays Reported" />
          <View style={T.table}>
            <View style={T.head}>
              <Text style={{ ...T.headCell, flex: 2 }}>Delay Type</Text>
              <Text style={{ ...T.headCell, flex: 1 }}>Duration</Text>
              <Text style={{ ...T.headCell, flex: 4 }}>Description</Text>
              <Text style={{ ...T.headCell, flex: 2 }}>Caused By</Text>
            </View>
            {(data.delays || []).map((d, i) => (
              <View key={i} style={i % 2 === 0 ? T.row : T.rowAlt}>
                <Text style={{ ...T.cellBold, flex: 2 }}>{d.delay_type}</Text>
                <Text style={{ ...T.cell, flex: 1 }}>{d.duration_hours != null ? `${d.duration_hours}h` : '—'}</Text>
                <Text style={{ ...T.cell, flex: 4 }}>{d.description}</Text>
                <Text style={{ ...T.cellMuted, flex: 2 }}>{d.caused_by || '—'}</Text>
              </View>
            ))}
          </View>
        </>}

        {/* ── Materials (conditional) ── */}
        {hasMaterials && <>
          <SectionHead title="Materials Received" />
          <View style={T.table}>
            <View style={T.head}>
              <Text style={{ ...T.headCell, flex: 3 }}>Item</Text>
              <Text style={{ ...T.headCell, flex: 2 }}>Supplier</Text>
              <Text style={{ ...T.headCell, flex: 1.5 }}>Condition</Text>
              <Text style={{ ...T.headCell, flex: 3 }}>Notes</Text>
            </View>
            {(data.materials_received || []).map((m, i) => (
              <View key={i} style={i % 2 === 0 ? T.row : T.rowAlt}>
                <Text style={{ ...T.cellBold, flex: 3 }}>{m.item}</Text>
                <Text style={{ ...T.cell, flex: 2 }}>{m.supplier || '—'}</Text>
                <Text style={{ ...T.cell, flex: 1.5 }}>{m.condition || '—'}</Text>
                <Text style={{ ...T.cellMuted, flex: 3 }}>{m.notes || '—'}</Text>
              </View>
            ))}
          </View>
        </>}

        {/* ── Photos (conditional) ── */}
        {hasPhotos && <>
          <SectionHead title={`Photo Evidence — ${data.photos!.length} photo${data.photos!.length !== 1 ? 's' : ''}`} />
          <View style={T.table}>
            <View style={T.head}>
              <Text style={{ ...T.headCell, width: 18 }}>#</Text>
              <Text style={{ ...T.headCell, flex: 3 }}>Filename</Text>
              <Text style={{ ...T.headCell, flex: 2 }}>Captured</Text>
              <Text style={{ ...T.headCell, flex: 4 }}>Drive Link</Text>
            </View>
            {(data.photos || []).map((p, i) => (
              <View key={i} style={i % 2 === 0 ? T.row : T.rowAlt}>
                <Text style={{ ...T.cellMuted, width: 18 }}>{i + 1}</Text>
                <Text style={{ ...T.cell, flex: 3 }}>{p.filename}</Text>
                <Text style={{ ...T.cellMuted, flex: 2 }}>{fmtHST(p.timestamp)}</Text>
                <Text style={{ ...T.cellMuted, flex: 4 }}>{p.drive_url}</Text>
              </View>
            ))}
          </View>
        </>}

        {/* ── Immutable Record Footer ── */}
        <View style={{ position: 'absolute', bottom: 28, left: 40, right: 40 }}>
          <View style={{ borderTop: `0.5 solid ${C.border}`, paddingTop: 6 }}>
            <Text style={{ fontSize: 7, color: C.slateLight, fontFamily: 'Helvetica', textAlign: 'center' as const, marginBottom: 2 }}>
              Immutable record — BanyanOS · Event ID: {data.event_id} · Recorded: {fmtHST(data.submitted_at)} · Source: BANYAN_FIELD_V1
            </Text>
          </View>
          <DocFooter docNumber={docNum} kID={data.kid} />
        </View>

      </Page>
    </Document>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function generateDailyReportPDF(data: DailyReportPDFData): Promise<Buffer> {
  return renderToPDF(<DailyReportPDF data={data} />);
}
