import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { S, C, Letterhead, SectionHead, InfoGrid, DocFooter, renderToPDF } from './pdf-templates';

// ── Data Interface ────────────────────────────────────────────────────────────

export type DailyReportPDFData = {
  // Identity
  event_id: string;
  kid: string;
  project_name: string;
  report_date: string;         // ISO date "2026-04-13"
  submitted_at: string;        // ISO timestamp
  submitted_by: string;        // resolved display name
  submitted_by_role: string;   // Foreman | Superintendent | Journeyman | etc.
  island: string;
  superintendent: string;

  // Weather
  weather: {
    raw?: string;              // full string e.g. "Sunny, 82°F, NE 12 mph"
    temp_f?: number;
    wind_direction?: string;
    wind_speed_mph?: number;
    conditions?: string;
    rain?: string;
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

  // Delays (optional — omit section when empty)
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
    file_name: string;
    timestamp: string;
    drive_link: string;
    file_id?: string; // Drive fileId for thumbnail embedding
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

function docNumber(data: DailyReportPDFData): string {
  const yy = data.report_date.slice(2, 4);
  const mm = data.report_date.slice(5, 7);
  const dd = data.report_date.slice(8, 10);
  return `DR-${yy}${mm}${dd}-${data.kid}`;
}

// Table header style — matches light treatment in Field Issue tables
const tableHeaderStyle = {
  flexDirection: 'row' as const,
  backgroundColor: C.bg,
  paddingVertical: 4,
  paddingHorizontal: 6,
  borderBottom: `1 solid ${C.border}`,
  marginTop: 4,
};
const tableHeaderCellStyle = {
  fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.slate,
  textTransform: 'uppercase' as const, letterSpacing: 0.3,
};
const tableRowStyle = {
  flexDirection: 'row' as const,
  paddingVertical: 4, paddingHorizontal: 6,
  borderBottom: `0.5 solid ${C.border}`,
};
const tableRowAltStyle = {
  flexDirection: 'row' as const,
  paddingVertical: 4, paddingHorizontal: 6,
  borderBottom: `0.5 solid ${C.border}`,
  backgroundColor: C.bg,
};

// ── PDF Component ─────────────────────────────────────────────────────────────

function DailyReportPDF({ data }: { data: DailyReportPDFData }) {
  const docNum = docNumber(data);
  const hasDelays    = (data.delays || []).length > 0;
  const hasMaterials = (data.materials_received || []).length > 0;
  const hasPhotos    = (data.photos || []).length > 0;

  // Compose weather string from structured fields or raw
  const weatherStr = data.weather.raw ||
    [
      data.weather.temp_f     ? `${data.weather.temp_f}°F`                   : null,
      data.weather.wind_direction && data.weather.wind_speed_mph
        ? `${data.weather.wind_direction} ${data.weather.wind_speed_mph} mph` : null,
      data.weather.conditions,
      data.weather.rain && data.weather.rain !== 'None' ? `Rain: ${data.weather.rain}` : null,
    ].filter(Boolean).join('  ·  ') || 'Not reported';

  return (
    <Document>
      <Page size="LETTER" style={S.page}>

        {/* ── Letterhead — banyan tree icon, company name/address/phone/fax/lic, doc number, teal rule ── */}
        <Letterhead docNumber={docNum} date={fmtHST(data.submitted_at).split(',').slice(0,3).join(',')} />

        {/* ── Title ── */}
        <View style={S.docTitleRow}>
          <Text style={S.docTitle}>Daily Report</Text>
        </View>
        <Text style={{ ...S.bodyMuted, marginBottom: 16 }}>{fmtHST(data.submitted_at)}</Text>

        {/* ── Info Grid — same open layout as Field Issue ── */}
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
        <View style={{ backgroundColor: C.bg, border: `1 solid ${C.border}`, borderRadius: 8, padding: '10 14', marginBottom: 12 }}>
          <Text style={S.body}>{weatherStr}</Text>
          {data.weather.auto_filled && (
            <Text style={{ ...S.bodyMuted, marginBottom: 0, marginTop: 2 }}>Auto-filled from weather API</Text>
          )}
        </View>

        {/* ── Manpower table — omit if no crew/count data ── */}
        {((data.crew || []).length > 0 || (data.total_crew || 0) > 0) && <>
        <SectionHead title="Manpower" />
        <View style={{ marginBottom: 4 }}>
          <View style={tableHeaderStyle}>
            <Text style={{ ...tableHeaderCellStyle, flex: 3 }}>Name</Text>
            <Text style={{ ...tableHeaderCellStyle, flex: 3 }}>Classification</Text>
            <Text style={{ ...tableHeaderCellStyle, flex: 1, textAlign: 'right' }}>Hours</Text>
            <Text style={{ ...tableHeaderCellStyle, flex: 3 }}>Notes</Text>
          </View>
          {(data.crew || []).length > 0 ? (data.crew || []).map((c, i) => (
            <View key={i} style={i % 2 === 0 ? tableRowStyle : tableRowAltStyle}>
              <Text style={{ ...S.body, flex: 3, marginBottom: 0, fontFamily: 'Helvetica-Bold' }}>{c.name}</Text>
              <Text style={{ ...S.body, flex: 3, marginBottom: 0 }}>{c.classification}</Text>
              <Text style={{ ...S.body, flex: 1, marginBottom: 0, textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>{c.hours}</Text>
              <Text style={{ ...S.bodyMuted, flex: 3, marginBottom: 0 }}>{c.notes || '—'}</Text>
            </View>
          )) : (
            <View style={tableRowStyle}>
              <Text style={{ ...S.bodyMuted, flex: 1 }}>{data.total_crew} worker{data.total_crew !== 1 ? 's' : ''} on site</Text>
            </View>
          )}
        </View>
        {data.manpower_prefilled && (
          <Text style={{ ...S.bodyMuted, marginBottom: 12, marginTop: 2 }}>Pre-filled from dispatch schedule</Text>
        )}
        </>}

        {/* ── Work Performed — omit if empty ── */}
        {data.work_performed ? <>
        <SectionHead title="Work Performed" />
        <Text style={{ ...S.body, marginBottom: 14 }}>{data.work_performed}</Text>
        </> : null}

        {/* ── Delays (conditional) ── */}
        {hasDelays && <>
          <SectionHead title="Delays Reported" />
          <View style={{ marginBottom: 12 }}>
            <View style={tableHeaderStyle}>
              <Text style={{ ...tableHeaderCellStyle, flex: 2 }}>Delay Type</Text>
              <Text style={{ ...tableHeaderCellStyle, flex: 1 }}>Duration</Text>
              <Text style={{ ...tableHeaderCellStyle, flex: 4 }}>Description</Text>
              <Text style={{ ...tableHeaderCellStyle, flex: 2 }}>Caused By</Text>
            </View>
            {(data.delays || []).map((d, i) => (
              <View key={i} style={i % 2 === 0 ? tableRowStyle : tableRowAltStyle}>
                <Text style={{ ...S.body, flex: 2, marginBottom: 0, fontFamily: 'Helvetica-Bold' }}>{d.delay_type}</Text>
                <Text style={{ ...S.body, flex: 1, marginBottom: 0 }}>{d.duration_hours != null ? `${d.duration_hours}h` : '—'}</Text>
                <Text style={{ ...S.body, flex: 4, marginBottom: 0 }}>{d.description}</Text>
                <Text style={{ ...S.bodyMuted, flex: 2, marginBottom: 0 }}>{d.caused_by || '—'}</Text>
              </View>
            ))}
          </View>
        </>}

        {/* ── Materials (conditional) ── */}
        {hasMaterials && <>
          <SectionHead title="Materials Received" />
          <View style={{ marginBottom: 12 }}>
            <View style={tableHeaderStyle}>
              <Text style={{ ...tableHeaderCellStyle, flex: 3 }}>Item</Text>
              <Text style={{ ...tableHeaderCellStyle, flex: 2 }}>Supplier</Text>
              <Text style={{ ...tableHeaderCellStyle, flex: 1.5 }}>Condition</Text>
              <Text style={{ ...tableHeaderCellStyle, flex: 3 }}>Notes</Text>
            </View>
            {(data.materials_received || []).map((m, i) => (
              <View key={i} style={i % 2 === 0 ? tableRowStyle : tableRowAltStyle}>
                <Text style={{ ...S.body, flex: 3, marginBottom: 0, fontFamily: 'Helvetica-Bold' }}>{m.item}</Text>
                <Text style={{ ...S.body, flex: 2, marginBottom: 0 }}>{m.supplier || '—'}</Text>
                <Text style={{ ...S.body, flex: 1.5, marginBottom: 0 }}>{m.condition || '—'}</Text>
                <Text style={{ ...S.bodyMuted, flex: 3, marginBottom: 0 }}>{m.notes || '—'}</Text>
              </View>
            ))}
          </View>
        </>}

        {/* ── Photos (conditional) — with embedded thumbnails ── */}
        {hasPhotos && <>
          <SectionHead title={`Photo Evidence — ${data.photos!.length} photo${data.photos!.length !== 1 ? 's' : ''}`} />
          {(data.photos || []).map((p, i) => (
            <View key={i} style={{ marginBottom: 12 }}>
              {p.file_id && (
                <Image
                  src={`https://drive.google.com/thumbnail?id=${p.file_id}&sz=w400`}
                  style={{ maxWidth: 300, marginBottom: 4, borderRadius: 4 }}
                />
              )}
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.text }}>{p.file_name}</Text>
              <Text style={{ fontSize: 8, color: C.slateLight }}>Captured: {fmtHST(p.timestamp)}  ·  {p.drive_link}</Text>
              {p.caption && <Text style={{ fontSize: 8.5, color: C.subtext, marginTop: 2 }}>{p.caption}</Text>}
            </View>
          ))}
        </>}

        {/* Provenance stamp — minimal, light gray, invisible to casual readers */}
        <Text style={{ fontSize: 6, color: '#b0b0b0', marginTop: 16, textAlign: 'center' as const }}>
          BanyanOS · {data.event_id.slice(0, 8)} · {fmtHST(data.submitted_at).split(',').slice(0,3).join(',')} · BANYAN_FIELD_V1
        </Text>

        {/* ── Footer — same as Field Issue ── */}
        <DocFooter docNumber={docNum} kID={data.kid} />

      </Page>
    </Document>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

// GC-D021: data passed to this function must be read fresh at call site — see /api/daily-report/pdf/route.ts
export async function generateDailyReportPDF(data: DailyReportPDFData): Promise<Buffer> {
  return renderToPDF(<DailyReportPDF data={data} />);
}
