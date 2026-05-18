/**
 * BAN-337 Pay Apps v2b — Textura CSV byte-exactness tests.
 *
 * Validates the pure CSV generators against the canonical sampleSoV.csv
 * + InvoiceTemplate.csv shapes. Numeric quoting, CRLF line endings, the
 * 8th SoV header guard string, and the test-project watermarks are all
 * verified.
 */

import {
  generateTexturaSovSetupCsv,
  generateTexturaInvoiceCsv,
  SOV_SETUP_HEADER_ROW,
  INVOICE_HEADER_ROW,
  TEXTURA_TEST_DATA_WATERMARK_SOV,
  TEXTURA_TEST_DATA_WATERMARK_INVOICE,
} from '@/lib/aia/textura-csv';

describe('BAN-337 generateTexturaSovSetupCsv', () => {
  it('renders the 8-column header byte-exact (including the PLEASE DO NOT REMOVE guard)', () => {
    const r = generateTexturaSovSetupCsv(
      [{ textura_phase_code: 100, description: 'Mobilization', scheduled_value: 5000 }],
      { is_test_project: false },
    );
    const lines = r.csv.split('\r\n');
    expect(lines[0]).toBe(SOV_SETUP_HEADER_ROW.join(','));
    expect(lines[0]).toContain('PLEASE DO NOT REMOVE THIS HEADER LINE');
    expect(SOV_SETUP_HEADER_ROW).toHaveLength(8);
  });

  it('preserves explicit textura_phase_code values', () => {
    const r = generateTexturaSovSetupCsv(
      [
        { textura_phase_code: 200, description: 'Roofing', scheduled_value: '12500' },
        { textura_phase_code: 300, description: 'Glazing', scheduled_value: '40000' },
      ],
      { is_test_project: false },
    );
    expect(r.phase_codes_assigned).toEqual([]);
    expect(r.csv.split('\r\n')[1].split(',')[0]).toBe('200');
    expect(r.csv.split('\r\n')[2].split(',')[0]).toBe('300');
  });

  it('auto-assigns phase codes starting at 100 when null, skipping used values', () => {
    const r = generateTexturaSovSetupCsv(
      [
        { textura_phase_code: null, description: 'A', scheduled_value: 1 },
        { textura_phase_code: 101, description: 'B', scheduled_value: 1 },
        { textura_phase_code: null, description: 'C', scheduled_value: 1 },
      ],
      { is_test_project: false, default_start_phase_code: 100 },
    );
    expect(r.phase_codes_assigned).toEqual([
      { line_index: 0, assigned_phase_code: 100 },
      { line_index: 2, assigned_phase_code: 102 },
    ]);
  });

  it('prepends the test-data watermark row when is_test_project=true', () => {
    const r = generateTexturaSovSetupCsv(
      [{ textura_phase_code: 100, description: 'Mob', scheduled_value: 1 }],
      { is_test_project: true },
    );
    const lines = r.csv.split('\r\n');
    expect(lines[0]).toBe(TEXTURA_TEST_DATA_WATERMARK_SOV);
    expect(lines[1]).toBe(SOV_SETUP_HEADER_ROW.join(','));
  });

  it('omits the watermark when is_test_project=false', () => {
    const r = generateTexturaSovSetupCsv(
      [{ textura_phase_code: 100, description: 'Mob', scheduled_value: 1 }],
      { is_test_project: false },
    );
    expect(r.csv.split('\r\n')[0]).toBe(SOV_SETUP_HEADER_ROW.join(','));
    expect(r.csv).not.toContain('TEST DATA');
  });

  it('terminates lines with CRLF', () => {
    const r = generateTexturaSovSetupCsv(
      [{ textura_phase_code: 100, description: 'x', scheduled_value: 0 }],
      { is_test_project: false },
    );
    expect(r.csv.endsWith('\r\n')).toBe(true);
    expect(r.csv.includes('\r\n')).toBe(true);
  });

  it('quotes description values containing commas', () => {
    const r = generateTexturaSovSetupCsv(
      [{ textura_phase_code: 100, description: 'Mob, demo, haul', scheduled_value: 100 }],
      { is_test_project: false },
    );
    expect(r.csv).toContain('"Mob, demo, haul"');
  });

  it('formats scheduled_value with 2 decimals', () => {
    const r = generateTexturaSovSetupCsv(
      [{ textura_phase_code: 100, description: 'x', scheduled_value: 12345 }],
      { is_test_project: false },
    );
    const lines = r.csv.split('\r\n');
    expect(lines[1].split(',')[2]).toBe('12345.00');
  });

  it('exposes the 8th column as a blank on every data row', () => {
    const r = generateTexturaSovSetupCsv(
      [{ textura_phase_code: 100, description: 'x', scheduled_value: 1 }],
      { is_test_project: false },
    );
    const dataRow = r.csv.split('\r\n')[1];
    expect(dataRow.split(',')).toHaveLength(8);
    expect(dataRow.endsWith(',')).toBe(true); // blank 8th col
  });
});

describe('BAN-337 generateTexturaInvoiceCsv', () => {
  it('renders the 7-column header byte-exact', () => {
    const csv = generateTexturaInvoiceCsv([], { is_test_project: false });
    expect(csv.split('\r\n')[0]).toBe(INVOICE_HEADER_ROW.join(','));
    expect(INVOICE_HEADER_ROW).toHaveLength(7);
  });

  it('quotes every numeric column as a string', () => {
    const csv = generateTexturaInvoiceCsv(
      [{
        item_number: '100',
        description: 'Glazing',
        scheduled_value: 12500,
        work_this_period: 2500,
        material_stored_this_period: 0,
        retention_held_this_period: 250,
        request_previously_held: 0,
      }],
      { is_test_project: false },
    );
    const data = csv.split('\r\n')[1].split(',');
    expect(data[2]).toBe('"12500.00"');
    expect(data[3]).toBe('"2500.00"');
    expect(data[4]).toBe('"0.00"');
    expect(data[5]).toBe('"250.00"');
    expect(data[6]).toBe('"0.00"');
  });

  it('prepends the test-data watermark when is_test_project=true', () => {
    const csv = generateTexturaInvoiceCsv(
      [{
        item_number: 100, description: 'x',
        scheduled_value: 1, work_this_period: 1,
        material_stored_this_period: 0, retention_held_this_period: 0,
        request_previously_held: 0,
      }],
      { is_test_project: true },
    );
    expect(csv.split('\r\n')[0]).toBe(TEXTURA_TEST_DATA_WATERMARK_INVOICE);
  });

  it('handles null numeric inputs by quoting "0.00"', () => {
    const csv = generateTexturaInvoiceCsv(
      [{
        item_number: 1, description: 'x',
        scheduled_value: null, work_this_period: null,
        material_stored_this_period: null, retention_held_this_period: null,
        request_previously_held: null,
      }],
      { is_test_project: false },
    );
    expect(csv).toContain('"0.00"');
  });

  it('escapes commas inside description fields', () => {
    const csv = generateTexturaInvoiceCsv(
      [{
        item_number: 1, description: 'Cut, fit, install',
        scheduled_value: 1, work_this_period: 0,
        material_stored_this_period: 0, retention_held_this_period: 0,
        request_previously_held: 0,
      }],
      { is_test_project: false },
    );
    expect(csv).toContain('"Cut, fit, install"');
  });

  it('preserves descending CRLF row terminator', () => {
    const csv = generateTexturaInvoiceCsv([], { is_test_project: false });
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
