import React from 'react';
import { readFileSync } from 'fs';
import path from 'path';

jest.mock('@/components/ServicePanel', () => ({
  __esModule: true,
  default: jest.fn((props: Record<string, unknown>) => React.createElement('service-panel', props)),
}));

describe('Work Order routes', () => {
  it('renders the Work Orders board at /work-orders instead of redirecting to Today', async () => {
    const ServicePanel = (await import('@/components/ServicePanel')).default as jest.Mock;
    const { default: WorkOrdersPage } = await import('@/app/work-orders/page');

    const result = WorkOrdersPage() as React.ReactElement;

    expect(result.type).toBe(ServicePanel);
    expect(result.props).toEqual({});
  });

  it('renders the Work Order detail route with the requested ID', async () => {
    const ServicePanel = (await import('@/components/ServicePanel')).default as jest.Mock;
    const { default: WorkOrderDetailRoute } = await import('@/app/work-orders/[kID]/page');

    const result = await WorkOrderDetailRoute({
      params: Promise.resolve({ kID: 'WO-STAGE-0001' }),
    }) as React.ReactElement;

    expect(result.type).toBe(ServicePanel);
    expect(result.props).toEqual({ initialWoId: 'WO-STAGE-0001' });
  });

  it('keeps Work Order card open/close on local panel state without App Router replace', () => {
    const source = readFileSync(path.join(process.cwd(), 'components/ServicePanel.tsx'), 'utf8');

    expect(source).not.toContain('useRouter');
    expect(source).not.toContain('router.replace');
    expect(source).toContain("window.history.replaceState(null, '', nextPath)");
    expect(source).toContain("window.history.replaceState(null, '', isStandaloneWorkOrdersRoute ? '/work-orders' : '/')");
  });
});
