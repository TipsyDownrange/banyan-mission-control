/**
 * BAN-336 Pay App Core — calc + validation unit tests.
 * Covers acceptance criteria 4 (auto-calc), 5 (validation), 6 (G702 summary).
 */

import {
  calcG703Line,
  validateG703Line,
  summarizeG702,
  rollupParentLines,
} from '@/lib/aia/pay-app-calc';

describe('BAN-336 G703 line calc', () => {
  it('computes G = D + E + F', () => {
    const c = calcG703Line({
      scheduled_value: 100000,
      work_completed_previous: 20000,
      work_completed_this_period: 5000,
      materials_stored_this_period: 1000,
      retainage_pct: 0.10,
    });
    expect(c.total_completed_to_date).toBe(26000);
  });

  it('computes H = G / C as a 0..1 decimal', () => {
    const c = calcG703Line({
      scheduled_value: 100000,
      work_completed_previous: 50000,
      work_completed_this_period: 0,
      materials_stored_this_period: 0,
      retainage_pct: 0.10,
    });
    expect(c.pct_complete).toBe(0.5);
  });

  it('computes I = G × retainage_pct', () => {
    const c = calcG703Line({
      scheduled_value: 100000,
      work_completed_previous: 20000,
      work_completed_this_period: 5000,
      materials_stored_this_period: 1000,
      retainage_pct: 0.10,
    });
    expect(c.retainage_held).toBe(2600);
  });

  it('balance_to_finish = C - G', () => {
    const c = calcG703Line({
      scheduled_value: 100000,
      work_completed_previous: 40000,
      work_completed_this_period: 10000,
      materials_stored_this_period: 0,
      retainage_pct: 0.05,
    });
    expect(c.balance_to_finish).toBe(50000);
  });

  it('handles zero scheduled_value without division by zero', () => {
    const c = calcG703Line({
      scheduled_value: 0,
      work_completed_previous: 0,
      work_completed_this_period: 0,
      materials_stored_this_period: 0,
      retainage_pct: 0.10,
    });
    expect(c.pct_complete).toBe(0);
  });

  it('rounds to 2 decimals on money fields', () => {
    const c = calcG703Line({
      scheduled_value: 333.333,
      work_completed_previous: 100,
      work_completed_this_period: 50,
      materials_stored_this_period: 0,
      retainage_pct: 0.10,
    });
    expect(c.scheduled_value).toBe(333.33);
    expect(c.balance_to_finish).toBe(183.33);
  });
});

describe('BAN-336 G703 line validation', () => {
  it('rejects materials stored that exceeds remaining scope (F > C - (D + E))', () => {
    const v = validateG703Line({
      scheduled_value: 100,
      work_completed_previous: 60,
      work_completed_this_period: 30,
      materials_stored_this_period: 20, // C-D-E = 10 → invalid
      retainage_pct: 0.10,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('OVER_STORED');
  });

  it('rejects work this period that exceeds remaining billable (E > C - D - F)', () => {
    const v = validateG703Line({
      scheduled_value: 100,
      work_completed_previous: 50,
      work_completed_this_period: 60, // C-D-F = 50 → invalid
      materials_stored_this_period: 0,
      retainage_pct: 0.10,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('OVER_BILLED');
  });

  it('rejects negative values', () => {
    const v = validateG703Line({
      scheduled_value: 100,
      work_completed_previous: 50,
      work_completed_this_period: -1,
      materials_stored_this_period: 0,
      retainage_pct: 0.10,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('NEGATIVE');
  });

  it('accepts exact-fit fill to scheduled_value', () => {
    const v = validateG703Line({
      scheduled_value: 100,
      work_completed_previous: 50,
      work_completed_this_period: 30,
      materials_stored_this_period: 20,
      retainage_pct: 0.10,
    });
    expect(v.ok).toBe(true);
  });

  it('accepts a fresh empty line', () => {
    const v = validateG703Line({
      scheduled_value: 100,
      work_completed_previous: 0,
      work_completed_this_period: 0,
      materials_stored_this_period: 0,
      retainage_pct: 0.10,
    });
    expect(v.ok).toBe(true);
  });
});

describe('BAN-336 G702 summary', () => {
  it('aggregates lines 1-9 with split retainage', () => {
    const lines = [
      calcG703Line({
        scheduled_value: 100000,
        work_completed_previous: 20000,
        work_completed_this_period: 10000,
        materials_stored_this_period: 5000,
        retainage_pct: 0.10,
      }),
      calcG703Line({
        scheduled_value: 200000,
        work_completed_previous: 80000,
        work_completed_this_period: 30000,
        materials_stored_this_period: 0,
        retainage_pct: 0.10,
      }),
    ];
    const s = summarizeG702({
      lines,
      originalContractSum: 300000,
      netChangeByCo: 0,
      lessPreviousCertificates: 100000 * 0.9, // assume prev period paid 90k
      retainagePctCompleted: 0.10,
      retainagePctStored: 0.10,
    });
    expect(s.line3_contract_sum_to_date).toBe(300000);
    expect(s.line4_total_completed_and_stored).toBe(35000 + 110000); // 145000
    expect(s.line5a_retainage_completed_work).toBe((30000 + 110000) * 0.10);
    expect(s.line5b_retainage_stored_materials).toBe(5000 * 0.10);
    expect(s.line5_total_retainage).toBe(s.line5a_retainage_completed_work + s.line5b_retainage_stored_materials);
    expect(s.line6_total_earned_less_retainage).toBe(145000 - s.line5_total_retainage);
    expect(s.line8_current_payment_due).toBe(s.line6_total_earned_less_retainage - 90000);
    expect(s.line9_balance_to_finish_plus_retainage).toBe(300000 - s.line6_total_earned_less_retainage);
  });

  it('Net Change by CO flows into line 2 and contract_sum_to_date', () => {
    const s = summarizeG702({
      lines: [],
      originalContractSum: 100000,
      netChangeByCo: 25000,
      lessPreviousCertificates: 0,
      retainagePctCompleted: 0.10,
      retainagePctStored: 0.10,
    });
    expect(s.line2_net_change_by_co).toBe(25000);
    expect(s.line3_contract_sum_to_date).toBe(125000);
  });
});

describe('BAN-336 rollupParentLines (hierarchical SOV)', () => {
  it('sums child line values into a parent rollup', () => {
    const lines = [
      {
        ...calcG703Line({
          scheduled_value: 1000,
          work_completed_previous: 100,
          work_completed_this_period: 50,
          materials_stored_this_period: 0,
          retainage_pct: 0.10,
        }),
        sov_line_id: 'child-1',
        parent_line_id: 'parent-A',
      },
      {
        ...calcG703Line({
          scheduled_value: 2000,
          work_completed_previous: 200,
          work_completed_this_period: 100,
          materials_stored_this_period: 50,
          retainage_pct: 0.10,
        }),
        sov_line_id: 'child-2',
        parent_line_id: 'parent-A',
      },
      {
        ...calcG703Line({
          scheduled_value: 500,
          work_completed_previous: 0,
          work_completed_this_period: 100,
          materials_stored_this_period: 0,
          retainage_pct: 0.10,
        }),
        sov_line_id: 'child-3',
        parent_line_id: 'parent-B',
      },
    ];
    const rollups = rollupParentLines(lines);
    const parentA = rollups.get('parent-A')!;
    expect(parentA.scheduled_value).toBe(3000);
    expect(parentA.work_completed_previous).toBe(300);
    expect(parentA.work_completed_this_period).toBe(150);
    expect(parentA.materials_stored_this_period).toBe(50);
    expect(parentA.total_completed_to_date).toBe(500);

    const parentB = rollups.get('parent-B')!;
    expect(parentB.total_completed_to_date).toBe(100);
  });

  it('ignores rows without parent_line_id', () => {
    const lines = [
      {
        ...calcG703Line({
          scheduled_value: 1000,
          work_completed_previous: 100,
          work_completed_this_period: 0,
          materials_stored_this_period: 0,
          retainage_pct: 0.10,
        }),
        sov_line_id: 'orphan-1',
        parent_line_id: null,
      },
    ];
    expect(rollupParentLines(lines).size).toBe(0);
  });
});
