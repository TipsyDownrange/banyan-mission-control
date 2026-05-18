/**
 * BAN-336 Pay App Core — G703 line calc + G702 summary aggregator.
 *
 * Pure functions (no DB). All money in cents-safe NUMERIC(14,2) — represented
 * here as strings to mirror the Postgres numeric driver. The route layer is
 * responsible for parsing strings → numbers, calling these helpers, and then
 * persisting the numeric strings back via Drizzle.
 *
 * Validation contract (per spec §4):
 *   F ≤ C - (D + E)         — can't store more materials than remaining scope
 *   E ≤ C - D - F           — can't bill more than remaining
 *   G = D + E + F           — total completed and stored
 *   H = G / C   (0..1)      — percent complete (stored as decimal 0–1)
 *   I = G × retainage_pct   — retainage held on this line
 */

export interface G703LineInput {
  pay_app_line_id?: string;
  sov_line_id?: string | null;
  scheduled_value: number;          // C
  work_completed_previous: number;  // D
  work_completed_this_period: number; // E
  materials_stored_this_period: number; // F
  retainage_pct: number;            // 0..1 (e.g. 0.10)
  parent_line_id?: string | null;
}

export interface G703LineCalc {
  scheduled_value: number;
  work_completed_previous: number;
  work_completed_this_period: number;
  materials_stored_this_period: number;
  total_completed_to_date: number;  // G = D+E+F
  pct_complete: number;             // H = G/C  (0..1)
  balance_to_finish: number;        // C - G
  retainage_held: number;           // I = G * retainage_pct
}

export type LineValidation =
  | { ok: true }
  | { ok: false; code: 'OVER_STORED' | 'OVER_BILLED' | 'NEGATIVE'; message: string };

export function validateG703Line(line: G703LineInput): LineValidation {
  const c = line.scheduled_value;
  const d = line.work_completed_previous;
  const e = line.work_completed_this_period;
  const f = line.materials_stored_this_period;

  if (c < 0 || d < 0 || e < 0 || f < 0) {
    return { ok: false, code: 'NEGATIVE', message: 'Negative line values are not allowed' };
  }

  // OVER_BILLED — E alone exceeds C - D (independent of F). This isolates
  // an over-bill that isn't caused by stored materials so the diagnostic
  // points at the right field.
  if (e > c - d + 1e-6) {
    return {
      ok: false,
      code: 'OVER_BILLED',
      message: `Work this period (${e.toFixed(2)}) exceeds remaining billable (${(c - d).toFixed(2)})`,
    };
  }

  // OVER_STORED — total D+E+F exceeds C (i.e. F is the addition that pushes
  // the line over the contract value).
  if (d + e + f > c + 1e-6) {
    return {
      ok: false,
      code: 'OVER_STORED',
      message: `Materials stored (${f.toFixed(2)}) exceed remaining scope (${(c - (d + e)).toFixed(2)})`,
    };
  }

  return { ok: true };
}

export function calcG703Line(line: G703LineInput): G703LineCalc {
  const c = line.scheduled_value;
  const d = line.work_completed_previous;
  const e = line.work_completed_this_period;
  const f = line.materials_stored_this_period;
  const g = d + e + f;
  const h = c > 0 ? g / c : 0;
  const i = g * (line.retainage_pct ?? 0);
  return {
    scheduled_value: round2(c),
    work_completed_previous: round2(d),
    work_completed_this_period: round2(e),
    materials_stored_this_period: round2(f),
    total_completed_to_date: round2(g),
    pct_complete: roundN(h, 4),
    balance_to_finish: round2(c - g),
    retainage_held: round2(i),
  };
}

export interface G702Summary {
  // 9 standard G702 lines (numbered per AIA G702-2017)
  line1_original_contract_sum: number;
  line2_net_change_by_co: number;
  line3_contract_sum_to_date: number;            // 1+2
  line4_total_completed_and_stored: number;      // Σ G
  line5a_retainage_completed_work: number;       // Σ on D+E
  line5b_retainage_stored_materials: number;     // Σ on F
  line5_total_retainage: number;                 // 5a+5b
  line6_total_earned_less_retainage: number;     // 4-5
  line7_less_previous_certificates: number;
  line8_current_payment_due: number;             // 6-7
  line9_balance_to_finish_plus_retainage: number; // 3-6
}

export interface G702Inputs {
  lines: G703LineCalc[];
  originalContractSum: number;
  netChangeByCo: number;
  lessPreviousCertificates: number;
  // Spec §4.4 — split retainage between completed work vs stored materials so
  // the G702 line-5 footnote can break out the two halves.
  retainagePctCompleted: number;   // applied to D+E
  retainagePctStored: number;      // applied to F (defaults to same pct)
}

export function summarizeG702(input: G702Inputs): G702Summary {
  let totalCompletedStored = 0;
  let retainageCompleted = 0;
  let retainageStored = 0;

  for (const l of input.lines) {
    totalCompletedStored += l.total_completed_to_date;
    const completedSubtotal = l.work_completed_previous + l.work_completed_this_period;
    retainageCompleted += completedSubtotal * input.retainagePctCompleted;
    retainageStored += l.materials_stored_this_period * input.retainagePctStored;
  }

  const line3 = input.originalContractSum + input.netChangeByCo;
  const line5 = retainageCompleted + retainageStored;
  const line6 = totalCompletedStored - line5;
  const line8 = line6 - input.lessPreviousCertificates;
  const line9 = line3 - line6;

  return {
    line1_original_contract_sum: round2(input.originalContractSum),
    line2_net_change_by_co: round2(input.netChangeByCo),
    line3_contract_sum_to_date: round2(line3),
    line4_total_completed_and_stored: round2(totalCompletedStored),
    line5a_retainage_completed_work: round2(retainageCompleted),
    line5b_retainage_stored_materials: round2(retainageStored),
    line5_total_retainage: round2(line5),
    line6_total_earned_less_retainage: round2(line6),
    line7_less_previous_certificates: round2(input.lessPreviousCertificates),
    line8_current_payment_due: round2(line8),
    line9_balance_to_finish_plus_retainage: round2(line9),
  };
}

// Parent SOV row totals — sum direct child leaf rows for a grouped G703 render.
export function rollupParentLines(
  lines: (G703LineCalc & { sov_line_id: string; parent_line_id?: string | null })[],
): Map<string, G703LineCalc> {
  const byParent = new Map<string, G703LineCalc[]>();
  for (const l of lines) {
    if (!l.parent_line_id) continue;
    const arr = byParent.get(l.parent_line_id) ?? [];
    arr.push(l);
    byParent.set(l.parent_line_id, arr);
  }
  const rollups = new Map<string, G703LineCalc>();
  for (const [parentId, children] of byParent) {
    const sum: G703LineCalc = {
      scheduled_value: 0,
      work_completed_previous: 0,
      work_completed_this_period: 0,
      materials_stored_this_period: 0,
      total_completed_to_date: 0,
      pct_complete: 0,
      balance_to_finish: 0,
      retainage_held: 0,
    };
    for (const c of children) {
      sum.scheduled_value += c.scheduled_value;
      sum.work_completed_previous += c.work_completed_previous;
      sum.work_completed_this_period += c.work_completed_this_period;
      sum.materials_stored_this_period += c.materials_stored_this_period;
      sum.total_completed_to_date += c.total_completed_to_date;
      sum.balance_to_finish += c.balance_to_finish;
      sum.retainage_held += c.retainage_held;
    }
    sum.pct_complete = sum.scheduled_value > 0
      ? roundN(sum.total_completed_to_date / sum.scheduled_value, 4)
      : 0;
    sum.scheduled_value = round2(sum.scheduled_value);
    sum.work_completed_previous = round2(sum.work_completed_previous);
    sum.work_completed_this_period = round2(sum.work_completed_this_period);
    sum.materials_stored_this_period = round2(sum.materials_stored_this_period);
    sum.total_completed_to_date = round2(sum.total_completed_to_date);
    sum.balance_to_finish = round2(sum.balance_to_finish);
    sum.retainage_held = round2(sum.retainage_held);
    rollups.set(parentId, sum);
  }
  return rollups;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundN(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
