'use client';

export default function LoginPage() {
  const handleSignIn = async () => {
    const csrfRes = await fetch('/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/auth/signin/google';
    const csrf = document.createElement('input');
    csrf.type = 'hidden'; csrf.name = 'csrfToken'; csrf.value = csrfToken;
    const cb = document.createElement('input');
    cb.type = 'hidden'; cb.name = 'callbackUrl'; cb.value = '/';
    form.appendChild(csrf); form.appendChild(cb);
    document.body.appendChild(form); form.submit();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#071722 0%,#0c2330 50%,#102c39 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(94,234,212,0.6)', marginBottom: 12 }}>Kula Glass Company</div>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.04em', margin: 0, marginBottom: 8 }}>
          Banyan<span style={{ color: '#14b8a6' }}>OS</span>
        </h1>
        <div style={{ fontSize: 14, color: 'rgba(148,163,184,0.6)' }}>Mission Control</div>
      </div>
      <button onClick={handleSignIn} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', color: '#0f172a', borderRadius: 16, padding: '16px 28px', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </button>
      <p style={{ marginTop: 16, fontSize: 12, color: 'rgba(148,163,184,0.4)' }}>@kulaglass.com accounts only</p>
    </div>
  );
}
