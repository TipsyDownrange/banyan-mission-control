import ServicePanel from '@/components/ServicePanel';

export default async function WorkOrderDetailRoute({ params }: { params: Promise<{ kID: string }> }) {
  const { kID } = await params;
  return <ServicePanel initialWoId={kID} />;
}
