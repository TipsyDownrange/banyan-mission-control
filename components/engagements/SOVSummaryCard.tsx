/**
 * BAN-322 Pay Apps v1 — SOV summary card (read-only).
 *
 * Reuses summarizeSOV from lib/pm/sov-summary.ts so totals match the
 * Overview tab's calculator. Data source differs (Postgres SOV here vs
 * Sheets SOV in Overview) — per RF2 the caption flags this divergence.
 *
 * Inline-style hex per RF1.
 */

import { formatCurrency, summarizeSOV } from '@/lib/pm/sov-summary';
import type { CSSProperties } from 'react';

export type SovLine = {
  sov_line_id: string;
  line_number: number;
  scheduled_value: string | number | null;
  retainage_pct: string | number | null;
};

export type SovVersion = {
  sov_version_id: string;
  version_number: number;
  state: string;
  total_value: string | number | null;
};

export type PayAppForSummary = {
  current_amount_due: string | number | null;
  total_earned_less_retainage: string | number | null;
  retainage_held: string | number | null;
};

function parseNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const KPI: CSSProperties = {
  background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
  padding: '12px 14px',
};

const KPI_LABEL: CSSProperties = {
  fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

const KPI_VALUE: CSSProperties = {
  fontSize: 20, fontWeight: 900, color: 'var(--color-ink-primary)', marginTop: 5,
};

const KPI_SUB: CSSProperties = {
  fontSize: 11, color: 'var(--bos-color-ink-disabled)', marginTop: 3,
};

export default function SOVSummaryCard({
  sovVersions,
  sovLines,
  payApps,
  activeSovVersionId,
}: {
  sovVersions: SovVersion[];
  sovLines: SovLine[];
  payApps: PayAppForSummary[];
  activeSovVersionId: string | null;
}) {
  // Contract from SOV lines (active version) or fall back to version total_value.
  const sovSummary = summarizeSOV(sovLines as Record<string, string | number | null | undefined>[]);

  // Billed-to-date pulled from pay app totals — more accurate than SOV
  // line aggregates for engagements where pay app calculations have run.
  const billedToDate = payApps.reduce(
    (sum, p) => sum + parseNum(p.total_earned_less_retainage) + parseNum(p.retainage_held),
    0,
  );
  const retainageHeld = payApps.reduce((sum, p) => sum + parseNum(p.retainage_held), 0);

  // Prefer pay-app billed when present; otherwise fall back to SOV line aggregate.
  const effectiveBilled = payApps.length > 0 ? billedToDate : sovSummary.billedToDate;
  const effectiveRetainage = payApps.length > 0 ? retainageHeld : sovSummary.retainageHeld;

  const totalContract = sovSummary.totalContract > 0
    ? sovSummary.totalContract
    : sovVersions.reduce((sum, v) => sum + parseNum(v.total_value), 0);

  const percentComplete = totalContract > 0
    ? Math.round((effectiveBilled / totalContract) * 100)
    : 0;
  const balanceToFinish = Math.max(totalContract - effectiveBilled, 0);

  const activeVersion = sovVersions.find((v) => v.sov_version_id === activeSovVersionId)
    ?? sovVersions[0]
    ?? null;

  return (
    <div style={{
      background: 'white', borderRadius: 18, border: '1px solid #e2e8f0',
      padding: '18px 20px', boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' }}>
            SOV Summary
          </div>
          <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)', marginTop: 4 }}>
            {activeVersion
              ? `Version ${activeVersion.version_number} · ${activeVersion.state.replace(/_/g, ' ')}`
              : 'No SOV version on file yet.'}
          </div>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase',
          letterSpacing: '0.08em', textAlign: 'right',
        }}>
          {sovSummary.lineCount} line{sovSummary.lineCount === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div style={KPI}>
          <div style={KPI_LABEL}>Total Contract</div>
          <div style={KPI_VALUE}>{formatCurrency(totalContract)}</div>
          <div style={KPI_SUB}>{sovSummary.lineCount} SOV line{sovSummary.lineCount === 1 ? '' : 's'}</div>
        </div>
        <div style={KPI}>
          <div style={KPI_LABEL}>Billed To Date</div>
          <div style={KPI_VALUE}>{formatCurrency(effectiveBilled)}</div>
          <div style={KPI_SUB}>{percentComplete}% complete</div>
        </div>
        <div style={KPI}>
          <div style={KPI_LABEL}>Retainage Held</div>
          <div style={KPI_VALUE}>{formatCurrency(effectiveRetainage)}</div>
          <div style={KPI_SUB}>From pay app totals</div>
        </div>
        <div style={KPI}>
          <div style={KPI_LABEL}>Balance To Finish</div>
          <div style={KPI_VALUE}>{formatCurrency(balanceToFinish)}</div>
          <div style={KPI_SUB}>Contract less billed</div>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--bos-color-ink-tertiary)', fontStyle: 'italic' }}>
        Postgres billing data — may differ from Overview tab during migration.
      </div>
    </div>
  );
}
