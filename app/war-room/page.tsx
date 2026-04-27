import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import WarRoomDashboard from '@/components/WarRoomDashboard';
import { authOptions } from '@/lib/auth';
import { getWarRoomDashboardData } from '@/lib/war-room/data';

export default async function WarRoomPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase() || '';

  if (!session || !email.endsWith('@kulaglass.com')) {
    redirect('/login');
  }

  const data = await getWarRoomDashboardData();
  return <WarRoomDashboard initialData={data} />;
}
