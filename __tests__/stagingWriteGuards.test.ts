describe('staging write guard helpers', () => {
  let prevTargetEnv: string | undefined;
  let prevBackendSheet: string | undefined;
  let prevFaBaseUrl: string | undefined;
  let prevBidLogId: string | undefined;
  let prevCostInvoiceSheetId: string | undefined;
  let prevManpowerScheduleSheetId: string | undefined;

  beforeEach(() => {
    jest.resetModules();
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevBackendSheet = process.env.BACKEND_SHEET_ID;
    prevFaBaseUrl = process.env.FA_BASE_URL;
    prevBidLogId = process.env.STAGING_SMARTSHEET_BID_LOG_ID;
    prevCostInvoiceSheetId = process.env.STAGING_COST_INVOICE_SHEET_ID;
    prevManpowerScheduleSheetId = process.env.STAGING_MANPOWER_SCHEDULE_SHEET_ID;
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevBackendSheet === undefined) delete process.env.BACKEND_SHEET_ID;
    else process.env.BACKEND_SHEET_ID = prevBackendSheet;
    if (prevFaBaseUrl === undefined) delete process.env.FA_BASE_URL;
    else process.env.FA_BASE_URL = prevFaBaseUrl;
    if (prevBidLogId === undefined) delete process.env.STAGING_SMARTSHEET_BID_LOG_ID;
    else process.env.STAGING_SMARTSHEET_BID_LOG_ID = prevBidLogId;
    if (prevCostInvoiceSheetId === undefined) delete process.env.STAGING_COST_INVOICE_SHEET_ID;
    else process.env.STAGING_COST_INVOICE_SHEET_ID = prevCostInvoiceSheetId;
    if (prevManpowerScheduleSheetId === undefined) delete process.env.STAGING_MANPOWER_SCHEDULE_SHEET_ID;
    else process.env.STAGING_MANPOWER_SCHEDULE_SHEET_ID = prevManpowerScheduleSheetId;
  });

  it('rejects the known production backend sheet ID in staging', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

    const { getBackendSheetId } = await import('@/lib/backend-config');

    expect(() => getBackendSheetId()).toThrow(/production backend Sheet/);
  });

  it('keeps production backend behavior unchanged', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    process.env.BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

    const { getBackendSheetId } = await import('@/lib/backend-config');

    expect(getBackendSheetId()).toBe('137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU');
  });

  it('requires staging external targets instead of falling back to production IDs', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    delete process.env.FA_BASE_URL;
    delete process.env.STAGING_SMARTSHEET_BID_LOG_ID;
    delete process.env.STAGING_COST_INVOICE_SHEET_ID;
    delete process.env.STAGING_MANPOWER_SCHEDULE_SHEET_ID;

    const {
      getBidLogSheetId,
      getCostInvoiceSheetId,
      getFieldAppBaseUrl,
      getManpowerScheduleSheetId,
    } = await import('@/lib/env');

    expect(() => getFieldAppBaseUrl()).toThrow(/FA_BASE_URL/);
    expect(() => getBidLogSheetId()).toThrow(/STAGING_SMARTSHEET_BID_LOG_ID/);
    expect(() => getCostInvoiceSheetId()).toThrow(/STAGING_COST_INVOICE_SHEET_ID/);
    expect(() => getManpowerScheduleSheetId()).toThrow(/STAGING_MANPOWER_SCHEDULE_SHEET_ID/);
  });

  it('keeps production external ID fallbacks unchanged', async () => {
    delete process.env.VERCEL_TARGET_ENV;

    const {
      getBidLogSheetId,
      getCostInvoiceSheetId,
      getFieldAppBaseUrl,
      getManpowerScheduleSheetId,
    } = await import('@/lib/env');

    expect(getFieldAppBaseUrl()).toBe('https://banyan-field-app-525p.vercel.app');
    expect(getBidLogSheetId()).toBe('6073963369156484');
    expect(getCostInvoiceSheetId()).toBe('1EutKs3k0Cp3UwmpmAEDV8FaSSeIklb7Lk7wufRq5YdI');
    expect(getManpowerScheduleSheetId()).toBe('1099MZ_cGYqNbMKcvoKnwNp0uXnugQPY-jPOpmsJW_wQ');
  });
});

