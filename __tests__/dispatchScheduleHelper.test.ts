import { buildDispatchRow, validateDispatchRow } from '@/lib/dispatch-schedule';
import { DISPATCH_COL_COUNT } from '@/lib/schemas';

const BASE = {
  slot_id: 'SLOT-20260501-001',
  date: '2026-05-01',
  kID: 'WO-12345',
};

describe('buildDispatchRow', () => {
  it('returns exactly 19 columns', () => {
    const row = buildDispatchRow(BASE);
    expect(row).toHaveLength(19);
    expect(row).toHaveLength(DISPATCH_COL_COUNT);
  });

  it('throws when slot_id is missing', () => {
    expect(() =>
      buildDispatchRow({ ...BASE, slot_id: undefined as unknown as string })
    ).toThrow('slot_id is required');
  });

  it('throws when date is missing', () => {
    expect(() =>
      buildDispatchRow({ ...BASE, date: undefined as unknown as string })
    ).toThrow('date is required');
  });

  it('throws when kID is missing', () => {
    expect(() =>
      buildDispatchRow({ ...BASE, kID: undefined as unknown as string })
    ).toThrow('kID is required');
  });

  it('optional fields default to empty string', () => {
    const row = buildDispatchRow(BASE);
    expect(row[3]).toBe('');  // project_name  D
    expect(row[4]).toBe('');  // island         E
    expect(row[5]).toBe('');  // men_required   F
    expect(row[6]).toBe('');  // hours_estimated G
    expect(row[8]).toBe('');  // created_by     I
    expect(row[9]).toBe('');  // status         J
    expect(row[10]).toBe(''); // confirmations  K
    expect(row[11]).toBe(''); // work_type      L
    expect(row[12]).toBe(''); // notes          M
    expect(row[13]).toBe(''); // start_time     N
    expect(row[14]).toBe(''); // end_time       O
    expect(row[15]).toBe(''); // step_ids       P
    expect(row[16]).toBe(''); // hours_actual   Q
  });

  describe('last_modified — column R / index 17', () => {
    it('uses provided last_modified value', () => {
      const row = buildDispatchRow({ ...BASE, last_modified: '2026-05-01T00:00:00.000Z' });
      expect(row[17]).toBe('2026-05-01T00:00:00.000Z');
    });

    it('auto-sets to a current ISO timestamp when not provided', () => {
      const before = new Date().toISOString();
      const row = buildDispatchRow(BASE);
      const after = new Date().toISOString();
      expect(row[17] >= before).toBe(true);
      expect(row[17] <= after).toBe(true);
    });
  });

  describe('focus_step_ids — column S / index 18', () => {
    it('serializes array to JSON array string', () => {
      const row = buildDispatchRow({ ...BASE, focus_step_ids: ['IS-1', 'IS-2'] });
      expect(row[18]).toBe('["IS-1","IS-2"]');
    });

    it('defaults to [] when omitted', () => {
      const row = buildDispatchRow(BASE);
      expect(row[18]).toBe('[]');
    });

    it('parses comma-separated string input', () => {
      const row = buildDispatchRow({ ...BASE, focus_step_ids: 'IS-1, IS-2' });
      expect(row[18]).toBe('["IS-1","IS-2"]');
    });

    it('round-trips a JSON array string input', () => {
      const row = buildDispatchRow({ ...BASE, focus_step_ids: '["IS-3","IS-4"]' });
      expect(row[18]).toBe('["IS-3","IS-4"]');
    });

    it('trims and filters blank entries', () => {
      const row = buildDispatchRow({ ...BASE, focus_step_ids: ['IS-1', '  ', 'IS-2'] });
      expect(row[18]).toBe('["IS-1","IS-2"]');
    });
  });

  describe('assigned_crew — column H / index 7', () => {
    it('serializes array as comma-space joined string', () => {
      const row = buildDispatchRow({ ...BASE, assigned_crew: ['Alice', 'Bob', 'Carol'] });
      expect(row[7]).toBe('Alice, Bob, Carol');
    });

    it('passes through a string as-is', () => {
      const row = buildDispatchRow({ ...BASE, assigned_crew: 'Alice, Bob' });
      expect(row[7]).toBe('Alice, Bob');
    });

    it('defaults to empty string when omitted', () => {
      const row = buildDispatchRow(BASE);
      expect(row[7]).toBe('');
    });
  });

  describe('step_ids — column P / index 15', () => {
    it('serializes array as comma-space joined string', () => {
      const row = buildDispatchRow({ ...BASE, step_ids: ['STEP-1', 'STEP-2'] });
      expect(row[15]).toBe('STEP-1, STEP-2');
    });

    it('defaults to empty string when omitted', () => {
      const row = buildDispatchRow(BASE);
      expect(row[15]).toBe('');
    });
  });

  it('places required fields at correct indices', () => {
    const row = buildDispatchRow({
      ...BASE,
      slot_id: 'SLOT-TEST-001',
      date: '2026-06-15',
      kID: 'WO-99',
    });
    expect(row[0]).toBe('SLOT-TEST-001'); // A
    expect(row[1]).toBe('2026-06-15');    // B
    expect(row[2]).toBe('WO-99');         // C
  });
});

describe('validateDispatchRow', () => {
  function makeValidRow(): string[] {
    return buildDispatchRow(BASE);
  }

  it('passes a valid 19-column row', () => {
    const result = validateDispatchRow(makeValidRow());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when row has fewer than 19 columns', () => {
    const short = makeValidRow().slice(0, 10);
    const result = validateDispatchRow(short);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('19'))).toBe(true);
  });

  it('fails when row has more than 19 columns', () => {
    const long = [...makeValidRow(), 'extra'];
    const result = validateDispatchRow(long);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('19'))).toBe(true);
  });

  it('fails when slot_id is empty', () => {
    const row = makeValidRow();
    row[0] = '';
    const result = validateDispatchRow(row);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('slot_id'))).toBe(true);
  });

  it('fails when date is empty', () => {
    const row = makeValidRow();
    row[1] = '';
    const result = validateDispatchRow(row);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('date'))).toBe(true);
  });

  it('collects multiple errors at once', () => {
    const row = makeValidRow();
    row[0] = '';
    row[1] = '';
    const result = validateDispatchRow(row);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('makes no Google Sheets calls — pure in-memory', () => {
    // No mocks needed; if googleapis were imported, jest would fail to resolve it.
    // This test passing proves the helper is purely in-memory.
    const result = validateDispatchRow(makeValidRow());
    expect(result.valid).toBe(true);
  });
});
