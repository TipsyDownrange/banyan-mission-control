import {
  InvalidServiceWONumberError,
  ServiceWOFolderCreationError,
  buildServiceWOId,
  isValidServiceWONumber,
  nextServiceWONumber,
  normalizeIncomingServiceWONumber,
  requireServiceWOFolderUrl,
} from '@/lib/service-wo-create';

describe('Service WO create helpers', () => {
  it('accepts only the generated YY-#### work order number format', () => {
    expect(isValidServiceWONumber('26-0001')).toBe(true);
    expect(normalizeIncomingServiceWONumber(' 26-0001 ')).toBe('26-0001');
    expect(buildServiceWOId('26-0001')).toBe('WO-26-0001');
  });

  it('rejects unsafe incoming work order numbers instead of sanitizing them into WO ids', () => {
    expect(() => normalizeIncomingServiceWONumber('B2616723')).toThrow(InvalidServiceWONumberError);
    expect(() => normalizeIncomingServiceWONumber('WO-B2616723')).toThrow(
      'Use the standard YY-#### format'
    );
    expect(() => buildServiceWOId('B2616723')).toThrow(InvalidServiceWONumberError);
  });

  it('generates the next sequential number from valid same-year rows only', () => {
    expect(nextServiceWONumber(['26-0001', '26-0010', '25-9999', 'B2616723'], '26')).toBe('26-0011');
    expect(nextServiceWONumber([], '26')).toBe('26-0001');
  });

  it('treats missing Drive folder URL as a fatal create-path failure', () => {
    expect(() => requireServiceWOFolderUrl(null)).toThrow(ServiceWOFolderCreationError);
    expect(() => requireServiceWOFolderUrl('')).toThrow('Work order was not created');
    expect(requireServiceWOFolderUrl(' https://drive.google.com/drive/folders/test ')).toBe(
      'https://drive.google.com/drive/folders/test'
    );
  });
});
