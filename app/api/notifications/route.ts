import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { isDemoUser } from '@/lib/demo-user';
import { listNotifications } from '@/lib/notifications';
import { syncAllNotificationsForUser } from '@/lib/notifications-generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoUser(userId)) {
    return NextResponse.json({ notifications: [], unread_count: 0 });
  }

  await syncAllNotificationsForUser(userId);

  const leidasParam = req.nextUrl.searchParams.get('leidas');
  const soloNoLeidas = leidasParam === 'false';

  const { notifications, unreadCount } = await listNotifications(userId, {
    soloNoLeidas,
    limit: 100,
  });

  return NextResponse.json({
    notifications,
    unread_count: unreadCount,
  });
}
