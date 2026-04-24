import Link from 'next/link';
import ServicePanel from '@/components/ServicePanel';

export default async function WorkOrderDetailRoute({ params }: { params: Promise<{ kID: string }> }) {
  const { kID } = await params;

  return (
    <main style={{ minHeight: '100dvh', background: '#f8fafc' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px 0' }}>
        <Link href="/work-orders" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#0369a1', textDecoration: 'none' }}>
          ← All Work Orders
        </Link>
      </div>
      <ServicePanel initialWoId={decodeURIComponent(kID)} />
    </main>
  );
}
