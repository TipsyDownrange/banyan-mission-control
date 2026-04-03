/**
 * Budget Export PDF
 * Snapshot of current project budget — estimated vs actual by category.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { S, C, Letterhead, SectionHead, DocFooter, renderToPDF } from './pdf-templates';

export type BudgetLine = {
  category: string;         // e.g. "Aluminum / Metal", "Glass", "Hardware"
  description?: string;
  budget_amount: number;
  actual_amount: number;
  committed?: number;       // POs issued but not yet invoiced
  notes?: string;
};

export type BudgetData = {
  project_name: string;
  kID: string;
  contract_value: number;
  as_of_date: string;
  pm_name: string;
  lines: BudgetLine[];
  // Change orders
  approved_cos_total: number;
  pending_cos_total: number;
  // Notes
  notes?: string;
};

function variance(budget: number, actual: number) {
  return budget - actual;
}

function pct(actual: number, budget: number) {
  if (!budget) return '—';
  return Math.round((actual / budget) * 100) + '%';
}

function fmtN(n: number) {
  if (!n && n !== 0) return '—';
  const abs = Math.abs(n);
  const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${str})` : str;
}

function varColor(v: number) {
  if (v > 0) return '#16a34a';  // under budget = green
  if (v < 0) return C.red;       // over budget = red
  return C.subtext;
}

function BudgetPDF({ data }: { data: BudgetData }) {
  const totalBudget  = data.lines.reduce((s, l) => s + l.budget_amount, 0);
  const totalActual  = data.lines.reduce((s, l) => s + l.actual_amount, 0);
  const totalVariance = variance(totalBudget, totalActual);
  const revisedContract = data.contract_value + data.approved_cos_total;

  return (
    <Document>
      <Page size="LETTER" style={{ ...S.page, fontSize: 8.5 }}>
        <Letterhead docNumber={`Budget — ${data.kID}`} date={data.as_of_date} />

        <View style={[S.docTitleRow, { marginBottom: 12 }]}>
          <Text style={S.docTitle}>Project Budget</Text>
          <Text style={S.docMeta}>As of {data.as_of_date}</Text>
        </View>

        {/* Header block */}
        <View style={{ border: `1.5 solid ${C.orange}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
          <View style={{ padding: '8 12', backgroundColor: C.bg, flexDirection: 'row', flexWrap: 'wrap' }}>
            {[
              ['Project',          data.project_name],
              ['kID',              data.kID],
              ['PM',               data.pm_name],
              ['As of Date',       data.as_of_date],
              ['Original Contract', fmtN(data.contract_value)],
              ['Approved COs',     fmtN(data.approved_cos_total)],
              ['Revised Contract', fmtN(revisedContract)],
              ['Pending COs',      fmtN(data.pending_cos_total)],
            ].map(([label, value]) => (
              <View key={label} style={{ width: '50%', flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5, paddingRight: 10 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.slateLight, textTransform: 'uppercase', letterSpacing: 0.5, width: 90, paddingTop: 1 }}>{label}</Text>
                <Text style={{ fontSize: 9, color: C.text, flex: 1 }}>{value}</Text>
              </View>
            ))}
          </View>
          <View style={{ backgroundColor: C.orangeBg, borderTop: `1 solid ${C.orangeBorder}`, padding: '5 12', flexDirection: 'row' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.orange, textTransform: 'uppercase', letterSpacing: 0.4, marginRight: 12 }}>Overall Variance</Text>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: varColor(totalVariance) }}>{fmtN(totalVariance)}</Text>
            <Text style={{ fontSize: 8.5, color: C.slate, marginLeft: 8 }}>
              ({pct(totalActual, totalBudget)} spent)
            </Text>
          </View>
        </View>

        {/* Budget lines */}
        <SectionHead title="Budget by Category" />
        <View style={{ borderRadius: 8, overflow: 'hidden', border: `1 solid ${C.border}`, marginBottom: 14 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', backgroundColor: C.navy, padding: '5 8' }}>
            {[['Category', 2], ['Description', 1.5], ['Budget', 0.8], ['Actual', 0.8], ['Variance', 0.8], ['%', 0.4]].map(([label, flex]) => (
              <Text key={String(label)} style={{ flex: flex as number, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: typeof flex === 'number' && flex < 1.5 ? 'right' : 'left' }}>
                {String(label)}
              </Text>
            ))}
          </View>
          {data.lines.map((line, i) => {
            const v = variance(line.budget_amount, line.actual_amount);
            return (
              <View key={i} style={{ flexDirection: 'row', padding: '5 8', backgroundColor: i % 2 === 1 ? C.bg : C.white, borderTop: `0.5 solid ${C.border}` }}>
                <Text style={{ flex: 2, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.navy }}>{line.category}</Text>
                <Text style={{ flex: 1.5, fontSize: 8, color: C.subtext }}>{line.description || ''}</Text>
                <Text style={{ flex: 0.8, fontSize: 8.5, color: C.text, textAlign: 'right' }}>{fmtN(line.budget_amount)}</Text>
                <Text style={{ flex: 0.8, fontSize: 8.5, color: C.text, textAlign: 'right' }}>{fmtN(line.actual_amount)}</Text>
                <Text style={{ flex: 0.8, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: varColor(v), textAlign: 'right' }}>{fmtN(v)}</Text>
                <Text style={{ flex: 0.4, fontSize: 8, color: C.slateLight, textAlign: 'right' }}>{pct(line.actual_amount, line.budget_amount)}</Text>
              </View>
            );
          })}
          {/* Totals row */}
          <View style={{ flexDirection: 'row', padding: '6 8', backgroundColor: `${C.blue}12`, borderTop: `1 solid ${C.blue}44` }}>
            <Text style={{ flex: 3.5, fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy }}>TOTAL</Text>
            <Text style={{ flex: 0.8, fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' }}>{fmtN(totalBudget)}</Text>
            <Text style={{ flex: 0.8, fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' }}>{fmtN(totalActual)}</Text>
            <Text style={{ flex: 0.8, fontSize: 9, fontFamily: 'Helvetica-Bold', color: varColor(totalVariance), textAlign: 'right' }}>{fmtN(totalVariance)}</Text>
            <Text style={{ flex: 0.4, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' }}>{pct(totalActual, totalBudget)}</Text>
          </View>
        </View>

        {data.notes && (
          <>
            <SectionHead title="Notes" />
            <Text style={{ ...S.bodyMuted, marginBottom: 10 }}>{data.notes}</Text>
          </>
        )}

        <View style={{ padding: '6 10', backgroundColor: C.bg, borderRadius: 6, border: `0.5 solid ${C.border}`, marginTop: 8 }}>
          <Text style={{ fontSize: 7.5, color: C.slateLight }}>
            Actual costs sourced from QuickBooks job cost report. Budget sourced from awarded estimate. Generated by BanyanOS.
          </Text>
        </View>

        <DocFooter docNumber={`Budget — ${data.kID}`} kID={data.kID} />
      </Page>
    </Document>
  );
}

export async function generateBudgetPDF(data: BudgetData): Promise<Buffer> {
  return renderToPDF(<BudgetPDF data={data} />);
}
