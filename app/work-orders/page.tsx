import Link from 'next/link';
import ServicePanel from '@/components/ServicePanel';

export default function WorkOrdersPage() {
  return (
    <main style={{ minHeight: '100dvh', background: '#f8fafc' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px 0' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#0369a1', textDecoration: 'none' }}>
          ← Mission Control
        </Link>
      </div>
      <ServicePanel />
    </main>
  );
}
