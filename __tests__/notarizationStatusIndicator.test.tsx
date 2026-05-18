import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NotarizationStatusIndicator, {
  type NotarizationSession,
} from '../components/engagements/NotarizationStatusIndicator';

describe('BAN-322 NotarizationStatusIndicator', () => {
  it('renders nothing when notarization is not required (RF6)', () => {
    const html = renderToStaticMarkup(
      <NotarizationStatusIndicator latestNotarization={null} notarizationRequired={false} />,
    );
    expect(html).toBe('');
  });

  it('renders "Not started" muted badge when required and no session', () => {
    const html = renderToStaticMarkup(
      <NotarizationStatusIndicator latestNotarization={null} notarizationRequired={true} />,
    );
    expect(html).toContain('Notarization · Not started');
    expect(html).toContain('Required by billing format');
  });

  it('renders state-colored badge and View link when a session exists', () => {
    const session: NotarizationSession = {
      session_id: 'aaaaaaaa-1111-1111-1111-111111111111',
      state: 'IN_PROGRESS',
      provider: 'PROOF',
      provider_session_url: 'https://proof.example/session/123',
      completed_at: null,
    };
    const html = renderToStaticMarkup(
      <NotarizationStatusIndicator latestNotarization={session} notarizationRequired={true} />,
    );
    expect(html).toContain('Notarization · In Progress');
    expect(html).toContain('PROOF');
    expect(html).toContain('aaaaaaaa');
    expect(html).toContain('/notarization/aaaaaaaa-1111-1111-1111-111111111111');
    expect(html).toContain('View →');
  });

  it('falls back to raw state text for unknown notarization states', () => {
    const session: NotarizationSession = {
      session_id: 'sess', state: 'SOMETHING_ELSE', provider: 'PROOF',
      provider_session_url: null, completed_at: null,
    };
    const html = renderToStaticMarkup(
      <NotarizationStatusIndicator latestNotarization={session} notarizationRequired={true} />,
    );
    expect(html).toContain('SOMETHING ELSE');
  });
});
