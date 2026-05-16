import fs from 'fs';
import path from 'path';

describe('BAN-253 forecasting/scheduling route split', () => {
  it('renders Forecasting and Scheduling through distinct panels', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8');
    expect(page).toContain("activeView === 'Forecasting'   && <ForecastingPanel />");
    expect(page).toContain("activeView === 'Scheduling'     && <SuperSchedulingPanel />");
  });

  it('keeps Forecasting non-mutating by not rendering schedule slot controls', () => {
    const panel = fs.readFileSync(path.join(process.cwd(), 'components/ForecastingPanel.tsx'), 'utf8');
    expect(panel).toContain('Long-range capacity and pipeline view');
    expect(panel).not.toContain('Schedule Slot');
    expect(panel).not.toContain('QuickScheduleModal');
  });
});
