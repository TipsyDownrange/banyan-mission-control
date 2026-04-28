import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventCard } from '../components/ActivityTimeline';

const baseEvent = {
  event_id: 'EVT-test-field-issue-pdf',
  target_kID: 'WO-26-8296',
  event_type: 'FIELD_ISSUE',
  event_occurred_at: '2026-04-24T12:00:00.000Z',
  event_recorded_at: '2026-04-24T12:00:00.000Z',
  performed_by: '',
  recorded_by: '',
  source_system: '',
  evidence_ref: '',
  evidence_type: '',
  location_group: '',
  unit_reference: '',
  qa_step_code: '',
  qa_status: '',
  issue_category: 'Install',
  severity: 'HIGH',
  blocking_flag: 'FALSE',
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
  notes: 'Door track out of level.',
  environment: '',
  source_version: '',
  is_valid: '',
  issue_status: 'OPEN',
  affected_count: '',
  hours_lost: '',
  field_issue_pdf_ref: '',
};

describe('ActivityTimeline FIELD_ISSUE PDF actions', () => {
  it('shows only the read-only View PDF chip when a stored field issue PDF ref exists', () => {
    const html = renderToStaticMarkup(
      <EventCard
        event={{ ...baseEvent, field_issue_pdf_ref: 'drive-file-id_123' }}
        onResolved={() => undefined}
        userMap={{}}
      />
    );

    expect(html).toContain('View PDF');
    expect(html).toContain('https://drive.google.com/file/d/drive-file-id_123/view');
    expect(html).not.toContain('Generate PDF');
    expect(html).not.toContain('📄 PDF');
  });

  it('shows an explicit Generate PDF action when no stored field issue PDF ref exists', () => {
    const html = renderToStaticMarkup(
      <EventCard
        event={baseEvent}
        onResolved={() => undefined}
        userMap={{}}
      />
    );

    expect(html).toContain('Generate PDF');
    expect(html).not.toContain('View PDF');
    expect(html).not.toContain('📄 PDF');
  });

  it('preserves the existing Daily Report PDF action label', () => {
    const html = renderToStaticMarkup(
      <EventCard
        event={{ ...baseEvent, event_type: 'DAILY_LOG', issue_status: '', notes: '', work_performed: 'Installed frames.' }}
        onResolved={() => undefined}
        userMap={{}}
      />
    );

    expect(html).toContain('title="Regenerate PDF"');
    expect(html).toContain('📄 PDF');
  });
});
