import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import WarRoomDashboard from '@/components/WarRoomDashboard';
import { authOptions } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { getWarRoomDashboardData } from '@/lib/war-room/data';

export default async function WarRoomPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/login');
  }

  if (!hasPermission(session, 'WARROOM_VIEW')) {
    redirect('/?error=war_room_access');
  }

  const data = await getWarRoomDashboardData();
  return <WarRoomDashboard initialData={data} />;
}
