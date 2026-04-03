/**
 * Work Order Dispatch Sheet — Crew Copy
 * Handed to glaziers before they go out for the day.
 * Clean, large text, mobile-friendly print layout.
 * Old-school guys get paper. Digital crew gets it on their phone.
 */

import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { S, C, Letterhead, DocFooter, renderToPDF } from './pdf-templates';
import QRCode from 'qrcode';

async function generateMapsQR(address: string): Promise<string | null> {
  if (!address) return null;
  try {
    const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    const dataUrl = await QRCode.toDataURL(mapsUrl, {
      width: 120,
      margin: 1,
      color: { dark: '#0D0D80', light: '#ffffff' },
    });
    return dataUrl;
  } catch { return null; }
}

export type DispatchWOData = {
  qr_data_url?: string; // pre-generated QR code data URL
  wo_number: string;
  date: string;
  scheduled_date: string;
  // Job info
  project_name: string;
  address: string;
  island: string;
  contact_name: string;
  contact_phone: string;
  // Scope
  scope_description: string;
  system_type?: string;
  // Crew
  crew: { name: string; role: string; phone?: string }[];
  foreman?: string;
  // Job details
  estimated_hours: string;
  men_count: string;
  start_time?: string;
  // Materials / notes
  materials_notes?: string;
  special_instructions?: string;
  // Tools required
  tools_required?: string[];
  // Safety
  ppe_required?: string[];
};

const DEFAULT_PPE = ['Safety glasses', 'Hard hat', 'Hi-vis vest', 'Work gloves', 'Steel-toed boots'];
const DEFAULT_TOOLS = ['Caulk gun', 'Glazing tools', 'Tape measure', 'Level', 'Power drill'];

function DispatchPDF({ data }: { data: DispatchWOData }) {
  const ppe = data.ppe_required || DEFAULT_PPE;
  const tools = data.tools_required || DEFAULT_TOOLS;

  const BigLabel = ({ text }: { text: string }) => (
    <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, color: C.slateLight, marginBottom: 3 }}>
      {text}
    </Text>
  );

  const BigValue = ({ text, accent }: { text: string; accent?: boolean }) => (
    <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: accent ? C.navy : C.text, lineHeight: 1.3, marginBottom: 8 }}>
      {text || '—'}
    </Text>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginBottom: 14, padding: '10 12', backgroundColor: C.bg, borderRadius: 8, border: `1 solid ${C.border}` }}>
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, color: C.blue, marginBottom: 8, borderBottom: `1 solid ${C.border}`, paddingBottom: 4 }}>
        {title}
      </Text>
      {children}
    </View>
  );

  return (
    <Document>
      <Page size="LETTER" style={{ ...S.page, padding: '32 44 44 44' }}>
        <Letterhead docNumber={`WO ${data.wo_number}`} date={data.date} />

        {/* Big bold title + QR code */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <View>
            <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: -0.3 }}>Work Order Dispatch</Text>
            <Text style={{ fontSize: 12, color: C.blue, marginTop: 2 }}>
              {data.scheduled_date ? `Scheduled: ${data.scheduled_date}` : 'Date TBD'}
              {data.start_time ? `  ·  Start: ${data.start_time}` : ''}
            </Text>
          </View>
          {/* QR code — scan to open Google Maps directions */}
          {data.qr_data_url && (
            <View style={{ alignItems: 'center' }}>
              <Image src={data.qr_data_url} style={{ width: 72, height: 72 }} />
              <Text style={{ fontSize: 7, color: C.slateLight, marginTop: 3, textAlign: 'center' }}>Scan → Maps</Text>
            </View>
          )}
        </View>

        {/* Job info — large, easy to read on site */}
        <View style={{ border: `2 solid ${C.orange}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
          <View style={{ padding: '10 14', backgroundColor: C.bg }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <View style={{ width: '100%', marginBottom: 6 }}>
                <BigLabel text="Job Name" />
                <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.navy, lineHeight: 1.2 }}>{data.project_name}</Text>
              </View>
              <View style={{ width: '60%', paddingRight: 12 }}>
                <BigLabel text="Address" />
                <Text style={{ fontSize: 12, color: C.text, lineHeight: 1.4, marginBottom: 6 }}>{data.address}</Text>
              </View>
              <View style={{ width: '40%' }}>
                <BigLabel text="Island" />
                <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.blue, marginBottom: 6 }}>{data.island || '—'}</Text>
              </View>
              <View style={{ width: '50%', paddingRight: 12 }}>
                <BigLabel text="Contact" />
                <Text style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>{data.contact_name || '—'}</Text>
              </View>
              <View style={{ width: '50%' }}>
                <BigLabel text="Phone" />
                {data.contact_phone ? (
                  <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy }}>{data.contact_phone}</Text>
                ) : (
                  <Text style={{ fontSize: 11, color: C.slateLight }}>—</Text>
                )}
              </View>
            </View>
          </View>
          {/* Scope strip */}
          <View style={{ backgroundColor: C.orangeBg, borderTop: `1 solid ${C.orangeBorder}`, padding: '7 14' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.orange, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Scope of Work</Text>
            <Text style={{ fontSize: 11, color: C.navy, lineHeight: 1.5 }}>{data.scope_description || '—'}</Text>
            {data.system_type && (
              <Text style={{ fontSize: 9, color: C.slate, marginTop: 3 }}>System Type: {data.system_type}</Text>
            )}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 0, marginBottom: 0 }}>
          {/* Left column */}
          <View style={{ flex: 1, marginRight: 10 }}>
            {/* Crew */}
            <Section title="Crew Assignment">
              {data.foreman && (
                <View style={{ marginBottom: 6, paddingBottom: 6, borderBottom: `0.5 solid ${C.border}` }}>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.orange, textTransform: 'uppercase', letterSpacing: 0.4 }}>Foreman</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.navy }}>{data.foreman}</Text>
                </View>
              )}
              {data.crew.map((member, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View>
                    <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.text }}>{member.name}</Text>
                    <Text style={{ fontSize: 9, color: C.slateLight }}>{member.role}</Text>
                  </View>
                  {member.phone && (
                    <Text style={{ fontSize: 9, color: C.blue, alignSelf: 'center' }}>{member.phone}</Text>
                  )}
                </View>
              ))}
              {data.crew.length === 0 && (
                <Text style={{ fontSize: 10, color: C.slateLight }}>Crew TBD</Text>
              )}
            </Section>

            {/* Job details */}
            <Section title="Job Details">
              <View style={{ flexDirection: 'row', gap: 0 }}>
                <View style={{ flex: 1 }}>
                  <BigLabel text="Est. Hours" />
                  <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.navy }}>{data.estimated_hours || '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <BigLabel text="Crew Size" />
                  <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.navy }}>{data.men_count || '—'}</Text>
                </View>
              </View>
            </Section>
          </View>

          {/* Right column */}
          <View style={{ flex: 1 }}>
            {/* PPE */}
            <Section title="PPE Required">
              {ppe.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 2, border: `1 solid ${C.border}`, marginRight: 6 }} />
                  <Text style={{ fontSize: 10, color: C.text }}>{item}</Text>
                </View>
              ))}
            </Section>

            {/* Tools */}
            <Section title="Tools / Equipment">
              {tools.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 2, border: `1 solid ${C.border}`, marginRight: 6 }} />
                  <Text style={{ fontSize: 10, color: C.text }}>{item}</Text>
                </View>
              ))}
            </Section>
          </View>
        </View>

        {/* Materials notes */}
        {data.materials_notes && (
          <View style={{ marginTop: 10, padding: '8 12', backgroundColor: C.bg, borderRadius: 8, border: `1 solid ${C.border}` }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.blue, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Materials / Parts</Text>
            <Text style={{ fontSize: 10, color: C.text, lineHeight: 1.5 }}>{data.materials_notes}</Text>
          </View>
        )}

        {/* Special instructions */}
        {data.special_instructions && (
          <View style={{ marginTop: 8, padding: '8 12', backgroundColor: '#fffbeb', borderRadius: 8, border: `1 solid ${C.orangeBorder}` }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.orange, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>⚠ Special Instructions</Text>
            <Text style={{ fontSize: 10, color: C.text, lineHeight: 1.5 }}>{data.special_instructions}</Text>
          </View>
        )}

        {/* Sign-off strip */}
        <View style={{ marginTop: 16, flexDirection: 'row', gap: 0 }}>
          {['Crew Member', 'Foreman / Supervisor', 'Time In', 'Time Out'].map((label, i) => (
            <View key={i} style={{ flex: 1, marginRight: i < 3 ? 8 : 0 }}>
              <View style={{ borderBottom: `1 solid ${C.text}`, height: 28, marginBottom: 3 }} />
              <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.slateLight, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' }}>{label}</Text>
            </View>
          ))}
        </View>

        <DocFooter docNumber={`WO ${data.wo_number}`} />
      </Page>
    </Document>
  );
}

export async function generateDispatchWOPDF(data: DispatchWOData): Promise<Buffer> {
  // Pre-generate QR code for Google Maps
  const qr_data_url = await generateMapsQR(data.address);
  return renderToPDF(<DispatchPDF data={{ ...data, qr_data_url: qr_data_url || undefined }} />);
}
