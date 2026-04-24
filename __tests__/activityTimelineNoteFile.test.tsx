import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventCard } from '../components/ActivityTimeline';

const baseEvent = {
  event_id: 'EVT-test-note-upload',
  target_kID: 'WO-26-8296',
  event_type: 'JOB_FILE_UPLOADED',
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

describe('ActivityTimeline NOTE file upload rendering', () => {
  it('renders a file chip for the WO-26-8296 upload payload instead of raw JSON', () => {
    const uploadPayload = {
      file_name: 'SLIDING DOOR REPORT UNIT 207 WAILEA ELUA 4-24-26.docx',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      destination_subfolder: 'Correspondence',
      drive_url: 'https://docs.google.com/document/d/13pY7ihlTDD0xFpcaaZJoFOrRRsaRY/edit?usp=drivesdk&ouid=107457674890609463826&rtpof=true&sd=true',
    };

    const html = renderToStaticMarkup(
      <EventCard
        event={{ ...baseEvent, notes: JSON.stringify(uploadPayload) }}
        onResolved={() => undefined}
        userMap={{}}
      />
    );

    expect(html).toContain('SLIDING DOOR REPORT UNIT 207 WAILEA ELUA 4-24-26.docx');
    expect(html).toContain('Correspondence');
    expect(html).toContain('https://docs.google.com/document/d/13pY7ihlTDD0xFpcaaZJoFOrRRsaRY/edit?usp=drivesdk&amp;ouid=107457674890609463826&amp;rtpof=true&amp;sd=true');
    expect(html).not.toContain('&quot;file_name&quot;');
    expect(html).not.toContain('{&quot;file_name&quot;');
  });

  it('preserves plain-text NOTE rendering', () => {
    const html = renderToStaticMarkup(
      <EventCard
        event={{ ...baseEvent, event_type: 'NOTE', notes: 'quoted → accepted' }}
        onResolved={() => undefined}
        userMap={{}}
      />
    );

    expect(html).toContain('quoted → accepted');
  });

  it('preserves legacy CREW_DEMOBILIZED NOTE prefix rendering', () => {
    const html = renderToStaticMarkup(
      <EventCard
        event={{ ...baseEvent, event_type: 'NOTE', notes: '[CREW_DEMOBILIZED] Crew demobilized from site' }}
        onResolved={() => undefined}
        userMap={{}}
      />
    );

    expect(html).toContain('Crew demobilized from site');
    expect(html).toContain('Crew Demobilized');
    expect(html).not.toContain('file chip');
  });
});
