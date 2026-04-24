import { redirect } from 'next/navigation';

export default async function WorkOrderDetailRoute({ params }: { params: Promise<{ kID: string }> }) {
  const { kID } = await params;
  redirect(`/?wo=${encodeURIComponent(kID)}`);
}
