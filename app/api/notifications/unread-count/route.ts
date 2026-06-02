import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isDemoUser } from '@/lib/demo-user';
import { countUnreadNotifications } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Solo contador para el badge del menú (sin sync ni listado). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoUser(userId)) {
    return NextResponse.json({ unread_count: 0 });
  }

  const unread_count = await countUnreadNotifications(userId);
  return NextResponse.json({ unread_count });
}
