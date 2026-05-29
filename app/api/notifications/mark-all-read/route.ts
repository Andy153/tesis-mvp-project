import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isDemoUser } from '@/lib/demo-user';
import { markAllNotificationsRead } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoUser(userId)) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const updated = await markAllNotificationsRead(userId);
  return NextResponse.json({ ok: true, updated });
}
