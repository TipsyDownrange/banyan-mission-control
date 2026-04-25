import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventCard } from '../components/ActivityTimeline';

const baseEvent = {
  event_id: 'EVT-test-tm-capture',
  target_kID: 'WO-26-8294',
  event_type: 'TM_CAPTURE',
  event_occurred_at: '2026-04-24T12:00:00.000Z',
  event_recorded_at: '2026-04-24T12:00:00.000Z',
  performed_by: 'Sean Daniels',
  recorded_by: 'Sean Daniels',
  source_system: 'BANYAN_FIELD_V1',
  evidence_ref: '',
  evidence_type: '',
  location_group: '',
  unit_reference: '',
  qa_step_code: '',
  qa_status: '',
  issue_category: '',
  severity: '',
  blocking_flag: '',
  assigned_to: '',
  assigned_role: '',
  responsible_party: '',
  auto_flag: '',
  manpower_count: '',
  work_performed: '',
  delays_blockers: '',
  materials_received: '',
  inspections_visitors: '',
  weather_context: '',
  notes: '',
  environment: '',
  source_version: '',
  is_valid: '',
  issue_status: '',
  affected_count: '',
  hours_lost: '',
};

function renderExpanded(eventOverrides: Partial<typeof baseEvent> = {}) {
  const originalUseState = React.useState;
  const useStateSpy = jest.spyOn(React, 'useState');
  let callCount = 0;

  useStateSpy.mockImplementation(((initial: unknown) => {
    callCount += 1;
    if (callCount === 1) {
      return [true, jest.fn()];
    }
    return originalUseState(initial);
  }) as typeof React.useState);

  try {
    return renderToStaticMarkup(
      <EventCard
        event={{ ...baseEvent, ...eventOverrides }}
        onResolved={() => undefined}
        userMap={{}}
      />
    );
  } finally {
    useStateSpy.mockRestore();
  }
}

describe('ActivityTimeline TM_CAPTURE rendering', () => {
  it('renders signature, materials, labor, equipment, and subcontractors from the FA line-item payload', () => {
    const html = renderExpanded({
      notes: JSON.stringify({
        schema_version: '1.0',
        triggering_event_id: 'FID-1234567890ABC',
        linked_field_issue_id: 'FID-1234567890ABC',
        description: 'Extra storefront measurement requested on site.',
        labor_rows: [
          { name: 'Sean Daniels', rate_type: 'ST', hours: 1.5 },
          { name: 'Nate Nakamura', rate_type: 'OT', hours: 0.5 },
        ],
        crew: 2,
        hours_estimated: 2,
        equipment: [
          { desc: 'Scissor lift', hours: 1.25, rate_type: 'ST' },
        ],
        subcontractors: [
          { vendor: 'Island Crane', desc: 'Lift assist' },
        ],
        materials: [
          { desc: 'Bond breaker tape', qty: 50, unit: 'ft' },
          { desc: 'Sealant', qty: 2, unit: 'tube' },
        ],
        authorization_type: 'On-site Signature',
        authorized_by: 'GC Superintendent',
        authorized_by_title: 'Superintendent',
        signed_at: '2026-04-24T11:55:00.000Z',
        auth_signature_ref: 'sig-drive-id-123',
      }),
    });

    expect(html).toContain('https://drive.google.com/file/d/sig-drive-id-123/view');
    expect(html).toContain('GC Signature');
    expect(html).toContain('Bond breaker tape (50 ft)');
    expect(html).toContain('Sealant (2 tube)');
    expect(html).toContain('Labor Details');
    expect(html).toContain('Sean Daniels');
    expect(html).toContain('Nate Nakamura');
    expect(html).toContain('Equipment');
    expect(html).toContain('Scissor lift');
    expect(html).toContain('Subcontractors');
    expect(html).toContain('Island Crane');
    expect(html).toContain('FID-12345678');
  });

  it('renders only the labor table when partial TM data is present', () => {
    const html = renderExpanded({
      notes: JSON.stringify({
        schema_version: '1.0',
        labor_rows: [
          { name: 'Sean Daniels', rate_type: 'ST', hours: 2 },
        ],
        crew: 1,
        hours_estimated: 2,
        authorization_type: 'Verbal',
        authorized_by: 'Field crew',
      }),
    });

    expect(html).toContain('Labor Details');
    expect(html).toContain('Sean Daniels');
    expect(html).not.toContain('Bond breaker tape');
    expect(html).not.toContain('Equipment');
    expect(html).not.toContain('Subcontractors');
    expect(html).toContain('(no signature on file)');
  });

  it('falls back to the legacy evidence_ref when auth_signature_ref is absent', () => {
    const html = renderExpanded({
      evidence_ref: 'legacy-signature-id',
      notes: JSON.stringify({
        schema_version: '1.0',
        authorization_type: 'On-site Signature',
        authorized_by: 'Sean Daniels',
        crew: 1,
        hours_estimated: 1,
      }),
    });

    expect(html).toContain('https://drive.google.com/file/d/legacy-signature-id/view');
    expect(html).toContain('https://drive.google.com/thumbnail?id=legacy-signature-id&amp;sz=w300');
  });

  it('survives empty or malformed notes without crashing', () => {
    const emptyHtml = renderExpanded({ notes: '' });
    const malformedHtml = renderExpanded({ notes: '{"oops":' });

    expect(emptyHtml).toContain('T&amp;M');
    expect(emptyHtml).toContain('(no signature on file)');
    expect(malformedHtml).toContain('T&amp;M');
    expect(malformedHtml).toContain('(no signature on file)');
  });
});
